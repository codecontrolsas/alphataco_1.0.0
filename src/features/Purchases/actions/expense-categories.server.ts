'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { isUuid } from '@/shared/lib/uuid';
import { revalidatePath } from 'next/cache';
import { NO_PERMISSION, firstIssue, toPurchaseActionError } from '../lib/action-errors';
import { expenseCategoryFormSchema, type ExpenseCategoryFormValues } from '../schemas/expense-categories';

const logger = new Logger('features/Purchases/expense-categories');

const PURCHASES_PATH = '/dashboard/purchases';
const NOT_FOUND = 'El concepto no existe';
const duplicate = (name: string) => `Ya existe el concepto «${name}»`;

/**
 * Conceptos de la empresa (activos e inactivos) con la cantidad de lineas que los usan. Los ve
 * quien administra la configuracion y quien carga comprobantes.
 */
export async function getExpenseCategories() {
  const [canConfig, canInvoice] = await Promise.all([
    checkPermissionServer('compras', 'config-compras', 'view'),
    checkPermissionServer('compras', 'facturas', 'create'),
  ]);
  if (!canConfig && !canInvoice) return [];
  const companyId = await getActiveCompanyId();
  const rows = await prisma.purchase_expense_categories.findMany({
    where: { company_id: companyId },
    select: { id: true, name: true, is_active: true, _count: { select: { lines: true } } },
    orderBy: { name: 'asc' },
  });
  return rows.map(({ _count, ...c }) => ({ ...c, lineCount: _count.lines }));
}

export type ExpenseCategoryRow = Awaited<ReturnType<typeof getExpenseCategories>>[number];

/** El nombre es unico por empresa sin distinguir mayusculas. */
async function findDuplicate(companyId: string, name: string, exceptId?: string) {
  return prisma.purchase_expense_categories.findFirst({
    where: {
      company_id: companyId,
      name: { equals: name, mode: 'insensitive' },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { name: true },
  });
}

export async function createExpenseCategory(values: ExpenseCategoryFormValues): Promise<ActionResult<{ id: string }>> {
  if (!(await checkPermissionServer('compras', 'config-compras', 'update'))) return fail(NO_PERMISSION);
  const parsed = expenseCategoryFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const companyId = await getActiveCompanyId();
  try {
    const existing = await findDuplicate(companyId, parsed.data.name);
    if (existing) return fail(duplicate(existing.name));
    const created = await prisma.purchase_expense_categories.create({
      data: { name: parsed.data.name },
      select: { id: true },
    });
    revalidatePath(PURCHASES_PATH);
    return ok(created);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'crear el concepto', duplicate(parsed.data.name));
  }
}

export async function renameExpenseCategory(id: string, values: ExpenseCategoryFormValues): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'config-compras', 'update'))) return fail(NO_PERMISSION);
  const parsed = expenseCategoryFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  if (!isUuid(id)) return fail(NOT_FOUND);
  const companyId = await getActiveCompanyId();
  try {
    const existing = await findDuplicate(companyId, parsed.data.name, id);
    if (existing) return fail(duplicate(existing.name));
    const { count } = await prisma.purchase_expense_categories.updateMany({
      where: { id, company_id: companyId },
      data: { name: parsed.data.name },
    });
    if (count === 0) return fail(NOT_FOUND);
    revalidatePath(PURCHASES_PATH);
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'renombrar el concepto', duplicate(parsed.data.name));
  }
}

/** Desactivar no lo quita de los comprobantes ya cargados: solo deja de ofrecerse. */
export async function setExpenseCategoryActive(id: string, isActive: boolean): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'config-compras', 'update'))) return fail(NO_PERMISSION);
  if (!isUuid(id)) return fail(NOT_FOUND);
  const companyId = await getActiveCompanyId();
  try {
    const { count } = await prisma.purchase_expense_categories.updateMany({
      where: { id, company_id: companyId },
      data: { is_active: isActive },
    });
    if (count === 0) return fail(NOT_FOUND);
    revalidatePath(PURCHASES_PATH);
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, isActive ? 'reactivar el concepto' : 'desactivar el concepto');
  }
}
