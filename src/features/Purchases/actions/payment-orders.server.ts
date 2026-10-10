'use server';

import { revalidatePath } from 'next/cache';
import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { NO_PERMISSION, UUID_RE, firstIssue, toPurchaseActionError } from '../lib/action-errors';
import { nextPurchaseDocumentNumber } from '../lib/document-number';
import { supplierInvoiceLabel } from '../lib/invoices';
import { openAdvancesOfSupplier, openInvoicesOfSupplier } from '../lib/payment-balances';
import { canApplyPaymentOrderAction, type PaymentOrderStatus } from '../lib/payment-order-state-machine';
import { cents, money, type PaymentTotals } from '../lib/payment-totals';
import {
  assertPaymentOrderStillValid,
  assertWithholdingsStillValid,
  buildPaymentOrder,
  lockPaymentOrder,
  lockSupplier,
  nextCertificateNumber,
  paymentOrderData,
  type BuiltWithholding,
} from '../lib/payments';
import { PurchaseError } from '../lib/purchase-errors';
import {
  paymentOrderFormSchema,
  registerPaymentFormSchema,
  type PaymentOrderFormValues,
  type RegisterPaymentFormValues,
} from '../schemas/payment-orders';
import { requiredReasonSchema } from '../schemas/requests';
import { sendDocumentSchema, type SendDocumentValues } from '../schemas/send';
import { mailNotSentMessage, supplierRecipients } from '../lib/supplier-send';
import { renderPaymentOrderPdf } from '../pdf/render-payment-pdf.server';
import { sendSupplierDocumentEmail } from '@/shared/lib/mail/templates/purchases';
import { paymentMovementDate } from '@/features/Treasury/lib/movement-rules';
import { treasuryToday } from '@/features/Treasury/lib/today';
import { assertActiveAccount, cancelMovements, createMovement } from '@/features/Treasury/lib/movements';

const logger = new Logger('features/Purchases/payment-orders');

const PURCHASES_PATH = '/dashboard/purchases';
const TREASURY_PATH = '/dashboard/treasury';
const SESSION_EXPIRED = 'Tu sesión expiró. Volvé a ingresar.';
const NOT_FOUND = 'La orden de pago no existe';
const TRANSACTION_OPTIONS = { timeout: 20_000, maxWait: 5_000 };

function revalidate() {
  revalidatePath(PURCHASES_PATH, 'layout');
}

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

async function canEditOrders() {
  const [create, update] = await Promise.all([
    checkPermissionServer('compras', 'pagos', 'create'),
    checkPermissionServer('compras', 'pagos', 'update'),
  ]);
  return create || update;
}

/** Vista previa del formulario: totales y retenciones sin guardar (con el proveedor lockeado en una tx de lectura). */
export async function previewPaymentOrder(
  values: PaymentOrderFormValues,
  options: { orderId?: string } = {}
): Promise<ActionResult<{ totals: PaymentTotals; withholdings: BuiltWithholding[] }>> {
  if (!(await canEditOrders())) return fail(NO_PERMISSION);
  const parsed = paymentOrderFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const companyId = await getActiveCompanyId();
  try {
    const built = await prisma.$transaction(async (tx) => {
      const supplier = await lockSupplier(tx, companyId, parsed.data.supplierId);
      return buildPaymentOrder(tx, companyId, supplier, parsed.data, { orderId: options.orderId && UUID_RE.test(options.orderId) ? options.orderId : undefined });
    });
    return ok({ totals: built.totals, withholdings: built.withholdings });
  } catch (error) {
    return toPurchaseActionError(error, logger, 'calcular la orden de pago');
  }
}

/** Arma una orden de pago en borrador (spec Compras etapa 5 §3.1). */
export async function createPaymentOrder(values: PaymentOrderFormValues): Promise<ActionResult<{ id: string; number: string }>> {
  if (!(await checkPermissionServer('compras', 'pagos', 'create'))) return fail(NO_PERMISSION);
  const parsed = paymentOrderFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  try {
    const result = await withActor(
      profile.credentialId,
      async (tx) => {
        const supplier = await lockSupplier(tx, companyId, parsed.data.supplierId);
        if (!supplier.isActive) throw new PurchaseError(`El proveedor ${supplier.name} está inactivo`);
        const built = await buildPaymentOrder(tx, companyId, supplier, parsed.data);
        const data = paymentOrderData(built);
        const number = await nextPurchaseDocumentNumber(tx, companyId, 'payment');
        return tx.payment_orders.create({
          data: {
            company_id: companyId,
            number,
            supplier_id: supplier.id,
            status: 'DRAFT',
            planned_on: day(parsed.data.plannedOn),
            notes: parsed.data.notes || null,
            created_by: profile.id,
            ...data.header,
            lines: { create: data.lines },
            withholdings: { create: data.withholdings },
          },
          select: { id: true, number: true },
        });
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidate();
    return ok(result);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'armar la orden de pago');
  }
}

/** Edita un borrador: reemplaza lineas y retenciones. */
export async function updatePaymentOrder(id: string, values: PaymentOrderFormValues): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'pagos', 'update'))) return fail(NO_PERMISSION);
  if (!UUID_RE.test(id)) return fail(NOT_FOUND);
  const parsed = paymentOrderFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  try {
    await withActor(
      profile.credentialId,
      async (tx) => {
        const order = await lockPaymentOrder(tx, companyId, id, 'edit');
        if (order.supplierId !== parsed.data.supplierId) throw new PurchaseError('El proveedor de una orden de pago no se cambia: armá otra');
        const built = await buildPaymentOrder(tx, companyId, order.supplier, parsed.data, { orderId: id });
        const data = paymentOrderData(built);
        await tx.payment_order_lines.deleteMany({ where: { payment_order_id: id } });
        await tx.payment_order_withholdings.deleteMany({ where: { payment_order_id: id } });
        await tx.payment_orders.update({
          where: { id },
          data: {
            planned_on: day(parsed.data.plannedOn),
            notes: parsed.data.notes || null,
            ...data.header,
            lines: { create: data.lines },
            withholdings: { create: data.withholdings },
          },
        });
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidate();
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'editar la orden de pago');
  }
}

export async function submitPaymentOrder(id: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'pagos', 'update'))) return fail(NO_PERMISSION);
  if (!UUID_RE.test(id)) return fail(NOT_FOUND);
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  try {
    await withActor(profile.credentialId, async (tx) => {
      await lockPaymentOrder(tx, companyId, id, 'submit');
      await tx.payment_orders.update({ where: { id }, data: { status: 'PENDING_APPROVAL', submitted_at: new Date() } });
    });
    revalidate();
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'enviar a aprobación la orden de pago');
  }
}

/** Aprueba: congela las retenciones. Vuelve a validar comprobantes y anticipos. */
export async function approvePaymentOrder(id: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'pagos', 'approve'))) return fail(NO_PERMISSION);
  if (!UUID_RE.test(id)) return fail(NOT_FOUND);
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  try {
    await withActor(profile.credentialId, async (tx) => {
      const order = await lockPaymentOrder(tx, companyId, id, 'approve');
      await assertPaymentOrderStillValid(tx, companyId, id);
      await assertWithholdingsStillValid(tx, companyId, order.supplier, id);
      await tx.payment_orders.update({ where: { id }, data: { status: 'APPROVED', approved_by: profile.id, approved_at: new Date() } });
    });
    revalidate();
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'aprobar la orden de pago');
  }
}

export async function rejectPaymentOrder(id: string, reason: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'pagos', 'approve'))) return fail(NO_PERMISSION);
  if (!UUID_RE.test(id)) return fail(NOT_FOUND);
  const motive = requiredReasonSchema.safeParse(reason);
  if (!motive.success) return fail(firstIssue(motive.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  try {
    await withActor(profile.credentialId, async (tx) => {
      await lockPaymentOrder(tx, companyId, id, 'reject');
      const now = new Date();
      await tx.payment_orders.update({
        where: { id },
        data: {
          status: 'DRAFT',
          rejected_by: profile.id,
          rejected_at: now,
          rejection_notes: motive.data,
          rejections: { create: { rejected_by: profile.id, rejected_at: now, reason: motive.data } },
        },
      });
    });
    revalidate();
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'rechazar la orden de pago');
  }
}

/** Vuelve a borrador (para recalcular o corregir) desde pendiente o aprobada. */
export async function backToDraftPaymentOrder(id: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'pagos', 'update'))) return fail(NO_PERMISSION);
  if (!UUID_RE.test(id)) return fail(NOT_FOUND);
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  try {
    await withActor(profile.credentialId, async (tx) => {
      await lockPaymentOrder(tx, companyId, id, 'backToDraft');
      await tx.payment_orders.update({ where: { id }, data: { status: 'DRAFT', approved_by: null, approved_at: null } });
    });
    revalidate();
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'volver a borrador la orden de pago');
  }
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * Registra el pago: fecha real (mismo mes que la prevista) y medios que suman el neto, desde
 * cuentas activas. Numera los certificados de retencion y deja la orden pagada.
 */
export async function registerPayment(id: string, values: RegisterPaymentFormValues): Promise<ActionResult<{ number: string; certificates: string[] }>> {
  if (!(await checkPermissionServer('compras', 'pagos', 'update'))) return fail(NO_PERMISSION);
  if (!UUID_RE.test(id)) return fail(NOT_FOUND);
  const parsed = registerPaymentFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  const v = parsed.data;
  try {
    const result = await withActor(
      profile.credentialId,
      async (tx) => {
        const order = await lockPaymentOrder(tx, companyId, id, 'pay');
        const planned = isoDay(order.plannedOn)!;
        if (planned.slice(0, 7) !== v.paidOn.slice(0, 7)) {
          const month = MONTHS[Number(planned.slice(5, 7)) - 1];
          throw new PurchaseError(`Las retenciones se calcularon para ${month}: volvé la orden a borrador para recalcularlas con la fecha de pago`);
        }
        await assertPaymentOrderStillValid(tx, companyId, id);
        await assertWithholdingsStillValid(tx, companyId, order.supplier, id);
        // Neto 0 (todo compensado con NC o anticipos): se registra sin medios de pago.
        if (v.payments.length === 0 && cents(order.netTotal) !== BigInt(0)) throw new PurchaseError('Agregá al menos un medio de pago');
        // Cuenta inexistente, ajena o inactiva: el mensaje de Tesoreria nombra la cuenta.
        for (const accountId of new Set(v.payments.map((p) => p.accountId))) await assertActiveAccount(tx, companyId, accountId);
        const total = v.payments.reduce((acc, p) => acc + cents(p.amount), BigInt(0));
        if (total !== cents(order.netTotal)) {
          throw new PurchaseError(`Los medios suman ${money(total)} y no suman el neto a pagar (${money(cents(order.netTotal))})`);
        }

        const withholdings = await tx.payment_order_withholdings.findMany({ where: { payment_order_id: id }, select: { id: true, tax: true } });
        const certificates: string[] = [];
        for (const w of withholdings) {
          const number = await nextCertificateNumber(tx, companyId, w.tax);
          await tx.payment_order_withholdings.update({ where: { id: w.id }, data: { certificate_number: number } });
          certificates.push(number);
        }
        // Cada medio de pago genera su movimiento de Tesoreria en esta misma transaccion: los
        // cheques y e-cheqs debitan en su fecha de pago (spec Tesoreria etapa 1 §3.1).
        for (const p of v.payments) {
          const isCheck = p.method === 'CHECK' || p.method === 'ECHECK';
          const payment = await tx.payment_order_payments.create({
            data: {
              payment_order_id: id,
              method: p.method,
              treasury_account_id: p.accountId,
              amount: new Prisma.Decimal(money(cents(p.amount))),
              reference: p.reference || null,
              check_number: isCheck ? p.checkNumber : null,
              check_bank: isCheck ? p.checkBank || null : null,
              check_due_on: isCheck ? day(p.checkDueOn) : null,
            },
            select: { id: true },
          });
          await createMovement(tx, {
            companyId,
            accountId: p.accountId,
            date: paymentMovementDate(p.method, v.paidOn, isCheck ? p.checkDueOn : null),
            amountCents: -cents(p.amount),
            kind: 'SUPPLIER_PAYMENT',
            paymentOrderPaymentId: payment.id,
            description: `${order.number} — ${order.supplier.name}${isCheck ? ` — Cheque N° ${p.checkNumber}` : ''}`,
            createdBy: profile.id,
          });
        }
        await tx.payment_orders.update({ where: { id }, data: { status: 'PAID', paid_on: day(v.paidOn), paid_by: profile.id } });
        return { number: order.number, certificates };
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidate();
    // El pago (o su anulacion) mueve el saldo de las cuentas de Tesoreria.
    revalidatePath(TREASURY_PATH, 'layout');
    return ok(result);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'registrar el pago');
  }
}

/**
 * Anula (con motivo) en cualquier estado. Libera lo aplicado; si estaba pagada, sus certificados
 * quedan anulados. No se anula si un anticipo de esta orden ya se aplico en otra.
 */
export async function cancelPaymentOrder(id: string, reason: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'pagos', 'update'))) return fail(NO_PERMISSION);
  if (!UUID_RE.test(id)) return fail(NOT_FOUND);
  const motive = requiredReasonSchema.safeParse(reason);
  if (!motive.success) return fail(firstIssue(motive.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  try {
    await withActor(profile.credentialId, async (tx) => {
      const order = await lockPaymentOrder(tx, companyId, id, 'cancel');
      const used = await tx.$queryRaw<{ number: string }[]>`
        SELECT po.number FROM payment_order_lines a
        JOIN payment_order_lines x ON x.source_line_id = a.id
        JOIN payment_orders po ON po.id = x.payment_order_id
        WHERE a.payment_order_id = ${id}::uuid AND po.status <> 'CANCELLED'
        ORDER BY po.number LIMIT 1
      `;
      if (used[0]) throw new PurchaseError(`El anticipo de la ${order.number} se aplicó en la ${used[0].number}: anulá esa primero`);
      const now = new Date();
      if (order.status === 'PAID') {
        await tx.payment_order_withholdings.updateMany({ where: { payment_order_id: id }, data: { cancelled_at: now } });
        await cancelMovements(tx, { paymentOrderId: id }, { by: profile.id, reason: motive.data, at: now });
      }
      await tx.payment_orders.update({
        where: { id },
        data: { status: 'CANCELLED', cancelled_by: profile.id, cancelled_at: now, cancel_reason: motive.data },
      });
    });
    revalidate();
    // El pago (o su anulacion) mueve el saldo de las cuentas de Tesoreria.
    revalidatePath(TREASURY_PATH, 'layout');
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'anular la orden de pago');
  }
}

/**
 * Datos del formulario: el proveedor (con su saldo pendiente), sus comprobantes a pagar con
 * pendiente, sus anticipos disponibles y sus OC (para un anticipo). Sin proveedor, nada.
 */
export async function getPaymentOrderFormData(supplierId?: string, options: { excludeOrderId?: string } = {}) {
  if (!(await canEditOrders())) return null;
  const companyId = await getActiveCompanyId();
  const empty = { supplier: null, openItems: { invoices: [], advances: [] }, purchaseOrders: [] };
  if (!supplierId || !UUID_RE.test(supplierId)) return empty;
  const supplier = await prisma.suppliers.findFirst({
    where: { id: supplierId, company_id: companyId },
    select: { id: true, name: true, cuit: true, vat_condition_id: true, is_active: true },
  });
  if (!supplier) return empty;
  const exclude = options.excludeOrderId && UUID_RE.test(options.excludeOrderId) ? options.excludeOrderId : undefined;
  const [invoices, advances, purchaseOrders] = await Promise.all([
    openInvoicesOfSupplier(prisma, companyId, supplier.id, { excludeOrderId: exclude }),
    openAdvancesOfSupplier(prisma, companyId, supplier.id, { excludeOrderId: exclude }),
    prisma.purchase_orders.findMany({
      where: { company_id: companyId, supplier_id: supplier.id, status: { in: ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED'] } },
      select: { id: true, number: true, total: true },
      orderBy: { number: 'desc' },
      take: 100,
    }),
  ]);
  return {
    supplier: { ...supplier, cuit: supplier.cuit.toString() },
    openItems: {
      invoices: invoices.map((i) => ({
        id: i.id,
        label: supplierInvoiceLabel({ cbte_type: i.cbteType, sales_point: i.salesPoint, number: i.number }),
        isCredit: [3, 8, 13].includes(i.cbteType),
        issueDate: isoDay(i.issueDate)!,
        dueDate: isoDay(i.dueDate),
        total: money(cents(i.total)),
        pending: money(cents(i.pending)),
      })),
      advances: advances.map((a) => ({
        lineId: a.lineId,
        orderNumber: a.orderNumber,
        paidOn: isoDay(a.paidOn),
        description: a.description,
        amount: money(cents(a.amount)),
        available: money(cents(a.available)),
      })),
    },
    purchaseOrders: purchaseOrders.map((o) => ({ id: o.id, number: o.number, total: o.total.toFixed(2) })),
  };
}

export type PaymentOrderFormData = NonNullable<Awaited<ReturnType<typeof getPaymentOrderFormData>>>;

const userName = (p: { fullname: string | null; email: string | null } | null) => (p ? (p.fullname ?? p.email ?? 'Usuario') : null);

/** Detalle de la orden: lineas, retenciones con certificado, medios, historial y acciones. */
export async function getPaymentOrderDetail(id: string) {
  if (!UUID_RE.test(id)) return null;
  const [canView, canUpdate, canApprove] = await Promise.all([
    checkPermissionServer('compras', 'pagos', 'view'),
    checkPermissionServer('compras', 'pagos', 'update'),
    checkPermissionServer('compras', 'pagos', 'approve'),
  ]);
  if (!canView) return null;
  const companyId = await getActiveCompanyId();
  const order = await prisma.payment_orders.findFirst({
    where: { id, company_id: companyId },
    include: {
      supplier: { select: { id: true, name: true, cuit: true } },
      creator: { select: { fullname: true, email: true } },
      approver: { select: { fullname: true, email: true } },
      payer: { select: { fullname: true, email: true } },
      canceller: { select: { fullname: true, email: true } },
      rejections: { select: { rejected_at: true, reason: true, rejecter: { select: { fullname: true, email: true } } }, orderBy: { rejected_at: 'asc' } },
      lines: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          kind: true,
          amount: true,
          description: true,
          invoice: { select: { id: true, cbte_type: true, sales_point: true, number: true, total: true, due_date: true } },
          purchase_order: { select: { id: true, number: true } },
          source_line: { select: { payment_order: { select: { id: true, number: true } } } },
        },
      },
      withholdings: {
        orderBy: { tax: 'asc' },
        select: {
          id: true,
          tax: true,
          base: true,
          rate: true,
          amount: true,
          detail: true,
          manual: true,
          certificate_number: true,
          cancelled_at: true,
          regime: { select: { code: true, description: true } },
        },
      },
      payments: {
        select: {
          id: true,
          method: true,
          amount: true,
          reference: true,
          check_number: true,
          check_bank: true,
          check_due_on: true,
          treasury_account: { select: { id: true, name: true } },
          movement: { select: { date: true, cancelled_at: true } },
        },
      },
    },
  });
  if (!order) return null;
  const today = treasuryToday();
  const status = order.status as PaymentOrderStatus;
  const at = (d: Date | null) => d?.toISOString() ?? null;
  const recipients = await supplierRecipients(prisma, order.supplier_id);
  return {
    id: order.id,
    number: order.number,
    status,
    supplier: { ...order.supplier, cuit: order.supplier.cuit.toString() },
    plannedOn: isoDay(order.planned_on)!,
    paidOn: isoDay(order.paid_on),
    notes: order.notes,
    rejectionNotes: status === 'DRAFT' ? order.rejection_notes : null,
    cancelReason: order.cancel_reason,
    sentTo: order.sent_to,
    recipients,
    totals: {
      invoicesTotal: order.invoices_total.toFixed(2),
      creditsTotal: order.credits_total.toFixed(2),
      advanceTotal: order.advance_total.toFixed(2),
      withholdingsTotal: order.withholdings_total.toFixed(2),
      netTotal: order.net_total.toFixed(2),
    },
    lines: order.lines.map((l) => ({
      id: l.id,
      kind: l.kind,
      amount: l.amount.toFixed(2),
      description: l.description,
      invoice: l.invoice
        ? { id: l.invoice.id, label: supplierInvoiceLabel(l.invoice), total: l.invoice.total.toFixed(2), dueDate: isoDay(l.invoice.due_date) }
        : null,
      purchaseOrder: l.purchase_order,
      sourceOrder: l.source_line?.payment_order ?? null,
    })),
    withholdings: order.withholdings.map((w) => ({
      id: w.id,
      tax: w.tax,
      regime: w.regime,
      base: w.base.toFixed(2),
      rate: w.rate.toString(),
      amount: w.amount.toFixed(2),
      detail: w.detail,
      manual: w.manual,
      certificateNumber: w.certificate_number,
      cancelled: w.cancelled_at !== null,
    })),
    payments: order.payments.map((p) => ({
      id: p.id,
      method: p.method,
      amount: p.amount.toFixed(2),
      reference: p.reference,
      checkNumber: p.check_number,
      checkBank: p.check_bank,
      checkDueOn: isoDay(p.check_due_on),
      account: p.treasury_account,
      // Movimiento de Tesoreria: fecha valor y si todavia esta "a debitar".
      movement: p.movement
        ? { date: isoDay(p.movement.date)!, cancelled: p.movement.cancelled_at !== null, toDebit: isoDay(p.movement.date)! > today }
        : null,
    })),
    history: [
      { event: 'Creada', at: at(order.created_at), by: userName(order.creator), notes: null },
      ...order.rejections.map((r) => ({ event: 'Rechazada', at: at(r.rejected_at), by: userName(r.rejecter), notes: r.reason })),
      ...(order.submitted_at ? [{ event: 'Enviada a aprobación', at: at(order.submitted_at), by: null, notes: null }] : []),
      ...(order.approved_at ? [{ event: 'Aprobada', at: at(order.approved_at), by: userName(order.approver), notes: null }] : []),
      ...(order.paid_on ? [{ event: 'Pagada', at: isoDay(order.paid_on), by: userName(order.payer), notes: null }] : []),
      ...(order.sent_at ? [{ event: 'Enviada al proveedor', at: at(order.sent_at), by: null, notes: order.sent_to.join(', ') }] : []),
      ...(order.cancelled_at ? [{ event: 'Anulada', at: at(order.cancelled_at), by: userName(order.canceller), notes: order.cancel_reason }] : []),
    ],
    can: {
      edit: canUpdate && canApplyPaymentOrderAction(status, 'edit'),
      submit: canUpdate && canApplyPaymentOrderAction(status, 'submit'),
      approve: canApprove && canApplyPaymentOrderAction(status, 'approve'),
      backToDraft: canUpdate && canApplyPaymentOrderAction(status, 'backToDraft'),
      pay: canUpdate && canApplyPaymentOrderAction(status, 'pay'),
      send: canUpdate && canApplyPaymentOrderAction(status, 'send'),
      cancel: canUpdate && canApplyPaymentOrderAction(status, 'cancel'),
    },
  };
}

export type PaymentOrderDetail = NonNullable<Awaited<ReturnType<typeof getPaymentOrderDetail>>>;

/** Valores del formulario para editar un borrador. */
export async function getPaymentOrderEditValues(id: string): Promise<PaymentOrderFormValues | null> {
  if (!UUID_RE.test(id)) return null;
  if (!(await checkPermissionServer('compras', 'pagos', 'update'))) return null;
  const companyId = await getActiveCompanyId();
  const order = await prisma.payment_orders.findFirst({
    where: { id, company_id: companyId, status: 'DRAFT' },
    select: {
      supplier_id: true,
      planned_on: true,
      notes: true,
      lines: { orderBy: { position: 'asc' }, select: { kind: true, amount: true, invoice_id: true, source_line_id: true, purchase_order_id: true, description: true } },
      withholdings: { where: { manual: true }, select: { tax: true, amount: true, detail: true } },
    },
  });
  if (!order) return null;
  const advance = order.lines.find((l) => l.kind === 'ADVANCE');
  return {
    supplierId: order.supplier_id,
    plannedOn: isoDay(order.planned_on)!,
    notes: order.notes ?? '',
    lines: order.lines
      .filter((l) => l.kind !== 'ADVANCE')
      .map((l) => ({
        kind: l.kind as 'INVOICE' | 'CREDIT_NOTE' | 'ADVANCE_APPLIED',
        invoiceId: l.invoice_id ?? '',
        sourceLineId: l.source_line_id ?? '',
        amount: l.amount.toFixed(2),
      })),
    advance: {
      amount: advance ? advance.amount.toFixed(2) : '',
      purchaseOrderId: advance?.purchase_order_id ?? '',
      description: advance?.description ?? '',
    },
    manualWithholdings: order.withholdings.map((w) => ({
      tax: w.tax,
      amount: w.amount.toFixed(2),
      reason: w.detail.replace(/^Corregida a mano: /, '').replace(/ \(calculada: .*\)$/, ''),
    })),
  };
}

/** PDF de la orden de pago con sus certificados (marca de agua si no esta pagada). */
export async function getPaymentOrderPdf(id: string): Promise<ActionResult<{ filename: string; base64: string }>> {
  if (!(await checkPermissionServer('compras', 'pagos', 'view'))) return fail(NO_PERMISSION);
  if (!UUID_RE.test(id)) return fail(NOT_FOUND);
  const companyId = await getActiveCompanyId();
  try {
    const pdf = await renderPaymentOrderPdf(id, companyId);
    return ok({ filename: pdf.filename, base64: Buffer.from(pdf.content).toString('base64') });
  } catch (error) {
    return toPurchaseActionError(error, logger, 'generar el PDF');
  }
}

/**
 * Envia al proveedor el PDF de la orden pagada con los certificados. No cambia el estado: registra
 * a quien y cuando se envio. El mail sale fuera de la transaccion.
 */
export async function sendPaymentOrder(id: string, values: SendDocumentValues): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'pagos', 'update'))) return fail(NO_PERMISSION);
  if (!UUID_RE.test(id)) return fail(NOT_FOUND);
  const parsed = sendDocumentSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const companyId = await getActiveCompanyId();
  try {
    const order = await prisma.payment_orders.findFirst({
      where: { id, company_id: companyId },
      select: { number: true, status: true, company: { select: { company_name: true } }, supplier: { select: { name: true } } },
    });
    if (!order) return fail(NOT_FOUND);
    if (!canApplyPaymentOrderAction(order.status, 'send')) return fail(`La orden ${order.number} no está pagada: no se envía todavía`);
    const pdf = await renderPaymentOrderPdf(id, companyId);
    const sent = await sendSupplierDocumentEmail({
      kind: 'payment',
      to: parsed.data.to,
      number: order.number,
      companyName: order.company.company_name,
      supplierName: order.supplier.name,
      message: parsed.data.message || null,
      attachment: pdf,
    });
    if (!sent) return fail(mailNotSentMessage('la orden sigue pagada'));
    await prisma.payment_orders.update({ where: { id }, data: { sent_at: new Date(), sent_to: parsed.data.to } });
    revalidate();
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'enviar la orden de pago');
  }
}
