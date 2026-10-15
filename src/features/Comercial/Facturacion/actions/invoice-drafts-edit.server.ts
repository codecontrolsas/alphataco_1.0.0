'use server';

import { errorMessage, fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions';
import { Logger } from '@/lib/logger';
import { isVatRateId } from '@/shared/lib/arca/catalogs';
import { fromDateOnly } from '@/shared/lib/date-only';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import { loadIssuer } from '../lib/invoice-context.server';
import { COMERCIAL_PATH, denyUnless, writeLinesAndTotals, type LineRow } from '../lib/invoice-draft-shared.server';
import { PRICE_SCALE, QUANTITY_SCALE, formatScaled, lineNet, parseScaled } from '../lib/invoice-math';
import { isDeletable, isEditable } from '../lib/invoice-state-machine';
import { cbteTypeOf, kindOf, letterOf, resolveLetter } from '../lib/invoice-type';
import { invoiceDraftSchema, type InvoiceDraftInput } from '../schemas/invoice';

const logger = new Logger('features/Comercial/Facturacion/drafts');

/**
 * Guarda el borrador. Valida FORMATO, no completitud. Las líneas de certificaciones conservan
 * cantidad, precio e importe de la base (solo cambian descripción y alícuota); las manuales se
 * recalculan con la misma fórmula del editor. La letra se vuelve a derivar (puede haber cambiado
 * la condición del cliente) salvo en NC/ND, que heredan la del original.
 */
export async function saveInvoiceDraft(
  id: string,
  input: InvoiceDraftInput
): Promise<ActionResult<{ total: string | null; cbteType: number }>> {
  const denied = await denyUnless('create');
  if (denied) return fail(denied);
  const parsed = invoiceDraftSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos');
  const data = parsed.data;

  const companyId = await getActiveCompanyId();
  try {
    const invoice = await prisma.invoices.findFirst({
      where: { id, company_id: companyId },
      select: {
        status: true,
        cbte_type: true,
        customer: { select: { name: true, cuit: true, vat_condition_id: true } },
        lines: {
          select: {
            id: true,
            quantity: true,
            unit_price: true,
            net_amount: true,
            certification_id: true,
            service_item_id: true,
          },
        },
      },
    });
    if (!invoice) return fail('Comprobante no encontrado');
    if (!isEditable(invoice.status)) return fail('Este comprobante ya no se puede modificar');

    const salesPoint = await prisma.sales_points.findFirst({
      where: { id: data.salesPointId, company_id: companyId },
      select: { id: true },
    });
    if (!salesPoint) return fail('Punto de venta inválido');

    const kind = kindOf(invoice.cbte_type);
    let letter = letterOf(invoice.cbte_type);
    if (kind === 'invoice') {
      const issuer = await loadIssuer(companyId);
      const resolved = resolveLetter(
        issuer.profile?.tax_condition ?? null,
        invoice.customer.vat_condition_id,
        invoice.customer.name
      );
      if (!resolved.ok) return fail(resolved.error);
      letter = resolved.letter;
    }

    const existing = new Map(invoice.lines.map((l) => [l.id, l]));
    const requestedItems = data.lines.flatMap((l) => (l.serviceItemId ? [l.serviceItemId] : []));
    const allowedItems = new Set(
      requestedItems.length > 0
        ? (
            await prisma.service_items.findMany({
              where: { id: { in: requestedItems }, company_id: companyId },
              select: { id: true },
            })
          ).map((i) => i.id)
        : []
    );
    const keptCertLines = new Set<string>();
    const lines: LineRow[] = [];
    for (const [index, line] of data.lines.entries()) {
      const vatRateId = letter === 'C' ? null : line.vatRateId;
      if (letter !== 'C' && (vatRateId === null || !isVatRateId(vatRateId))) {
        return fail(`Línea ${index + 1}: elegí la alícuota de IVA.`);
      }
      const previous = line.id ? existing.get(line.id) : undefined;
      if (previous?.certification_id) {
        keptCertLines.add(previous.id);
        lines.push({
          position: index + 1,
          description: line.description,
          quantity: previous.quantity.toString(),
          unit_price: previous.unit_price.toString(),
          net_amount: previous.net_amount.toFixed(2),
          vat_rate_id: vatRateId,
          service_item_id: previous.service_item_id,
          certification_id: previous.certification_id,
        });
        continue;
      }
      const quantity = parseScaled(line.quantity || '0', QUANTITY_SCALE);
      const unitPrice = parseScaled(line.unitPrice || '0', PRICE_SCALE);
      if (quantity === null || unitPrice === null) {
        return fail(`Línea ${index + 1}: la cantidad o el precio no son números válidos (hasta 4 decimales).`);
      }
      if (quantity < BigInt(0) || unitPrice < BigInt(0))
        return fail(`Línea ${index + 1}: la cantidad y el precio no pueden ser negativos.`);
      const quantityText = formatScaled(quantity, QUANTITY_SCALE);
      const unitPriceText = formatScaled(unitPrice, PRICE_SCALE);
      if (line.serviceItemId && !allowedItems.has(line.serviceItemId))
        return fail(`Línea ${index + 1}: el ítem no es de esta empresa.`);
      lines.push({
        position: index + 1,
        description: line.description,
        quantity: quantityText,
        unit_price: unitPriceText,
        net_amount: lineNet(quantityText, unitPriceText)!,
        vat_rate_id: vatRateId,
        service_item_id: line.serviceItemId ?? null,
        certification_id: null,
      });
    }
    const droppedCertLine = invoice.lines.find((l) => l.certification_id && !keptCertLines.has(l.id));
    if (droppedCertLine) {
      return fail('Las líneas de certificaciones no se quitan sueltas: quitá la certificación completa.');
    }

    const totals = await prisma.$transaction(async (tx) => {
      const cbteType = cbteTypeOf(letter, kind);
      await tx.invoices.update({
        where: { id },
        data: {
          cbte_type: cbteType,
          sales_point_id: data.salesPointId,
          issue_date: fromDateOnly(data.issueDate)!,
          concept: data.concept,
          service_from: fromDateOnly(data.serviceFrom),
          service_to: fromDateOnly(data.serviceTo),
          payment_due_date: fromDateOnly(data.paymentDueDate),
          notes: data.notes || null,
          // Una factura toma los datos fiscales ACTUALES del cliente; NC/ND conservan los del original.
          ...(kind === 'invoice'
            ? {
                receiver_doc_number: invoice.customer.cuit,
                receiver_vat_condition_id: invoice.customer.vat_condition_id ?? undefined,
              }
            : {}),
        },
      });
      const result = await writeLinesAndTotals(tx, id, letter, lines);
      return { total: result.total, cbteType };
    });

    revalidatePath(COMERCIAL_PATH);
    // Sin `view_prices` el total guardado no sale del servidor.
    const canViewPrices = await checkPermissionServer('comercial', 'facturacion', 'view_prices');
    return ok({ total: canViewPrices ? totals.total : null, cbteType: totals.cbteType });
  } catch (error) {
    logger.error('Error al guardar el borrador', { data: { error, id } });
    return fail(errorMessage(error, 'Error al guardar el borrador'));
  }
}

/** Quita una certificación del borrador junto con todas sus líneas, y la libera. */
export async function removeCertificationFromDraft(
  id: string,
  certificationId: string
): Promise<ActionResult<{ total: string | null }>> {
  const denied = await denyUnless('create');
  if (denied) return fail(denied);
  const companyId = await getActiveCompanyId();
  try {
    const invoice = await prisma.invoices.findFirst({
      where: { id, company_id: companyId },
      select: {
        status: true,
        cbte_type: true,
        lines: { orderBy: { position: 'asc' } },
      },
    });
    if (!invoice) return fail('Comprobante no encontrado');
    if (!isEditable(invoice.status)) return fail('Este comprobante ya no se puede modificar');

    const remaining: LineRow[] = invoice.lines
      .filter((l) => l.certification_id !== certificationId)
      .map((l, index) => ({
        position: index + 1,
        description: l.description,
        quantity: l.quantity.toString(),
        unit_price: l.unit_price.toString(),
        net_amount: l.net_amount.toFixed(2),
        vat_rate_id: l.vat_rate_id,
        service_item_id: l.service_item_id,
        certification_id: l.certification_id,
      }));

    const totals = await prisma.$transaction(async (tx) => {
      await tx.invoice_certifications.deleteMany({ where: { invoice_id: id, certification_id: certificationId } });
      return writeLinesAndTotals(tx, id, letterOf(invoice.cbte_type), remaining);
    });
    revalidatePath(COMERCIAL_PATH);
    const canViewPrices = await checkPermissionServer('comercial', 'facturacion', 'view_prices');
    return ok({ total: canViewPrices ? totals.total : null });
  } catch (error) {
    logger.error('Error al quitar la certificación del borrador', { data: { error, id, certificationId } });
    return fail(errorMessage(error, 'Error al quitar la certificación'));
  }
}

/** Descarta un borrador (o un rechazado): sus certificaciones quedan libres para facturar. */
export async function deleteInvoiceDraft(id: string): Promise<ActionResult<{ releasedCertifications: number }>> {
  const denied = await denyUnless('delete');
  if (denied) return fail(denied);
  const companyId = await getActiveCompanyId();
  try {
    const invoice = await prisma.invoices.findFirst({
      where: { id, company_id: companyId },
      select: { status: true, _count: { select: { certifications: true } } },
    });
    if (!invoice) return fail('Comprobante no encontrado');
    if (!isDeletable(invoice.status)) return fail('Solo se descarta un borrador o un comprobante rechazado');

    await prisma.invoices.delete({ where: { id } });
    logger.info('Borrador de comprobante descartado', { data: { id } });
    revalidatePath(COMERCIAL_PATH);
    return ok({ releasedCertifications: invoice._count.certifications });
  } catch (error) {
    logger.error('Error al descartar el borrador', { data: { error, id } });
    return fail(errorMessage(error, 'Error al descartar el borrador'));
  }
}
