'use server';

import { revalidatePath } from 'next/cache';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { ArcaAuthError, ArcaError, ArcaServiceError, ArcaTransportError } from '@/shared/lib/arca/errors';
import { checkVoucherWithArca } from '@/shared/lib/arca/server/gateway';
import type { arca_check_result } from '@/generated/prisma/enums';
import { prisma } from '@/shared/lib/prisma';
import { storageRemove, storageUpload } from '@/shared/lib/storage';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { NO_PERMISSION, UUID_RE, firstIssue, toPurchaseActionError } from '../lib/action-errors';
import { controlSupplierInvoice, type InvoiceObservation } from '../lib/invoice-control';
import { parseObservations } from '../lib/invoice-observations';
import { expectedSupplierLetter } from '../lib/invoice-letter';
import type { SupplierInvoiceStatus } from '../lib/invoice-status';
import {
  computeInvoiceLine,
  computeSupplierInvoiceTotals,
  vatBreakdown,
  vatDifferences,
} from '../lib/invoice-totals';
import {
  assertInvoiceLinesLocked,
  assertNoNegativeInvoiced,
  invoiceOrderLineIds,
  loadOrderLinesForControl,
  lockOrdersForLines,
  lockSupplierInvoice,
  supplierInvoiceLabel,
  voucherInfo,
} from '../lib/invoices';
import { assertNotInPaymentOrder, paymentOrderOfInvoice } from '../lib/payments';
import { PurchaseError } from '../lib/purchase-errors';
import { SUPPLIER_FILES_BUCKET, safeFileName } from '../lib/storage-files';
import {
  INVOICE_ATTACHMENT_MAX_BYTES,
  INVOICE_ATTACHMENT_TYPES,
  supplierInvoiceFormSchema,
  toSupplierInvoiceInput,
  type SupplierInvoiceFormValues,
  type SupplierInvoiceInput,
} from '../schemas/invoices';
import { requiredReasonSchema } from '../schemas/requests';

const logger = new Logger('features/Purchases/invoices');

const PURCHASES_PATH = '/dashboard/purchases';
const SESSION_EXPIRED = 'Tu sesión expiró. Volvé a ingresar.';
const NOT_FOUND = 'El comprobante no existe';
const RELATED_INVALID = 'La nota tiene que vincularse a una factura vigente del mismo proveedor y la misma letra';
const TRANSACTION_OPTIONS = { timeout: 20_000, maxWait: 5_000 };

function revalidate() {
  revalidatePath(PURCHASES_PATH, 'layout');
}

const decimal = (value: string) => new Prisma.Decimal(value);
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

export type SupplierInvoiceSaveResult = {
  id: string;
  label: string;
  status: SupplierInvoiceStatus;
  observations: InvoiceObservation[];
};

type WriteTx = Prisma.TransactionClient;

/**
 * Valida, controla y escribe el comprobante (alta o edicion) dentro de la transaccion. Las OC ya
 * estan lockeadas por el llamador. Devuelve los datos a guardar y el resultado del control.
 */
async function buildInvoice(
  tx: WriteTx,
  companyId: string,
  input: SupplierInvoiceInput,
  options: { invoiceId?: string; supplierChanged: boolean }
) {
  const supplier = await tx.suppliers.findFirst({
    where: { id: input.supplierId, company_id: companyId },
    select: { id: true, name: true, is_active: true, vat_condition_id: true },
  });
  if (!supplier) throw new PurchaseError('El proveedor no existe');
  if (!supplier.is_active && options.supplierChanged) throw new PurchaseError(`El proveedor ${supplier.name} está inactivo`);

  if (input.issueDate > argentinaDate()) throw new PurchaseError('La fecha de emisión no puede ser futura');
  const { letter, kind } = voucherInfo(input.cbteType);
  const label = supplierInvoiceLabel({ cbte_type: input.cbteType, sales_point: input.salesPoint, number: input.number });

  const duplicate = await tx.supplier_invoices.findFirst({
    where: {
      company_id: companyId,
      supplier_id: supplier.id,
      cbte_type: input.cbteType,
      sales_point: input.salesPoint,
      number: BigInt(input.number),
      status: { not: 'CANCELLED' },
      ...(options.invoiceId ? { id: { not: options.invoiceId } } : {}),
    },
    select: { id: true },
  });
  if (duplicate) throw new PurchaseError(`Ya está cargada la ${label} de ${supplier.name}`);

  if (input.relatedInvoiceId) {
    if (!UUID_RE.test(input.relatedInvoiceId)) throw new PurchaseError(RELATED_INVALID);
    const related = await tx.supplier_invoices.findFirst({
      where: { id: input.relatedInvoiceId, company_id: companyId, supplier_id: supplier.id, status: { not: 'CANCELLED' } },
      select: { cbte_type: true },
    });
    const info = related ? voucherInfo(related.cbte_type) : null;
    if (!info || info.kind !== 'invoice' || info.letter !== letter || input.relatedInvoiceId === options.invoiceId) {
      throw new PurchaseError(RELATED_INVALID);
    }
  }

  const categoryIds = [...new Set(input.lines.flatMap((l) => (l.kind === 'expense' ? [l.expenseCategoryId] : [])))];
  if (categoryIds.some((id) => !UUID_RE.test(id))) throw new PurchaseError('El concepto de gasto no existe');
  if (categoryIds.length > 0) {
    const found = await tx.purchase_expense_categories.count({ where: { id: { in: categoryIds }, company_id: companyId } });
    if (found !== categoryIds.length) throw new PurchaseError('El concepto de gasto no existe');
  }
  const provinceIds = [...new Set(input.taxes.flatMap((t) => (t.provinceId ? [t.provinceId] : [])))];
  if (provinceIds.some((id) => !/^\d+$/.test(id))) throw new PurchaseError('La provincia no existe');
  if (provinceIds.length > 0) {
    const found = await tx.provinces.count({ where: { id: { in: provinceIds.map(BigInt) } } });
    if (found !== provinceIds.length) throw new PurchaseError('La provincia no existe');
  }

  const amounts = input.lines.map((line, i) => {
    const computed =
      line.kind === 'order'
        ? computeInvoiceLine({ letter, quantity: line.quantity, unitPrice: line.unitPrice, vatRateId: line.vatRateId })
        : computeInvoiceLine({ letter, net: line.net, vatRateId: line.vatRateId });
    if (!computed) throw new PurchaseError(`Línea ${i + 1}: revisá la cantidad, el importe y la alícuota`);
    return { ...computed, vatRateId: letter === 'C' ? null : line.vatRateId };
  });

  // Bases desde las lineas; el IVA de cada alicuota es el informado (si vino) o el calculado.
  const vat = vatBreakdown(amounts, letter).map((computed) => {
    const informed = input.vat.find((v) => v.vatRateId === computed.vatRateId);
    return { ...computed, amount: informed?.amount ?? computed.amount };
  });

  const fiscal = await tx.company_fiscal_profiles.findUnique({ where: { company_id: companyId }, select: { tax_condition: true } });
  const controlLines = await loadOrderLinesForControl(tx, companyId, supplier.id, input, { excludeInvoiceId: options.invoiceId });
  const control = controlSupplierInvoice({
    kind,
    letter,
    expectedLetter: expectedSupplierLetter({
      supplierVatConditionId: supplier.vat_condition_id,
      supplierName: supplier.name,
      companyTaxCondition: fiscal?.tax_condition ?? null,
    }),
    vatDifferences: vatDifferences(vat),
    lines: controlLines,
  });
  if (control.errors.length > 0) throw new PurchaseError(control.errors.join('; '));

  const totals = computeSupplierInvoiceTotals({
    lines: amounts,
    vat,
    untaxed: input.untaxed,
    exempt: input.exempt,
    taxes: input.taxes,
  });

  const status: SupplierInvoiceStatus = control.observations.length > 0 ? 'OBSERVED' : 'CONFORMING';
  const header = {
    supplier_id: supplier.id,
    cbte_type: input.cbteType,
    sales_point: input.salesPoint,
    number: BigInt(input.number),
    issue_date: day(input.issueDate),
    due_date: input.dueDate ? day(input.dueDate) : null,
    vat_period: input.vatPeriod,
    cae: input.cae,
    cae_due_date: input.caeDueDate ? day(input.caeDueDate) : null,
    net_taxed: decimal(totals.netTaxed),
    net_untaxed: decimal(totals.netUntaxed),
    exempt: decimal(totals.exempt),
    vat_total: decimal(totals.vatTotal),
    vat_perceptions: decimal(totals.vatPerceptions),
    gross_income_perceptions: decimal(totals.grossIncomePerceptions),
    other_taxes: decimal(totals.otherTaxes),
    total: decimal(totals.total),
    related_invoice_id: input.relatedInvoiceId,
    status,
    observations: control.observations as Prisma.InputJsonValue,
    notes: input.notes,
  };
  const children = {
    lines: input.lines.map((line, i) => ({
      position: i + 1,
      order_line_id: line.kind === 'order' ? line.orderLineId : null,
      quantity: line.kind === 'order' ? decimal(line.quantity) : null,
      unit_price: line.kind === 'order' ? decimal(line.unitPrice) : null,
      expense_category_id: line.kind === 'expense' ? line.expenseCategoryId : null,
      description: line.kind === 'expense' ? line.description : null,
      vat_rate_id: amounts[i]!.vatRateId,
      net_total: decimal(amounts[i]!.netTotal),
      vat_amount: decimal(amounts[i]!.vatAmount),
    })),
    vat: vat.map((v) => ({ vat_rate_id: v.vatRateId, base: decimal(v.base), amount: decimal(v.amount) })),
    taxes: input.taxes.map((t) => ({
      kind: t.kind,
      province_id: t.provinceId ? BigInt(t.provinceId) : null,
      description: t.description,
      amount: decimal(t.amount),
    })),
  };
  return { header, children, label, status, observations: control.observations };
}

function parseForm(values: SupplierInvoiceFormValues): SupplierInvoiceInput | string {
  const parsed = supplierInvoiceFormSchema.safeParse(values);
  if (!parsed.success) return firstIssue(parsed.error);
  return toSupplierInvoiceInput(parsed.data);
}

const orderLineIdsOf = (input: SupplierInvoiceInput) => input.lines.flatMap((l) => (l.kind === 'order' ? [l.orderLineId] : []));

/**
 * Carga un comprobante (spec Compras etapa 4 §3). En UNA transaccion: lock de las OC de sus
 * lineas -> validaciones -> control -> alta. Queda CONFORMING u OBSERVED segun el control.
 */
export async function createSupplierInvoice(values: SupplierInvoiceFormValues): Promise<ActionResult<SupplierInvoiceSaveResult>> {
  if (!(await checkPermissionServer('compras', 'facturas', 'create'))) return fail(NO_PERMISSION);
  const input = parseForm(values);
  if (typeof input === 'string') return fail(input);
  if (orderLineIdsOf(input).some((id) => !UUID_RE.test(id))) return fail('La línea de OC no existe');
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();

  try {
    const result = await withActor(
      profile.credentialId,
      async (tx) => {
        await lockOrdersForLines(tx, companyId, orderLineIdsOf(input));
        const built = await buildInvoice(tx, companyId, input, { supplierChanged: true });
        const created = await tx.supplier_invoices.create({
          data: {
            ...built.header,
            created_by: profile.id,
            lines: { create: built.children.lines },
            vat: { create: built.children.vat },
            taxes: { create: built.children.taxes },
          },
          select: { id: true },
        });
        return { id: created.id, label: built.label, status: built.status, observations: built.observations };
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidate();
    return ok(result);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return fail('Ese comprobante ya está cargado');
    }
    return toPurchaseActionError(error, logger, 'cargar el comprobante');
  }
}

/**
 * Edita un comprobante vigente: reemplaza lineas, alicuotas y tributos, vuelve a controlar y borra
 * la aprobacion o el rechazo. Lockea las OC de antes y de despues.
 */
export async function updateSupplierInvoice(
  id: string,
  values: SupplierInvoiceFormValues
): Promise<ActionResult<SupplierInvoiceSaveResult>> {
  if (!(await checkPermissionServer('compras', 'facturas', 'update'))) return fail(NO_PERMISSION);
  if (!UUID_RE.test(id)) return fail(NOT_FOUND);
  const input = parseForm(values);
  if (typeof input === 'string') return fail(input);
  if (orderLineIdsOf(input).some((lineId) => !UUID_RE.test(lineId))) return fail('La línea de OC no existe');
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();

  try {
    const result = await withActor(
      profile.credentialId,
      async (tx) => {
        const previous = await invoiceOrderLineIds(tx, companyId, id);
        const lockedOrders = await lockOrdersForLines(tx, companyId, [...previous, ...orderLineIdsOf(input)]);
        const locked = await lockSupplierInvoice(tx, companyId, id);
        await assertInvoiceLinesLocked(tx, id, lockedOrders);
        await assertNotInPaymentOrder(tx, id);
        const current = await tx.supplier_invoices.findUniqueOrThrow({
          where: { id },
          select: {
            supplier_id: true,
            cbte_type: true,
            sales_point: true,
            number: true,
            issue_date: true,
            total: true,
            cae: true,
            arca_check_result: true,
            observations: true,
          },
        });
        const built = await buildInvoice(tx, companyId, input, {
          invoiceId: id,
          supplierChanged: locked.supplierId !== input.supplierId,
        });
        // Lo que ARCA constato (o rechazo) vale mientras no cambien los datos constatados.
        const checkedDataChanged =
          current.supplier_id !== built.header.supplier_id ||
          current.cbte_type !== built.header.cbte_type ||
          current.sales_point !== built.header.sales_point ||
          current.number !== built.header.number ||
          current.issue_date.getTime() !== built.header.issue_date.getTime() ||
          !current.total.equals(built.header.total) ||
          current.cae !== built.header.cae;
        let { status, observations } = built;
        if (!checkedDataChanged && current.arca_check_result === 'REJECTED') {
          const arca = parseObservations(current.observations).filter((o) => o.code === 'ARCA');
          observations = [...observations, ...arca];
          if (arca.length > 0) status = 'OBSERVED';
        }
        await tx.supplier_invoice_lines.deleteMany({ where: { invoice_id: id } });
        await tx.supplier_invoice_vat.deleteMany({ where: { invoice_id: id } });
        await tx.supplier_invoice_taxes.deleteMany({ where: { invoice_id: id } });
        await tx.supplier_invoices.update({
          where: { id },
          data: {
            ...built.header,
            status,
            observations: observations as Prisma.InputJsonValue,
            ...(checkedDataChanged ? { arca_check_result: null, arca_checked_at: null, arca_check_detail: null } : {}),
            updated_by: profile.id,
            resolved_by: null,
            resolved_at: null,
            resolution_comment: null,
            lines: { create: built.children.lines },
            vat: { create: built.children.vat },
            taxes: { create: built.children.taxes },
          },
        });
        await assertNoNegativeInvoiced(tx, [...previous, ...orderLineIdsOf(input)]);
        return { id, label: built.label, status, observations };
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidate();
    return ok(result);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return fail('Ese comprobante ya está cargado');
    }
    return toPurchaseActionError(error, logger, 'editar el comprobante');
  }
}

/** Adjunta el PDF del comprobante. El archivo anterior no se borra (queda en el storage). */
export async function uploadSupplierInvoiceAttachment(id: string, formData: FormData): Promise<ActionResult> {
  const [canCreate, canUpdate] = await Promise.all([
    checkPermissionServer('compras', 'facturas', 'create'),
    checkPermissionServer('compras', 'facturas', 'update'),
  ]);
  if (!canCreate && !canUpdate) return fail(NO_PERMISSION);
  if (!UUID_RE.test(id)) return fail(NOT_FOUND);
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return fail('Elegí el archivo');
  if (file.size > INVOICE_ATTACHMENT_MAX_BYTES) return fail('El archivo supera los 10 MB');
  if (!(INVOICE_ATTACHMENT_TYPES as readonly string[]).includes(file.type)) return fail('El archivo tiene que ser PDF o imagen');
  const companyId = await getActiveCompanyId();
  const invoice = await prisma.supplier_invoices.findFirst({
    where: { id, company_id: companyId, status: { not: 'CANCELLED' } },
    select: { supplier_id: true },
  });
  if (!invoice) return fail(NOT_FOUND);

  const path = `${companyId}/${invoice.supplier_id}/invoices/${Date.now()}-${safeFileName(file.name)}`;
  const uploaded = await storageUpload(SUPPLIER_FILES_BUCKET, path, file);
  if (!uploaded.ok) return fail('No se pudo subir el archivo. Intentá de nuevo.');
  try {
    await prisma.supplier_invoices.update({ where: { id }, data: { attachment_path: path, attachment_name: file.name } });
    revalidate();
    return ok(null);
  } catch (error) {
    await storageRemove(SUPPLIER_FILES_BUCKET, [path]);
    return toPurchaseActionError(error, logger, 'guardar el comprobante adjunto');
  }
}

async function resolveInvoice(id: string, comment: string, decision: 'APPROVED' | 'REJECTED'): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'facturas', 'approve'))) return fail(NO_PERMISSION);
  if (!UUID_RE.test(id)) return fail(NOT_FOUND);
  const motive = requiredReasonSchema.safeParse(comment);
  if (!motive.success) return fail(firstIssue(motive.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  try {
    await withActor(profile.credentialId, async (tx) => {
      const lines = await invoiceOrderLineIds(tx, companyId, id);
      const lockedOrders = await lockOrdersForLines(tx, companyId, lines);
      const invoice = await lockSupplierInvoice(tx, companyId, id);
      await assertInvoiceLinesLocked(tx, id, lockedOrders);
      if (invoice.status !== 'OBSERVED') throw new PurchaseError(`La ${invoice.label} no está observada`);
      // Rechazar un comprobante que ya esta en una orden de pago la dejaria pagando algo que no se debe.
      if (decision === 'REJECTED') await assertNotInPaymentOrder(tx, id);
      await tx.supplier_invoices.update({
        where: { id },
        data: { status: decision, resolved_by: profile.id, resolved_at: new Date(), resolution_comment: motive.data },
      });
      // Rechazar deja de contar lo facturado: no puede dejar una linea acreditada de mas.
      if (decision === 'REJECTED') await assertNoNegativeInvoiced(tx, lines);
    });
    revalidate();
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, decision === 'APPROVED' ? 'aprobar el comprobante' : 'rechazar el comprobante');
  }
}

/** Aprueba un comprobante observado (con comentario): queda a pagar. */
export async function approveSupplierInvoice(id: string, comment: string): Promise<ActionResult> {
  return resolveInvoice(id, comment, 'APPROVED');
}

/** Rechaza un comprobante observado (con motivo): no se paga y no cuenta como facturado. */
export async function rejectSupplierInvoice(id: string, reason: string): Promise<ActionResult> {
  return resolveInvoice(id, reason, 'REJECTED');
}

/** Anula un comprobante (con motivo). Libera lo facturado. No si tiene NC o ND vigentes vinculadas. */
export async function cancelSupplierInvoice(id: string, reason: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'facturas', 'update'))) return fail(NO_PERMISSION);
  if (!UUID_RE.test(id)) return fail(NOT_FOUND);
  const motive = requiredReasonSchema.safeParse(reason);
  if (!motive.success) return fail(firstIssue(motive.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  try {
    await withActor(profile.credentialId, async (tx) => {
      const lines = await invoiceOrderLineIds(tx, companyId, id);
      const lockedOrders = await lockOrdersForLines(tx, companyId, lines);
      await lockSupplierInvoice(tx, companyId, id);
      await assertInvoiceLinesLocked(tx, id, lockedOrders);
      await assertNotInPaymentOrder(tx, id);
      const note = await tx.supplier_invoices.findFirst({
        where: { related_invoice_id: id, status: { not: 'CANCELLED' } },
        select: { cbte_type: true, sales_point: true, number: true },
        orderBy: { created_at: 'asc' },
      });
      if (note) throw new PurchaseError(`Tiene la ${supplierInvoiceLabel(note)} vinculada: anulala primero`);
      await tx.supplier_invoices.update({
        where: { id },
        data: { status: 'CANCELLED', cancelled_by: profile.id, cancelled_at: new Date(), cancel_reason: motive.data },
      });
      await assertNoNegativeInvoiced(tx, lines);
    });
    revalidate();
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'anular el comprobante');
  }
}

const ARCA_UNAVAILABLE = 'ARCA no respondió: probá de nuevo más tarde';
const WSCDC_NOT_AUTHORIZED =
  'El certificado de la empresa no tiene habilitado el servicio Constatación de comprobantes (wscdc). Asocialo en ARCA → Administración de certificados digitales.';

/**
 * Constata el comprobante en ARCA (WSCDC, spec Compras etapa 4 §3.5). La llamada a ARCA va FUERA
 * de la transaccion; despues se guarda el resultado con el comprobante lockeado:
 * - aprobado: solo el resultado;
 * - rechazado: observacion ARCA y el comprobante pasa a OBSERVED (se borra la resolucion);
 * - sin respuesta: UNAVAILABLE y el estado no cambia.
 */
export async function checkSupplierInvoiceInArca(id: string): Promise<ActionResult<{ result: arca_check_result; message: string }>> {
  if (!(await checkPermissionServer('compras', 'facturas', 'update'))) return fail(NO_PERMISSION);
  if (!UUID_RE.test(id)) return fail(NOT_FOUND);
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();

  const invoice = await prisma.supplier_invoices.findFirst({
    where: { id, company_id: companyId, status: { not: 'CANCELLED' } },
    select: {
      cbte_type: true,
      sales_point: true,
      number: true,
      issue_date: true,
      total: true,
      cae: true,
      supplier: { select: { cuit: true } },
      company: { select: { company_cuit: true, fiscal_profile: { select: { environment: true } } } },
    },
  });
  if (!invoice) return fail(NOT_FOUND);
  if (!invoice.cae) return fail('Cargá el CAE del comprobante para constatarlo en ARCA');
  const env = invoice.company.fiscal_profile?.environment ?? 'homologacion';

  let outcome: { result: arca_check_result; detail: string | null; observation: string | null };
  try {
    const checked = await checkVoucherWithArca(companyId, env, {
      issuerCuit: invoice.supplier.cuit.toString(),
      salesPoint: invoice.sales_point,
      cbteType: invoice.cbte_type,
      number: Number(invoice.number),
      issueDate: invoice.issue_date.toISOString().slice(0, 10),
      total: invoice.total.toFixed(2),
      cae: invoice.cae,
      receiverCuit: invoice.company.company_cuit.replace(/\D/g, ''),
    });
    const detail = checked.observations.map((o) => `${o.code}: ${o.message}`).join(' | ') || null;
    outcome =
      checked.result === 'A'
        ? { result: 'APPROVED', detail, observation: null }
        : { result: 'REJECTED', detail, observation: `ARCA rechazó la constatación${detail ? `: ${detail}` : ''}` };
  } catch (error) {
    if (error instanceof ArcaTransportError) {
      outcome = { result: 'UNAVAILABLE', detail: error.message, observation: null };
    } else if (error instanceof ArcaAuthError && /notAuthorized/i.test(error.faultCode)) {
      return fail(WSCDC_NOT_AUTHORIZED);
    } else if (error instanceof ArcaServiceError) {
      return fail(`ARCA respondió: ${error.message}`);
    } else if (error instanceof ArcaError) {
      return fail(error.message);
    } else {
      logger.error('Error al constatar en ARCA', { data: { error, id } });
      return fail('No se pudo constatar el comprobante. Intentá de nuevo; si persiste, avisá a soporte.');
    }
  }

  try {
    await withActor(profile.credentialId, async (tx) => {
      const locked = await lockSupplierInvoice(tx, companyId, id);
      const current = await tx.supplier_invoices.findUniqueOrThrow({ where: { id }, select: { observations: true } });
      // Un rechazado sigue rechazado, y uno ya pagado en una orden no deja de estar a pagar (sacarlo
      // de la deuda descuadraria la cuenta corriente): la constatacion solo suma su observacion. En una
      // orden sin pagar si pasa a observado, y eso frena aprobarla y pagarla.
      const keepStatus = locked.status === 'REJECTED' || (await paymentOrderOfInvoice(tx, id, { paidOnly: true })) !== null;
      const checkData = { arca_check_result: outcome.result, arca_checked_at: new Date(), arca_check_detail: outcome.detail };
      if (outcome.observation) {
        const observations = [
          ...parseObservations(current.observations).filter((o) => o.code !== 'ARCA'),
          { code: 'ARCA' as const, message: outcome.observation },
        ];
        await tx.supplier_invoices.update({
          where: { id },
          data: {
            ...checkData,
            observations: observations as Prisma.InputJsonValue,
            ...(keepStatus ? {} : { status: 'OBSERVED' as const, resolved_by: null, resolved_at: null, resolution_comment: null }),
          },
        });
      } else {
        await tx.supplier_invoices.update({ where: { id }, data: checkData });
      }
    });
    revalidate();
  } catch (error) {
    return toPurchaseActionError(error, logger, 'guardar la constatación');
  }

  const message =
    outcome.result === 'APPROVED'
      ? 'ARCA constató el comprobante'
      : outcome.result === 'REJECTED'
        ? `ARCA rechazó la constatación: el comprobante quedó observado${outcome.detail ? ` (${outcome.detail})` : ''}`
        : ARCA_UNAVAILABLE;
  return ok({ result: outcome.result, message });
}
