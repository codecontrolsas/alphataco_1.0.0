'use server';

import { errorMessage, fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { getFiscalDataOverview } from '@/features/Empresa/General/FiscalData/lib/fiscal-data-overview.server';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import {
  ARCA_CURRENCY_BY_ISO,
  DEFAULT_VAT_RATE_ID,
  isSupportedCurrency,
  isVatRateId,
} from '@/shared/lib/arca/catalogs';
import { argentinaDateOnly } from '@/shared/lib/arca/dates';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { fromDateOnly, toDateOnly } from '@/shared/lib/date-only';
import { prisma } from '@/shared/lib/prisma';
import { getSessionUserId } from '@/shared/lib/session';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import moment from 'moment';
import { revalidatePath } from 'next/cache';
import { creditableRemaining, loadIssuer } from '../lib/invoice-context.server';
import { COMERCIAL_PATH, denyUnless, writeLinesAndTotals, type LineRow } from '../lib/invoice-draft-shared.server';
import { compareAmounts, sumAmounts, sumQuantities } from '../lib/invoice-math';
import { cbteLabel, cbteTypeOf, kindOf, letterOf, resolveLetter } from '../lib/invoice-type';
import {
  adjustmentSchema,
  manualInvoiceSchema,
  type AdjustmentInput,
  type ManualInvoiceInput,
} from '../schemas/invoice';

const logger = new Logger('features/Comercial/Facturacion/drafts');

/** Contexto común para crear un borrador: emisor, ambiente y punto de venta por defecto. */
async function draftContext(companyId: string) {
  const [issuer, overview, salesPoint] = await Promise.all([
    loadIssuer(companyId),
    getFiscalDataOverview(),
    prisma.sales_points.findFirst({
      where: { company_id: companyId, is_active: true },
      select: { id: true },
      orderBy: { number: 'asc' },
    }),
  ]);
  if (!issuer.profile)
    return { error: 'Primero completá los datos fiscales de la empresa (Configuración → Datos fiscales).' } as const;
  if (!salesPoint) return { error: 'Primero cargá un punto de venta (Configuración → Datos fiscales).' } as const;
  return { issuer, profile: issuer.profile, environment: overview.environment, salesPointId: salesPoint.id } as const;
}

function plusDays(dateOnly: string, days: number): string {
  return moment.utc(dateOnly).add(days, 'days').format('YYYY-MM-DD');
}
/**
 * Borrador desde certificaciones confirmadas: mismo cliente, misma moneda, ninguna ya reservada
 * en este ambiente. Cada certificación aporta una línea por ítem y precio, cuyo neto es la SUMA de
 * los importes ya redondeados de la certificación (lo que el cliente aprobó), no cantidad × precio.
 */
export async function createInvoiceDraftFromCertifications(
  certificationIds: string[]
): Promise<ActionResult<{ id: string }>> {
  const denied = await denyUnless('create');
  if (denied) return fail(denied);
  if (certificationIds.length === 0) return fail('Elegí al menos una certificación');

  const companyId = await getActiveCompanyId();
  try {
    const ctx = await draftContext(companyId);
    if ('error' in ctx) return fail(ctx.error ?? 'Configuración incompleta');

    const certifications = await prisma.certifications.findMany({
      where: { id: { in: certificationIds }, company_id: companyId },
      select: {
        id: true,
        number: true,
        status: true,
        currency: true,
        customer_id: true,
        period_from: true,
        period_to: true,
        total: true,
        customers: { select: { name: true, cuit: true, vat_condition_id: true } },
        invoice_certifications: {
          where: { environment: ctx.environment, released_at: null },
          select: { invoice: { select: { id: true, cbte_type: true, status: true, created_at: true } } },
        },
        lines: {
          select: {
            quantity: true,
            unit_price: true,
            amount: true,
            service_items: { select: { id: true, item_name: true, vat_rate_id: true } },
          },
        },
      },
      orderBy: { period_from: 'asc' },
    });
    if (certifications.length !== certificationIds.length) return fail('Alguna certificación no existe');

    const notConfirmed = certifications.find((c) => c.status !== 'confirmada');
    if (notConfirmed) return fail(`La certificación ${notConfirmed.number} no está confirmada.`);
    const reserved = certifications.find((c) => c.invoice_certifications.length > 0);
    if (reserved) {
      const other = reserved.invoice_certifications[0].invoice;
      return fail(
        `La certificación ${reserved.number} ya está en ${other.status === 'borrador' ? 'el borrador de ' : ''}${cbteLabel(other.cbte_type)} ` +
          `creado el ${formatArgentinaDay(other.created_at)}. Abrilo o descartalo antes.`
      );
    }
    const customers = new Set(certifications.map((c) => c.customer_id));
    if (customers.size > 1) return fail('Las certificaciones tienen que ser del mismo cliente.');
    const currencies = new Set(certifications.map((c) => c.currency));
    if (currencies.size > 1) return fail('Las certificaciones tienen que estar en la misma moneda.');
    const currency = certifications[0].currency;
    if (!isSupportedCurrency(currency)) return fail(`La moneda ${currency} no se puede facturar.`);

    const customer = certifications[0].customers;
    const letter = resolveLetter(ctx.profile.tax_condition, customer.vat_condition_id, customer.name);
    if (!letter.ok) return fail(letter.error);

    // Una línea por certificación + ítem + precio unitario.
    const lines: LineRow[] = [];
    for (const cert of certifications) {
      const groups = new Map<
        string,
        {
          item: (typeof cert.lines)[number]['service_items'];
          unitPrice: string;
          quantities: string[];
          amounts: string[];
        }
      >();
      for (const line of cert.lines) {
        const unitPrice = line.unit_price.toString();
        const key = `${line.service_items.id}|${unitPrice}`;
        const group = groups.get(key) ?? { item: line.service_items, unitPrice, quantities: [], amounts: [] };
        group.quantities.push(line.quantity.toFixed(4));
        group.amounts.push(line.amount.toFixed(2));
        groups.set(key, group);
      }
      const period = `${moment.utc(cert.period_from).format('DD/MM')}–${moment.utc(cert.period_to).format('DD/MM/YYYY')}`;
      for (const group of groups.values()) {
        const quantity = sumQuantities(group.quantities);
        lines.push({
          position: lines.length + 1,
          description: `${group.item.item_name} — ${cert.number} (${period})`,
          quantity,
          unit_price: group.unitPrice,
          net_amount: sumAmounts(group.amounts),
          vat_rate_id: isVatRateId(group.item.vat_rate_id) ? group.item.vat_rate_id : DEFAULT_VAT_RATE_ID,
          service_item_id: group.item.id,
          certification_id: cert.id,
        });
      }
    }

    const today = argentinaDateOnly(new Date());
    const serviceFrom = toDateOnly(certifications[0].period_from);
    const serviceTo =
      certifications
        .map((c) => toDateOnly(c.period_to) ?? '')
        .sort()
        .at(-1) ?? null;
    const userId = await getSessionUserId();

    const created = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoices.create({
        data: {
          environment: ctx.environment,
          sales_point_id: ctx.salesPointId,
          customer_id: certifications[0].customer_id,
          cbte_type: cbteTypeOf(letter.letter, 'invoice'),
          concept: 2,
          issue_date: fromDateOnly(today)!,
          service_from: fromDateOnly(serviceFrom),
          service_to: fromDateOnly(serviceTo),
          payment_due_date: fromDateOnly(plusDays(today, 30)),
          currency,
          arca_currency_id: ARCA_CURRENCY_BY_ISO[currency],
          receiver_doc_number: customer.cuit,
          receiver_vat_condition_id: customer.vat_condition_id!,
          created_by: userId,
        },
        select: { id: true },
      });
      await writeLinesAndTotals(tx, invoice.id, letter.letter, lines);
      await tx.invoice_certifications.createMany({
        data: certifications.map((c) => ({
          invoice_id: invoice.id,
          certification_id: c.id,
          environment: ctx.environment,
          amount: c.total,
        })),
      });
      return invoice;
    });

    logger.info('Borrador de factura creado desde certificaciones', {
      data: { id: created.id, certifications: certificationIds.length },
    });
    revalidatePath(COMERCIAL_PATH);
    return ok(created);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return fail('Otra factura tomó alguna de estas certificaciones al mismo tiempo. Actualizá y probá de nuevo.');
    }
    logger.error('Error al crear el borrador desde certificaciones', { data: { error, certificationIds } });
    return fail(errorMessage(error, 'Error al crear el borrador'));
  }
}

/** Borrador manual: cliente y moneda; las líneas se cargan en el editor. */
export async function createManualInvoiceDraft(input: ManualInvoiceInput): Promise<ActionResult<{ id: string }>> {
  const denied = await denyUnless('create');
  if (denied) return fail(denied);
  const parsed = manualInvoiceSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos');

  const companyId = await getActiveCompanyId();
  try {
    const ctx = await draftContext(companyId);
    if ('error' in ctx) return fail(ctx.error ?? 'Configuración incompleta');

    const customer = await prisma.customers.findFirst({
      where: { id: parsed.data.customerId, company_id: companyId },
      select: { name: true, cuit: true, vat_condition_id: true },
    });
    if (!customer) return fail('Cliente no encontrado');
    const letter = resolveLetter(ctx.profile.tax_condition, customer.vat_condition_id, customer.name);
    if (!letter.ok) return fail(letter.error);

    const currency = parsed.data.currency as keyof typeof ARCA_CURRENCY_BY_ISO;
    const today = argentinaDateOnly(new Date());
    const userId = await getSessionUserId();
    const created = await prisma.invoices.create({
      data: {
        environment: ctx.environment,
        sales_point_id: ctx.salesPointId,
        customer_id: parsed.data.customerId,
        cbte_type: cbteTypeOf(letter.letter, 'invoice'),
        concept: 2,
        issue_date: fromDateOnly(today)!,
        service_from: fromDateOnly(moment.utc(today).startOf('month').format('YYYY-MM-DD')),
        service_to: fromDateOnly(today),
        payment_due_date: fromDateOnly(plusDays(today, 30)),
        currency,
        arca_currency_id: ARCA_CURRENCY_BY_ISO[currency],
        receiver_doc_number: customer.cuit,
        receiver_vat_condition_id: customer.vat_condition_id!,
        created_by: userId,
      },
      select: { id: true },
    });

    logger.info('Borrador de factura manual creado', { data: { id: created.id } });
    revalidatePath(COMERCIAL_PATH);
    return ok(created);
  } catch (error) {
    logger.error('Error al crear el borrador manual', { data: { error } });
    return fail(errorMessage(error, 'Error al crear el borrador'));
  }
}

/**
 * Borrador de nota de crédito o débito sobre un comprobante autorizado. Hereda cliente, letra,
 * moneda, cotización congelada, punto de venta, ambiente y período. NC total: copia las líneas y
 * el saldo completo (si ya hubo NC parciales, no se puede: queda una parcial por el saldo).
 */
export async function createAdjustmentDraft(input: AdjustmentInput): Promise<ActionResult<{ id: string }>> {
  const denied = await denyUnless('create');
  if (denied) return fail(denied);
  const parsed = adjustmentSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos');
  const { originalInvoiceId, kind, mode } = parsed.data;
  if (kind === 'debit_note' && mode === 'total') return fail('La nota de débito siempre se carga con líneas propias.');

  const companyId = await getActiveCompanyId();
  try {
    const original = await prisma.invoices.findFirst({
      where: { id: originalInvoiceId, company_id: companyId },
      include: { lines: { orderBy: { position: 'asc' } } },
    });
    if (!original) return fail('Comprobante no encontrado');
    if (original.status !== 'autorizada') return fail('Solo se ajusta un comprobante autorizado');
    const originalKind = kindOf(original.cbte_type);
    if (originalKind === 'credit_note') return fail('Una nota de crédito no se ajusta con otra nota.');
    if (kind === 'credit_note' && originalKind !== 'invoice' && originalKind !== 'debit_note') {
      return fail('La nota de crédito tiene que ajustar una factura o una nota de débito.');
    }

    if (kind === 'credit_note') {
      const credit = await creditableRemaining(original.id);
      if (compareAmounts(credit.remaining, '0.00') <= 0) return fail('El comprobante ya está acreditado por completo.');
      if (mode === 'total' && credit.remaining !== credit.total) {
        return fail('Ya hay notas de crédito sobre este comprobante: cargá una parcial por el saldo.');
      }
    }

    const letter = letterOf(original.cbte_type);
    const today = argentinaDateOnly(new Date());
    const userId = await getSessionUserId();
    const firstRate =
      original.lines.find((l) => l.vat_rate_id !== null)?.vat_rate_id ?? (letter === 'C' ? null : DEFAULT_VAT_RATE_ID);

    const lines: LineRow[] =
      mode === 'total'
        ? original.lines.map((l) => ({
            position: l.position,
            description: l.description,
            quantity: l.quantity.toString(),
            unit_price: l.unit_price.toString(),
            net_amount: l.net_amount.toFixed(2),
            vat_rate_id: l.vat_rate_id,
            service_item_id: l.service_item_id,
            certification_id: null,
          }))
        : [
            {
              position: 1,
              description: kind === 'credit_note' ? 'Bonificación / ajuste' : 'Ajuste',
              quantity: '1',
              unit_price: '0',
              net_amount: '0.00',
              vat_rate_id: firstRate,
              service_item_id: null,
              certification_id: null,
            },
          ];

    const created = await prisma.$transaction(async (tx) => {
      const note = await tx.invoices.create({
        data: {
          environment: original.environment,
          sales_point_id: original.sales_point_id,
          customer_id: original.customer_id,
          cbte_type: cbteTypeOf(letter, kind),
          concept: original.concept,
          issue_date: fromDateOnly(today)!,
          service_from: original.service_from,
          service_to: original.service_to,
          payment_due_date: fromDateOnly(today),
          currency: original.currency,
          arca_currency_id: original.arca_currency_id,
          // La NC/ND usa la cotización del comprobante que ajusta.
          exchange_rate: original.exchange_rate,
          exchange_rate_date: original.exchange_rate_date,
          receiver_doc_type: original.receiver_doc_type,
          receiver_doc_number: original.receiver_doc_number,
          receiver_vat_condition_id: original.receiver_vat_condition_id,
          associated_invoice_id: original.id,
          created_by: userId,
        },
        select: { id: true },
      });
      await writeLinesAndTotals(tx, note.id, letter, lines);
      return note;
    });

    logger.info('Borrador de nota creado', { data: { id: created.id, originalInvoiceId, kind, mode } });
    revalidatePath(COMERCIAL_PATH);
    return ok(created);
  } catch (error) {
    logger.error('Error al crear la nota', { data: { error, originalInvoiceId, kind } });
    return fail(errorMessage(error, 'Error al crear la nota'));
  }
}
