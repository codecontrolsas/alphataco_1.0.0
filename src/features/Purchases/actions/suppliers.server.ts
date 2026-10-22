'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { prisma } from '@/shared/lib/prisma';
import { storageRemove, storageUpload } from '@/shared/lib/storage';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { isUuid } from '@/shared/lib/uuid';
import { revalidatePath } from 'next/cache';
import { NO_PERMISSION, PURCHASES_PATH, firstIssue, toPurchaseActionError } from '../lib/action-errors';
import { PurchaseError } from '../lib/purchase-errors';
import { SUPPLIER_FILES_BUCKET, safeFileName } from '../lib/storage-files';
import { formatCuit, normalizeCbu, normalizeSupplierCuit } from '../lib/supplier-ids';
import {
  SUPPLIER_DOCUMENT_MAX_BYTES,
  SUPPLIER_DOCUMENT_TYPES,
  idChangesSchema,
  supplierDocumentSchema,
  supplierFormSchema,
  type IdChanges,
  type SupplierFormValues,
} from '../schemas/suppliers';

const logger = new Logger('features/Purchases/suppliers');

const DOCUMENTS_BUCKET = SUPPLIER_FILES_BUCKET;

type Tx = Prisma.TransactionClient;

const nullable = (value: string) => (value.trim() ? value.trim() : null);

function supplierData(values: SupplierFormValues) {
  return {
    name: values.name.trim(),
    trade_name: nullable(values.tradeName),
    cuit: BigInt(normalizeSupplierCuit(values.cuit)),
    vat_condition_id: Number(values.vatConditionId),
    street: nullable(values.street),
    city: nullable(values.city),
    province: nullable(values.province),
    postal_code: nullable(values.postalCode),
    payment_term_days: values.paymentTermDays.trim() ? Number(values.paymentTermDays) : null,
    bank_cbu: values.bankCbu.trim() ? normalizeCbu(values.bankCbu) : null,
    bank_alias: nullable(values.bankAlias),
    notes: nullable(values.notes),
  };
}

/** El CUIT es unico por empresa: el mensaje nombra al proveedor que ya lo tiene. */
async function assertCuitFree(tx: Tx, companyId: string, cuit: bigint, exceptId: string | null) {
  const existing = await tx.suppliers.findFirst({
    where: { company_id: companyId, cuit, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { name: true },
  });
  if (existing) throw new PurchaseError(`Ya existe el proveedor ${existing.name} con el CUIT ${formatCuit(cuit)}`);
}

/** Los rubros tienen que ser de la empresa (y activos los que se agregan). */
async function applyCategoryChanges(tx: Tx, companyId: string, supplierId: string, changes: IdChanges) {
  const add = [...new Set(changes.add)];
  const remove = [...new Set(changes.remove)].filter((id) => !add.includes(id));
  if (add.length > 0) {
    const valid = await tx.supplier_categories.count({
      where: { id: { in: add }, company_id: companyId, is_active: true },
    });
    if (valid !== add.length) throw new PurchaseError('Uno de los rubros no existe o está inactivo');
    await tx.supplier_category_links.createMany({
      data: add.map((category_id) => ({ supplier_id: supplierId, category_id })),
      skipDuplicates: true,
    });
  }
  if (remove.length > 0) {
    await tx.supplier_category_links.deleteMany({ where: { supplier_id: supplierId, category_id: { in: remove } } });
  }
}

/**
 * Contactos: los que traen id se actualizan (tienen que ser de este proveedor), los que no se
 * crean y solo se borran los de `removedContactIds`. El principal se reasigna en dos pasos
 * porque el indice unico parcial se verifica fila por fila.
 */
async function applyContacts(
  tx: Tx,
  supplierId: string,
  contacts: SupplierFormValues['contacts'],
  removedContactIds: string[]
) {
  const existingIds = contacts.filter((c) => c.id).map((c) => c.id);
  const touched = [...existingIds, ...removedContactIds];
  if (touched.length > 0) {
    const owned = await tx.supplier_contacts.count({ where: { id: { in: touched }, supplier_id: supplierId } });
    if (owned !== new Set(touched).size) throw new PurchaseError('Uno de los contactos no es de este proveedor');
  }
  if (removedContactIds.length > 0) {
    await tx.supplier_contacts.deleteMany({ where: { id: { in: removedContactIds }, supplier_id: supplierId } });
  }
  await tx.supplier_contacts.updateMany({
    where: { supplier_id: supplierId, is_primary: true },
    data: { is_primary: false },
  });
  for (const contact of contacts) {
    const data = {
      name: contact.name.trim(),
      email: nullable(contact.email),
      phone: nullable(contact.phone),
      role: nullable(contact.role),
      is_primary: contact.isPrimary,
    };
    if (contact.id) await tx.supplier_contacts.update({ where: { id: contact.id }, data });
    else await tx.supplier_contacts.create({ data: { ...data, supplier_id: supplierId } });
  }
}

export async function createSupplier(
  values: SupplierFormValues,
  categoryIds: string[]
): Promise<ActionResult<{ id: string }>> {
  if (!(await checkPermissionServer('compras', 'proveedores', 'create'))) return fail(NO_PERMISSION);
  const parsed = supplierFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const categories = idChangesSchema.safeParse({ add: categoryIds, remove: [] });
  if (!categories.success) return fail('Rubros inválidos');
  const companyId = await getActiveCompanyId();

  try {
    const created = await prisma.$transaction(async (tx) => {
      const data = supplierData(parsed.data);
      await assertCuitFree(tx, companyId, data.cuit, null);
      const supplier = await tx.suppliers.create({ data: { ...data }, select: { id: true } });
      await applyContacts(tx, supplier.id, parsed.data.contacts, []);
      await applyCategoryChanges(tx, companyId, supplier.id, categories.data);
      return supplier;
    });
    revalidatePath(PURCHASES_PATH);
    return ok(created);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'crear el proveedor', 'Ya existe un proveedor con ese CUIT');
  }
}

export async function updateSupplier(
  id: string,
  values: SupplierFormValues,
  changes: { removedContactIds: string[]; categories: IdChanges }
): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'proveedores', 'update'))) return fail(NO_PERMISSION);
  if (!isUuid(id)) return fail('El proveedor no existe');
  const parsed = supplierFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const categories = idChangesSchema.safeParse(changes.categories);
  const removed = idChangesSchema.shape.remove.safeParse(changes.removedContactIds);
  if (!categories.success || !removed.success) return fail('Datos inválidos');
  const companyId = await getActiveCompanyId();

  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.suppliers.findFirst({ where: { id, company_id: companyId }, select: { id: true } });
      if (!current) throw new PurchaseError('El proveedor no existe');
      const data = supplierData(parsed.data);
      await assertCuitFree(tx, companyId, data.cuit, id);
      await tx.suppliers.update({ where: { id }, data });
      await applyContacts(tx, id, parsed.data.contacts, removed.data);
      await applyCategoryChanges(tx, companyId, id, categories.data);
    });
    revalidatePath(PURCHASES_PATH);
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'actualizar el proveedor', 'Ya existe un proveedor con ese CUIT');
  }
}

export type RemovalMode = 'delete' | 'deactivate';

/** Un proveedor sin uso (sin solicitudes ni documentos) se borra; con uso, se desactiva. */
export async function removeSupplier(id: string): Promise<ActionResult<{ mode: RemovalMode }>> {
  if (!(await checkPermissionServer('compras', 'proveedores', 'delete'))) return fail(NO_PERMISSION);
  if (!isUuid(id)) return fail('El proveedor no existe');
  const companyId = await getActiveCompanyId();
  try {
    const supplier = await prisma.suppliers.findFirst({
      where: { id, company_id: companyId },
      select: { _count: { select: { suggested_in: true, documents: true } } },
    });
    if (!supplier) return fail('El proveedor no existe');
    const inUse = supplier._count.suggested_in > 0 || supplier._count.documents > 0;
    if (inUse) await prisma.suppliers.update({ where: { id }, data: { is_active: false } });
    else await prisma.suppliers.delete({ where: { id } });
    revalidatePath(PURCHASES_PATH);
    return ok({ mode: inUse ? 'deactivate' : 'delete' });
  } catch (error) {
    return toPurchaseActionError(error, logger, 'dar de baja el proveedor');
  }
}

export async function reactivateSupplier(id: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'proveedores', 'update'))) return fail(NO_PERMISSION);
  if (!isUuid(id)) return fail('El proveedor no existe');
  const companyId = await getActiveCompanyId();
  try {
    const { count } = await prisma.suppliers.updateMany({
      where: { id, company_id: companyId },
      data: { is_active: true },
    });
    if (count === 0) return fail('El proveedor no existe');
    revalidatePath(PURCHASES_PATH);
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'reactivar el proveedor');
  }
}

// ── Documentos ──────────────────────────────────────────────────────────────

/**
 * Sube un documento del proveedor. `replacesId` marca el documento que reemplaza: el anterior
 * queda en el historial y su archivo no se borra. Si la base falla, se borra el archivo subido.
 */
export async function uploadSupplierDocument(
  supplierId: string,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  if (!(await checkPermissionServer('compras', 'proveedores', 'update'))) return fail(NO_PERMISSION);
  if (!isUuid(supplierId)) return fail('El proveedor no existe');
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return fail('Elegí el archivo');
  if (file.size > SUPPLIER_DOCUMENT_MAX_BYTES) return fail('El archivo supera los 10 MB');
  if (!(SUPPLIER_DOCUMENT_TYPES as readonly string[]).includes(file.type))
    return fail('El archivo tiene que ser PDF o imagen');
  const parsed = supplierDocumentSchema.safeParse({
    name: String(formData.get('name') ?? ''),
    expiresAt: String(formData.get('expiresAt') ?? ''),
    replacesId: String(formData.get('replacesId') ?? ''),
  });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const profile = await getServerAuthProfile();
  if (!profile) return fail('Tu sesión expiró. Volvé a ingresar.');
  const companyId = await getActiveCompanyId();
  const supplier = await prisma.suppliers.findFirst({
    where: { id: supplierId, company_id: companyId },
    select: { id: true },
  });
  if (!supplier) return fail('El proveedor no existe');

  const path = `${companyId}/${supplierId}/${Date.now()}-${safeFileName(file.name)}`;
  const uploaded = await storageUpload(DOCUMENTS_BUCKET, path, file);
  if (!uploaded.ok) return fail('No se pudo subir el archivo. Intentá de nuevo.');

  try {
    const created = await prisma.$transaction(async (tx) => {
      const document = await tx.supplier_documents.create({
        data: {
          supplier_id: supplierId,
          name: parsed.data.name,
          file_path: path,
          file_name: file.name,
          expires_at: parsed.data.expiresAt ? new Date(`${parsed.data.expiresAt}T00:00:00.000Z`) : null,
          uploaded_by: profile.id,
        },
        select: { id: true },
      });
      if (parsed.data.replacesId) {
        const { count } = await tx.supplier_documents.updateMany({
          where: { id: parsed.data.replacesId, supplier_id: supplierId, replaced_by_id: null },
          data: { replaced_by_id: document.id },
        });
        if (count === 0) throw new PurchaseError('El documento que querés reemplazar ya no está vigente');
      }
      return document;
    });
    revalidatePath(PURCHASES_PATH);
    return ok(created);
  } catch (error) {
    await storageRemove(DOCUMENTS_BUCKET, [path]);
    return toPurchaseActionError(error, logger, 'guardar el documento');
  }
}
