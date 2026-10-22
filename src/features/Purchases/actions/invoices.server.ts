'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { storageRemove, storageUpload } from '@/shared/lib/storage';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { isUuid } from '@/shared/lib/uuid';
import { revalidatePath } from 'next/cache';
import {
  NO_PERMISSION,
  PURCHASES_PATH,
  SESSION_EXPIRED,
  TRANSACTION_OPTIONS,
  firstIssue,
  toPurchaseActionError,
} from '../lib/action-errors';
import { buildInvoice } from '../lib/invoice-build';
import { type InvoiceObservation } from '../lib/invoice-control';
import { parseObservations } from '../lib/invoice-observations';
import type { SupplierInvoiceStatus } from '../lib/invoice-status';
import {
  assertInvoiceLinesLocked,
  assertNoNegativeInvoiced,
  invoiceOrderLineIds,
  lockOrdersForLines,
  lockSupplierInvoice,
  supplierInvoiceLabel,
} from '../lib/invoices';
import { assertNotInPaymentOrder } from '../lib/payment-locks';
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

const NOT_FOUND = 'El comprobante no existe';

function revalidate() {
  revalidatePath(PURCHASES_PATH, 'layout');
}

export type SupplierInvoiceSaveResult = {
  id: string;
  label: string;
  status: SupplierInvoiceStatus;
  observations: InvoiceObservation[];
};

function parseForm(values: SupplierInvoiceFormValues): SupplierInvoiceInput | string {
  const parsed = supplierInvoiceFormSchema.safeParse(values);
  if (!parsed.success) return firstIssue(parsed.error);
  return toSupplierInvoiceInput(parsed.data);
}

const orderLineIdsOf = (input: SupplierInvoiceInput) =>
  input.lines.flatMap((l) => (l.kind === 'order' ? [l.orderLineId] : []));

/**
 * Carga un comprobante (spec Compras etapa 4 §3). En UNA transaccion: lock de las OC de sus
 * lineas -> validaciones -> control -> alta. Queda CONFORMING u OBSERVED segun el control.
 */
export async function createSupplierInvoice(
  values: SupplierInvoiceFormValues
): Promise<ActionResult<SupplierInvoiceSaveResult>> {
  if (!(await checkPermissionServer('compras', 'facturas', 'create'))) return fail(NO_PERMISSION);
  const input = parseForm(values);
  if (typeof input === 'string') return fail(input);
  if (orderLineIdsOf(input).some((id) => !isUuid(id))) return fail('La línea de OC no existe');
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
  if (!isUuid(id)) return fail(NOT_FOUND);
  const input = parseForm(values);
  if (typeof input === 'string') return fail(input);
  if (orderLineIdsOf(input).some((lineId) => !isUuid(lineId))) return fail('La línea de OC no existe');
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
  if (!isUuid(id)) return fail(NOT_FOUND);
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return fail('Elegí el archivo');
  if (file.size > INVOICE_ATTACHMENT_MAX_BYTES) return fail('El archivo supera los 10 MB');
  if (!(INVOICE_ATTACHMENT_TYPES as readonly string[]).includes(file.type))
    return fail('El archivo tiene que ser PDF o imagen');
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
    await prisma.supplier_invoices.update({
      where: { id },
      data: { attachment_path: path, attachment_name: file.name },
    });
    revalidate();
    return ok(null);
  } catch (error) {
    await storageRemove(SUPPLIER_FILES_BUCKET, [path]);
    return toPurchaseActionError(error, logger, 'guardar el comprobante adjunto');
  }
}

async function resolveInvoice(id: string, comment: string, decision: 'APPROVED' | 'REJECTED'): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'facturas', 'approve'))) return fail(NO_PERMISSION);
  if (!isUuid(id)) return fail(NOT_FOUND);
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
    return toPurchaseActionError(
      error,
      logger,
      decision === 'APPROVED' ? 'aprobar el comprobante' : 'rechazar el comprobante'
    );
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
  if (!isUuid(id)) return fail(NOT_FOUND);
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
