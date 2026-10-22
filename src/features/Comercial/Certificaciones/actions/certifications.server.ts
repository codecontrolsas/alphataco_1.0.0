'use server';

import { formatVoucherLabel } from '@/features/Comercial/Facturacion/lib/invoice-type';
import { errorMessage, fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Prisma } from '@/generated/prisma/client';
import type { certification_status } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import { fromDateOnly } from '@/shared/lib/date-only';
import { toPdfDownload } from '@/shared/lib/pdf/react-pdf.server';
import type { PdfDownload } from '@/shared/lib/pdf/types';
import { prisma } from '@/shared/lib/prisma';
import { getSessionUserId } from '@/shared/lib/session';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { isUuid } from '@/shared/lib/uuid';
import { revalidatePath } from 'next/cache';
import { certificationTotal, lineAmount } from '../lib/certification-amounts';
import { serializeCertification, serializeCertificationLine } from '../lib/serializers';
import { canTransition, isDeletable, isEditable, transitionError } from '../lib/state-machine';
import { renderCertificationPdf } from '../pdf/render-certification-pdf.server';
import { certificationFormSchema, type CertificationFormValues } from '../schemas/certification';

const logger = new Logger('features/Comercial/Certificaciones');

const COMERCIAL_PATH = '/dashboard/comercial';

/**
 * Certificación: lo trabajado para un cliente, bajo un contrato, en un período.
 *
 * El precio vigente (`is_current`) se usa **al emitir**: ahí se copia a cada línea y el
 * documento deja de mirar el catálogo. Reimprimir una certificación emitida devuelve siempre
 * los mismos importes, aunque los precios hayan cambiado diez veces desde entonces.
 *
 * Mientras está en borrador, en cambio, se recalcula contra el precio vigente cada vez que se
 * refresca: es lo que permite armarla y revisarla antes de que salga.
 */

/**
 * Estados de línea de parte diario que cuentan como trabajo hecho.
 *
 * El ticket no lo dice, así que se elige lo defendible: se certifica lo **ejecutado** y lo que
 * ya está en certificación. Lo pendiente y lo que no tiene recursos todavía no ocurrió;
 * lo cancelado y lo reprogramado no ocurrió nunca en ese período.
 */
const ESTADOS_CERTIFICABLES = ['ejecutado', 'en_certificacion'] as const;

/** Lecturas de certificaciones: exigen `view`; los importes salen `null` sin `view_prices`. */
async function readCertificationAccess(): Promise<{ canViewPrices: boolean }> {
  const [canView, canViewPrices] = await Promise.all([
    checkPermissionServer('comercial', 'certificaciones', 'view'),
    checkPermissionServer('comercial', 'certificaciones', 'view_prices'),
  ]);
  if (!canView) throw new Error('No tenés permiso para ver las certificaciones.');
  return { canViewPrices };
}

export async function getCertificationById(id: string) {
  const { canViewPrices } = await readCertificationAccess();
  const companyId = await getActiveCompanyId();

  try {
    const row = await prisma.certifications.findFirst({
      where: { id, company_id: companyId },
      select: {
        id: true,
        number: true,
        status: true,
        period_from: true,
        period_to: true,
        currency: true,
        total: true,
        notes: true,
        issued_at: true,
        confirmed_at: true,
        voided_at: true,
        voided_reason: true,
        customers: { select: { id: true, name: true } },
        customer_services: { select: { id: true, service_name: true, contract_number: true } },
        // Comprobantes que la facturan (vigentes: los anulados por NC total quedan con released_at).
        invoice_certifications: {
          select: {
            released_at: true,
            invoice: {
              select: {
                id: true,
                cbte_type: true,
                number: true,
                status: true,
                sales_point: { select: { number: true } },
              },
            },
          },
          orderBy: { invoice: { created_at: 'desc' } },
        },
        lines: {
          select: {
            id: true,
            description: true,
            quantity: true,
            unit_price: true,
            amount: true,
            service_items: { select: { id: true, item_name: true, code_item: true } },
          },
          orderBy: { created_at: 'asc' },
        },
      },
    });

    if (!row) return null;
    const serialized = serializeCertification(row);
    return {
      ...serialized,
      total: canViewPrices ? serialized.total : null,
      lines: row.lines.map((line) => {
        const serializedLine = serializeCertificationLine(line);
        return {
          ...serializedLine,
          unit_price: canViewPrices ? serializedLine.unit_price : null,
          amount: canViewPrices ? serializedLine.amount : null,
        };
      }),
      invoices: row.invoice_certifications.map((link) => ({
        id: link.invoice.id,
        label: formatVoucherLabel(link.invoice.cbte_type, link.invoice.sales_point.number, link.invoice.number),
        status: link.invoice.status,
        released: link.released_at !== null,
      })),
    };
  } catch (error) {
    logger.error('Error al obtener la certificación', { data: { error, id } });
    throw error;
  }
}

export type CertificationDetail = NonNullable<Awaited<ReturnType<typeof getCertificationById>>>;

/**
 * Número siguiente para la empresa, por año del período.
 *
 * El `@@unique([company_id, number])` es la garantía real: si dos usuarios crean al mismo
 * tiempo, una de las dos transacciones falla con P2002 en vez de repetir el número.
 */
async function nextNumber(tx: Prisma.TransactionClient, companyId: string, year: number): Promise<string> {
  const prefix = `CERT-${year}-`;
  const last = await tx.certifications.findFirst({
    where: { company_id: companyId, number: { startsWith: prefix } },
    select: { number: true },
    orderBy: { number: 'desc' },
  });
  const seq = last ? Number(last.number.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

export async function createCertification(input: CertificationFormValues): Promise<ActionResult<{ id: string }>> {
  const canCreate = await checkPermissionServer('comercial', 'certificaciones', 'create');
  if (!canCreate) return fail('No tenés permiso para crear certificaciones');

  const parsed = certificationFormSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos');
  const values = parsed.data;

  const companyId = await getActiveCompanyId();

  // `period_from/to` son @db.Date: 'YYYY-MM-DD' estricto, a medianoche UTC.
  let from: Date | null;
  let to: Date | null;
  try {
    from = fromDateOnly(values.periodFrom);
    to = fromDateOnly(values.periodTo);
  } catch {
    return fail('El período no es válido');
  }
  if (!from || !to) return fail('El período no es válido');
  if (to < from) return fail('El período no puede terminar antes de empezar');

  try {
    // Perímetro, cliente y moneda en la misma lectura: el cliente sale del contrato (no se confía en
    // el que mande el cliente) y la moneda se copia para que la certificación no cambie de moneda si
    // el contrato se edita después.
    const service = await prisma.customer_services.findFirst({
      where: { id: values.customerServiceId, customers: { company_id: companyId } },
      select: { id: true, currency: true, customer_id: true },
    });
    if (!service || !service.customer_id) return fail('Contrato no encontrado');
    const customerId = service.customer_id;

    const created = await prisma.$transaction(async (tx) => {
      const number = await nextNumber(tx, companyId, from.getUTCFullYear());
      return tx.certifications.create({
        data: {
          customer_id: customerId,
          customer_service_id: values.customerServiceId,
          number,
          period_from: from,
          period_to: to,
          currency: service.currency,
          notes: values.notes?.trim() || null,
        },
        select: { id: true },
      });
    });

    logger.info('Certificación creada', { data: { id: created.id } });
    revalidatePath(COMERCIAL_PATH);
    return ok({ id: created.id });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return fail('Se generó el mismo número al mismo tiempo que otra certificación. Probá de nuevo.');
    }
    logger.error('Error al crear la certificación', { data: { error } });
    return fail(errorMessage(error, 'Error al crear la certificación'));
  }
}

/**
 * Rearma las líneas del borrador con lo trabajado en el período, a precio vigente.
 *
 * Reemplaza las líneas enteras a propósito: son un derivado de los partes diarios, no una
 * asignación que el usuario edite. No aplica la regla de "altas y bajas explícitas", que existe
 * para las pivotes donde la ausencia de un id significaría borrar algo que el usuario cargó.
 */
export async function refreshCertificationLines(id: string): Promise<ActionResult<{ lines: number }>> {
  const canUpdate = await checkPermissionServer('comercial', 'certificaciones', 'update');
  if (!canUpdate) return fail('No tenés permiso para modificar certificaciones');

  const companyId = await getActiveCompanyId();

  try {
    const cert = await prisma.certifications.findFirst({
      where: { id, company_id: companyId },
      select: {
        id: true,
        status: true,
        customer_id: true,
        customer_service_id: true,
        period_from: true,
        period_to: true,
      },
    });
    if (!cert) return fail('Certificación no encontrada');
    if (!isEditable(cert.status)) {
      return fail('Sólo un borrador se recalcula: una certificación emitida no se toca');
    }

    const rows = await prisma.dailyreportrows.findMany({
      where: {
        customer_id: cert.customer_id,
        service_id: cert.customer_service_id,
        status: { in: [...ESTADOS_CERTIFICABLES] },
        item_id: { not: null },
        dailyreport: { company_id: companyId, date: { gte: cert.period_from, lte: cert.period_to } },
        // Lo ya incluido en otra certificación vigente no se vuelve a certificar (ni a facturar).
        // El índice `uq_certification_lines_live_row` es la red de seguridad si dos refrescos corren a la vez.
        certification_lines: { none: { is_live: true, certification_id: { not: id } } },
      },
      select: {
        id: true,
        quantity: true,
        description: true,
        item_id: true,
        service_items: { select: { id: true, item_name: true, item_price: true } },
      },
      orderBy: { id: 'asc' },
    });

    const total = await prisma.$transaction(async (tx) => {
      await tx.certification_lines.deleteMany({ where: { certification_id: id } });

      const amounts: Prisma.Decimal[] = [];
      for (const row of rows) {
        if (!row.service_items) continue;
        // En borrador el precio se toma del vigente. Se congela recién al emitir.
        const amount = lineAmount(row.quantity, row.service_items.item_price);
        amounts.push(amount);
        await tx.certification_lines.create({
          data: {
            certification_id: id,
            dailyreportrow_id: row.id,
            service_item_id: row.service_items.id,
            description: row.description?.trim() || row.service_items.item_name,
            quantity: row.quantity,
            unit_price: row.service_items.item_price,
            amount,
          },
        });
      }

      const sum = certificationTotal(amounts);
      await tx.certifications.update({ where: { id }, data: { total: sum } });
      return amounts.length;
    });

    logger.info('Líneas de certificación recalculadas', { data: { id, lines: total } });
    revalidatePath(COMERCIAL_PATH);
    return ok({ lines: total });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return fail('Otra certificación tomó parte de estos partes al mismo tiempo. Refrescá de nuevo.');
    }
    logger.error('Error al recalcular las líneas', { data: { error, id } });
    return fail(errorMessage(error, 'Error al recalcular las líneas'));
  }
}

/**
 * Cambio de estado con la máquina de estados y el permiso que corresponda.
 *
 * El `UPDATE` exige que el estado siga siendo el leído: si otra acción lo cambió en el medio
 * (p. ej. la factura la pasó a facturada), no se pisa.
 */
async function transition(
  id: string,
  to: certification_status,
  extra: (userId: string | null) => Prisma.certificationsUpdateManyMutationInput,
  afterUpdate?: (tx: Prisma.TransactionClient) => Promise<unknown>
): Promise<ActionResult<null>> {
  const companyId = await getActiveCompanyId();

  try {
    const cert = await prisma.certifications.findFirst({
      where: { id, company_id: companyId },
      select: { id: true, status: true },
    });
    if (!cert) return fail('Certificación no encontrada');
    if (!canTransition(cert.status, to)) return fail(transitionError(cert.status, to));

    const userId = await getSessionUserId();
    const updated = await prisma.$transaction(async (tx) => {
      const { count } = await tx.certifications.updateMany({
        where: { id, status: cert.status },
        data: { status: to, ...extra(userId) },
      });
      if (count === 1 && afterUpdate) await afterUpdate(tx);
      return count;
    });
    if (updated !== 1) return fail('La certificación cambió de estado mientras tanto. Actualizá la pantalla.');

    logger.info('Certificación cambió de estado', { data: { id, de: cert.status, a: to } });
    revalidatePath(COMERCIAL_PATH);
    return ok(null);
  } catch (error) {
    logger.error('Error al cambiar el estado de la certificación', { data: { error, id, to } });
    return fail(errorMessage(error, 'Error al cambiar el estado de la certificación'));
  }
}

/**
 * Emite la certificación: **acá se congela el precio**.
 *
 * Se releen los precios vigentes y se copian a cada línea junto con su importe y el total. A
 * partir de este momento el documento no vuelve a mirar el catálogo, así que actualizar precios
 * después no cambia lo ya emitido.
 */
export async function issueCertification(id: string): Promise<ActionResult<{ total: string | null }>> {
  const canUpdate = await checkPermissionServer('comercial', 'certificaciones', 'update');
  if (!canUpdate) return fail('No tenés permiso para emitir certificaciones');

  const companyId = await getActiveCompanyId();

  try {
    const cert = await prisma.certifications.findFirst({
      where: { id, company_id: companyId },
      select: {
        id: true,
        status: true,
        lines: { select: { id: true, quantity: true, service_items: { select: { item_price: true } } } },
      },
    });
    if (!cert) return fail('Certificación no encontrada');
    if (!canTransition(cert.status, 'emitida')) return fail(transitionError(cert.status, 'emitida'));
    if (cert.lines.length === 0) return fail('No se puede emitir una certificación sin líneas');

    const issuedBy = await getSessionUserId();

    const total = await prisma.$transaction(async (tx) => {
      // Solo se emite si sigue en el estado leído: si otra acción lo cambió, no se pisa.
      const { count } = await tx.certifications.updateMany({
        where: { id, company_id: companyId, status: 'borrador' },
        data: { status: 'emitida', issued_at: new Date(), issued_by: issuedBy },
      });
      if (count !== 1) return null;
      const amounts: Prisma.Decimal[] = [];
      for (const line of cert.lines) {
        const unitPrice = line.service_items.item_price;
        const amount = lineAmount(line.quantity, unitPrice);
        amounts.push(amount);
        await tx.certification_lines.update({
          where: { id: line.id },
          data: { unit_price: unitPrice, amount },
        });
      }

      const sum = certificationTotal(amounts);
      await tx.certifications.update({ where: { id }, data: { total: sum } });
      return sum;
    });

    if (total === null) return fail('La certificación cambió de estado mientras tanto. Actualizá la pantalla.');

    logger.info('Certificación emitida', { data: { id, total: total.toString() } });
    revalidatePath(COMERCIAL_PATH);
    // Sin `view_prices` el total emitido no sale del servidor.
    const canViewPrices = await checkPermissionServer('comercial', 'certificaciones', 'view_prices');
    return ok({ total: canViewPrices ? total.toFixed(2) : null });
  } catch (error) {
    logger.error('Error al emitir la certificación', { data: { error, id } });
    return fail(errorMessage(error, 'Error al emitir la certificación'));
  }
}

export async function confirmCertification(id: string): Promise<ActionResult<null>> {
  const canApprove = await checkPermissionServer('comercial', 'certificaciones', 'approve');
  if (!canApprove) return fail('No tenés permiso para confirmar certificaciones');

  return transition(id, 'confirmada', (userId) => ({ confirmed_at: new Date(), confirmed_by: userId }));
}

export async function voidCertification(id: string, reason: string): Promise<ActionResult<null>> {
  const canDelete = await checkPermissionServer('comercial', 'certificaciones', 'delete');
  if (!canDelete) return fail('No tenés permiso para anular certificaciones');

  const motivo = reason?.trim();
  // Anular sin motivo deja un documento muerto sin explicación seis meses después.
  if (!motivo) return fail('Hay que indicar el motivo de la anulación');

  // Una certificación incluida en un comprobante vivo (borrador, en emisión o pendiente) no se
  // anula: el comprobante quedaría con una certificación anulada adentro. Primero hay que
  // quitarla del borrador o descartarlo.
  const companyId = await getActiveCompanyId();
  const inInvoice = await prisma.invoice_certifications.findFirst({
    where: {
      certification_id: id,
      released_at: null,
      certification: { company_id: companyId },
      invoice: { status: { in: ['borrador', 'rechazada', 'emitiendo', 'pendiente'] } },
    },
    select: { invoice: { select: { cbte_type: true, sales_point: { select: { number: true } }, number: true } } },
  });
  if (inInvoice) {
    const label = formatVoucherLabel(
      inInvoice.invoice.cbte_type,
      inInvoice.invoice.sales_point.number,
      inInvoice.invoice.number
    );
    return fail(
      `La certificación está incluida en ${label} (sin emitir). Quitala de ese comprobante o descartalo antes de anularla.`
    );
  }

  return transition(
    id,
    'anulada',
    (userId) => ({
      voided_at: new Date(),
      voided_by: userId,
      voided_reason: motivo,
    }),
    // Las líneas de una anulada dejan de reservar sus partes: se pueden volver a certificar.
    (tx) => tx.certification_lines.updateMany({ where: { certification_id: id }, data: { is_live: false } })
  );
}

/** Sólo un borrador se elimina. Lo emitido se anula, que deja rastro del número usado. */
export async function deleteCertification(id: string): Promise<ActionResult<null>> {
  const canDelete = await checkPermissionServer('comercial', 'certificaciones', 'delete');
  if (!canDelete) return fail('No tenés permiso para eliminar certificaciones');

  const companyId = await getActiveCompanyId();

  try {
    const cert = await prisma.certifications.findFirst({
      where: { id, company_id: companyId },
      select: { id: true, status: true },
    });
    if (!cert) return fail('Certificación no encontrada');
    if (!isDeletable(cert.status)) {
      return fail('Sólo un borrador se elimina. Una certificación emitida se anula, no se borra');
    }

    await prisma.certifications.delete({ where: { id } });
    logger.info('Borrador de certificación eliminado', { data: { id } });
    revalidatePath(COMERCIAL_PATH);
    return ok(null);
  } catch (error) {
    logger.error('Error al eliminar la certificación', { data: { error, id } });
    return fail(errorMessage(error, 'Error al eliminar la certificación'));
  }
}

/**
 * PDF de la certificación en cualquier estado. Basta con poder verla; los importes salen solo
 * con permiso de ver precios, igual que en el detalle.
 */
export async function getCertificationPdf(id: string): Promise<ActionResult<PdfDownload>> {
  const [canView, canViewPrices] = await Promise.all([
    checkPermissionServer('comercial', 'certificaciones', 'view'),
    checkPermissionServer('comercial', 'certificaciones', 'view_prices'),
  ]);
  if (!canView) return fail('No tenés permiso para ver certificaciones');
  if (!isUuid(id)) return fail('La certificación no existe');

  const companyId = await getActiveCompanyId();

  try {
    const pdf = await renderCertificationPdf(id, companyId, canViewPrices);
    if (!pdf) return fail('La certificación no existe');
    return ok(toPdfDownload(pdf));
  } catch (error) {
    logger.error('Error al generar el PDF de la certificación', { data: { error, id } });
    return fail('No se pudo generar el PDF. Intentá de nuevo; si persiste, avisá a soporte.');
  }
}
