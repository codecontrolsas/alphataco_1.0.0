'use server';

import { getFiscalDataOverview } from '@/features/Empresa/General/FiscalData/lib/fiscal-data-overview.server';
import { checkPermissionServer } from '@/features/Permissions';
import type { arca_environment } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import { toDateOnly } from '@/shared/lib/date-only';
import { prisma } from '@/shared/lib/prisma';
import { buildStorageDownloadUrl, buildStorageFileUrl } from '@/shared/lib/storage-url';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { validateLoadedInvoice } from '../lib/emission.server';
import { loadInvoice, type LoadedInvoice } from '../lib/invoice-context.server';
import { cbteLabel, formatVoucherLabel, formatVoucherNumber, kindOf, letterOf } from '../lib/invoice-type';
import { parseIssuerSnapshot, parseReceiverSnapshot, receiverVatLabel } from '../lib/snapshots';
import { INVOICE_PDF_BUCKET } from '../pdf/invoice-pdf-data';

const logger = new Logger('features/Comercial/Facturacion');

const money = (value: { toFixed(n: number): string }) => value.toFixed(2);

/** Lo que ve el editor/detalle. Decimales como texto, fechas `YYYY-MM-DD`, sin objetos de Prisma. */
function serializeInvoice(invoice: LoadedInvoice) {
  const kind = kindOf(invoice.cbte_type);
  return {
    id: invoice.id,
    status: invoice.status,
    simulated: invoice.simulated,
    environment: invoice.environment,
    kind,
    cbteType: invoice.cbte_type,
    cbteLabel: cbteLabel(invoice.cbte_type),
    letter: letterOf(invoice.cbte_type),
    number: invoice.number,
    voucherNumber: formatVoucherNumber(invoice.sales_point.number, invoice.number),
    salesPoint: invoice.sales_point,
    concept: invoice.concept,
    issueDate: toDateOnly(invoice.issue_date) ?? '',
    serviceFrom: toDateOnly(invoice.service_from),
    serviceTo: toDateOnly(invoice.service_to),
    paymentDueDate: toDateOnly(invoice.payment_due_date),
    currency: invoice.currency,
    exchangeRate: invoice.exchange_rate.toString(),
    exchangeRateDate: toDateOnly(invoice.exchange_rate_date),
    netTaxed: money(invoice.net_taxed),
    vatTotal: money(invoice.vat_total),
    total: money(invoice.total),
    vatBreakdown: invoice.vat_breakdown.map((v) => ({
      vatRateId: v.vat_rate_id,
      base: money(v.base_amount),
      amount: money(v.vat_amount),
    })),
    lines: invoice.lines.map((l) => ({
      id: l.id,
      position: l.position,
      description: l.description,
      quantity: l.quantity.toString(),
      unitPrice: l.unit_price.toString(),
      netAmount: money(l.net_amount),
      vatRateId: l.vat_rate_id,
      serviceItemId: l.service_item_id,
      certificationId: l.certification_id,
      /** Cantidad y precio vienen de una certificación: no se editan. */
      locked: l.certification_id !== null,
    })),
    certifications: invoice.certifications.map((link) => ({
      id: link.certification.id,
      number: link.certification.number,
      periodFrom: toDateOnly(link.certification.period_from),
      periodTo: toDateOnly(link.certification.period_to),
      amount: money(link.amount),
      status: link.certification.status,
      released: link.released_at !== null,
    })),
    customer: {
      id: invoice.customer.id,
      name: invoice.customer.name,
      cuit: invoice.customer.cuit.toString(),
      vatConditionId: invoice.customer.vat_condition_id,
      vatConditionLabel: receiverVatLabel(invoice.customer.vat_condition_id),
      street: invoice.customer.fiscal_street,
      city: invoice.customer.fiscal_city,
      postalCode: invoice.customer.fiscal_postal_code,
      province: invoice.customer.fiscal_province?.name ?? null,
    },
    issuerSnapshot: parseIssuerSnapshot(invoice.issuer_snapshot),
    receiverSnapshot: parseReceiverSnapshot(invoice.receiver_snapshot),
    associatedInvoice: invoice.associated_invoice
      ? {
          id: invoice.associated_invoice.id,
          label: formatVoucherLabel(
            invoice.associated_invoice.cbte_type,
            invoice.associated_invoice.sales_point.number,
            invoice.associated_invoice.number
          ),
          total: money(invoice.associated_invoice.total),
        }
      : null,
    adjustments: invoice.adjustments.map((a) => ({
      id: a.id,
      label: formatVoucherLabel(a.cbte_type, a.sales_point.number, a.number),
      kind: kindOf(a.cbte_type),
      status: a.status,
      total: money(a.total),
    })),
    cae: invoice.cae,
    caeDueDate: toDateOnly(invoice.cae_due_date),
    authorizedAt: invoice.authorized_at?.toISOString() ?? null,
    arcaObservations: Array.isArray(invoice.arca_observations)
      ? (invoice.arca_observations as { code: number; message: string }[])
      : [],
    arcaErrors: Array.isArray(invoice.arca_errors) ? (invoice.arca_errors as { code: number; message: string }[]) : [],
    needsReview: invoice.needs_review,
    reviewNote: invoice.review_note,
    hasPdf: invoice.pdf_path !== null,
    pdfUrl: invoice.pdf_path ? buildStorageFileUrl(INVOICE_PDF_BUCKET, invoice.pdf_path) : null,
    pdfDownloadUrl: invoice.pdf_path ? buildStorageDownloadUrl(INVOICE_PDF_BUCKET, invoice.pdf_path) : null,
    notes: invoice.notes,
    createdAt: invoice.created_at.toISOString(),
    updatedAt: invoice.updated_at.toISOString(),
  };
}

export type InvoiceView = ReturnType<typeof serializeInvoice>;

/** Sin `view_prices` los importes no salen del servidor (la UI además los oculta). */
function maskAmounts(view: InvoiceView): InvoiceView {
  const zero = '0.00';
  return {
    ...view,
    netTaxed: zero,
    vatTotal: zero,
    total: zero,
    vatBreakdown: view.vatBreakdown.map((v) => ({ ...v, base: zero, amount: zero })),
    lines: view.lines.map((l) => ({ ...l, unitPrice: '0', netAmount: zero })),
    certifications: view.certifications.map((c) => ({ ...c, amount: zero })),
    associatedInvoice: view.associatedInvoice ? { ...view.associatedInvoice, total: zero } : null,
    adjustments: view.adjustments.map((a) => ({ ...a, total: zero })),
    pdfUrl: null,
    pdfDownloadUrl: null,
  };
}

/**
 * Comprobante con todo lo que necesitan el editor y el detalle: la letra derivada y su
 * explicación, los puntos de venta para elegir, lo que falta para poder emitir y el saldo
 * acreditable (si es una NC). `null` si no existe o no es de la empresa activa.
 */
export async function getInvoiceForEditor(id: string) {
  const canView = await checkPermissionServer('comercial', 'facturacion', 'view');
  if (!canView) return null;
  const companyId = await getActiveCompanyId();
  try {
    const invoice = await loadInvoice(id, companyId);
    if (!invoice) return null;

    const [validation, overview, salesPoints] = await Promise.all([
      validateLoadedInvoice(invoice),
      getFiscalDataOverview(),
      prisma.sales_points.findMany({
        where: { company_id: companyId, OR: [{ is_active: true }, { id: invoice.sales_point_id }] },
        select: { id: true, number: true, name: true, is_active: true },
        orderBy: { number: 'asc' },
      }),
    ]);

    const canViewPrices = await checkPermissionServer('comercial', 'facturacion', 'view_prices');
    const view = canViewPrices ? serializeInvoice(invoice) : maskAmounts(serializeInvoice(invoice));
    const letterResult = validation.letter;
    const problems = validation.problems;
    const credit = validation.credit;

    return {
      invoice: view,
      letter: letterResult,
      salesPoints,
      issueProblems: problems,
      creditable: credit,
      fiscal: {
        environment: overview.environment,
        simulated: overview.arcaSimulated,
        readiness: overview.readiness,
      },
    };
  } catch (error) {
    logger.error('Error al obtener el comprobante', { data: { error, id } });
    throw error;
  }
}

export type InvoiceEditorData = NonNullable<Awaited<ReturnType<typeof getInvoiceForEditor>>>;

/**
 * Certificaciones que todavía se pueden facturar en el ambiente: confirmadas y sin un vínculo
 * vigente a otro comprobante de ese ambiente (un borrador ya las reserva).
 */
function invoiceableWhere(companyId: string, env: arca_environment) {
  return {
    company_id: companyId,
    status: 'confirmada' as const,
    invoice_certifications: { none: { environment: env, released_at: null } },
  };
}

/** Clientes con certificaciones facturables y cuántas tiene cada uno (para el selector). */
export async function getInvoiceableCustomers() {
  const canView = await checkPermissionServer('comercial', 'facturacion', 'view');
  if (!canView) return [];
  const companyId = await getActiveCompanyId();
  const overview = await getFiscalDataOverview();
  const groups = await prisma.certifications.groupBy({
    by: ['customer_id'],
    where: invoiceableWhere(companyId, overview.environment),
    _count: { _all: true },
  });
  if (groups.length === 0) return [];
  const customers = await prisma.customers.findMany({
    where: { id: { in: groups.map((g) => g.customer_id) }, company_id: companyId },
    select: { id: true, name: true, cuit: true },
    orderBy: { name: 'asc' },
  });
  const counts = new Map(groups.map((g) => [g.customer_id, g._count._all]));
  return customers.map((c) => ({ id: c.id, name: c.name, cuit: c.cuit.toString(), count: counts.get(c.id) ?? 0 }));
}

/** Certificaciones facturables de un cliente, para tildar las que van en la factura. */
export async function getInvoiceableCertifications(customerId: string) {
  const canView = await checkPermissionServer('comercial', 'facturacion', 'view');
  if (!canView) return [];
  const canViewPrices = await checkPermissionServer('comercial', 'facturacion', 'view_prices');
  const companyId = await getActiveCompanyId();
  const overview = await getFiscalDataOverview();
  const rows = await prisma.certifications.findMany({
    where: { ...invoiceableWhere(companyId, overview.environment), customer_id: customerId },
    select: {
      id: true,
      number: true,
      period_from: true,
      period_to: true,
      currency: true,
      total: true,
      customer_services: { select: { service_name: true, contract_number: true } },
    },
    orderBy: [{ currency: 'asc' }, { period_from: 'asc' }],
  });
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    periodFrom: toDateOnly(r.period_from),
    periodTo: toDateOnly(r.period_to),
    currency: r.currency,
    // Sin `view_prices` el importe no sale del servidor.
    total: canViewPrices ? money(r.total) : null,
    contract: r.customer_services.service_name,
    contractNumber: r.customer_services.contract_number,
  }));
}

/** Clientes de la empresa (factura manual). */
export async function getCustomersForManualInvoice() {
  const canCreate = await checkPermissionServer('comercial', 'facturacion', 'create');
  if (!canCreate) return [];
  const companyId = await getActiveCompanyId();
  const rows = await prisma.customers.findMany({
    where: { company_id: companyId, is_active: true },
    select: { id: true, name: true, cuit: true, vat_condition_id: true },
    orderBy: { name: 'asc' },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    cuit: c.cuit.toString(),
    hasFiscalData: c.vat_condition_id !== null,
  }));
}
