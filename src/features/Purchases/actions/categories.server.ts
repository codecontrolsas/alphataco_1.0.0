'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { isUuid } from '@/shared/lib/uuid';
import { revalidatePath } from 'next/cache';
import { NO_PERMISSION, firstIssue, toPurchaseActionError } from '../lib/action-errors';
import { supplierCategoryFormSchema, type SupplierCategoryFormValues } from '../schemas/suppliers';

const logger = new Logger('features/Purchases/categories');

const PURCHASES_PATH = '/dashboard/purchases';
const DUPLICATE = 'Ya existe un rubro con ese nombre';

/** Rubros de la empresa (activos e inactivos) con la cantidad de proveedores de cada uno. */
export async function getSupplierCategories() {
  if (!(await checkPermissionServer('compras', 'config-compras', 'view'))) return [];
  const companyId = await getActiveCompanyId();
  const rows = await prisma.supplier_categories.findMany({
    where: { company_id: companyId },
    select: { id: true, name: true, is_active: true, _count: { select: { links: true } } },
    orderBy: { name: 'asc' },
  });
  return rows.map(({ _count, ...c }) => ({ ...c, supplierCount: _count.links }));
}

export type SupplierCategoryRow = Awaited<ReturnType<typeof getSupplierCategories>>[number];

export async function createSupplierCategory(
  values: SupplierCategoryFormValues
): Promise<ActionResult<{ id: string }>> {
  if (!(await checkPermissionServer('compras', 'config-compras', 'update'))) return fail(NO_PERMISSION);
  const parsed = supplierCategoryFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const companyId = await getActiveCompanyId();
  try {
    const created = await prisma.supplier_categories.create({
      data: { name: parsed.data.name },
      select: { id: true },
    });
    revalidatePath(PURCHASES_PATH);
    return ok(created);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'crear el rubro', DUPLICATE);
  }
}

export async function updateSupplierCategory(id: string, values: SupplierCategoryFormValues): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'config-compras', 'update'))) return fail(NO_PERMISSION);
  const parsed = supplierCategoryFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  if (!isUuid(id)) return fail('El rubro no existe');
  const companyId = await getActiveCompanyId();
  try {
    const { count } = await prisma.supplier_categories.updateMany({
      where: { id, company_id: companyId },
      data: { name: parsed.data.name },
    });
    if (count === 0) return fail('El rubro no existe');
    revalidatePath(PURCHASES_PATH);
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'actualizar el rubro', DUPLICATE);
  }
}

/**
 * Activa o desactiva un rubro. Desactivarlo no lo quita de los proveedores que ya lo tienen:
 * solo deja de ofrecerse al cargar uno nuevo.
 */
export async function setSupplierCategoryActive(id: string, isActive: boolean): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'config-compras', 'update'))) return fail(NO_PERMISSION);
  if (!isUuid(id)) return fail('El rubro no existe');
  const companyId = await getActiveCompanyId();
  try {
    const { count } = await prisma.supplier_categories.updateMany({
      where: { id, company_id: companyId },
      data: { is_active: isActive },
    });
    if (count === 0) return fail('El rubro no existe');
    revalidatePath(PURCHASES_PATH);
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, isActive ? 'reactivar el rubro' : 'desactivar el rubro');
  }
}
