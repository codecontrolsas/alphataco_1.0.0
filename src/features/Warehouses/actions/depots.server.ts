'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import {
  NO_PERMISSION,
  WAREHOUSE_PATH,
  firstIssue,
  isForeignKeyError,
  nullable,
  toActionError,
} from '../lib/action-errors';
import { warehouseRemoval, type RemovalMode } from '../lib/catalog-rules';
import { findEmployeeOptions } from '../lib/employee-search';
import { employeeLabel } from '../lib/labels';
import { warehouseFormSchema, type WarehouseFormValues } from '../schemas/catalog';

const logger = new Logger('features/Warehouses/catalog');

async function assertManager(companyId: string, employeeId: string | null) {
  if (!employeeId) return null;
  const employee = await prisma.employees.findFirst({
    where: { id: employeeId, company_id: companyId, is_active: true },
    select: { id: true },
  });
  return employee ? null : 'El responsable no existe o está dado de baja';
}

export async function createWarehouse(values: WarehouseFormValues): Promise<ActionResult<{ id: string }>> {
  if (!(await checkPermissionServer('almacenes', 'depositos', 'create'))) return fail(NO_PERMISSION);
  const parsed = warehouseFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const companyId = await getActiveCompanyId();
  const managerId = nullable(parsed.data.managerEmployeeId);
  try {
    const managerError = await assertManager(companyId, managerId);
    if (managerError) return fail(managerError);

    const created = await prisma.warehouses.create({
      data: {
        code: parsed.data.code,
        name: parsed.data.name,
        address: nullable(parsed.data.address),
        manager_employee_id: managerId,
      },
      select: { id: true },
    });
    revalidatePath(WAREHOUSE_PATH);
    return ok(created);
  } catch (error) {
    return toActionError(error, logger, 'crear el depósito', 'Ya existe un depósito con ese código o nombre');
  }
}

export async function updateWarehouse(id: string, values: WarehouseFormValues): Promise<ActionResult> {
  if (!(await checkPermissionServer('almacenes', 'depositos', 'update'))) return fail(NO_PERMISSION);
  const parsed = warehouseFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const companyId = await getActiveCompanyId();
  const managerId = nullable(parsed.data.managerEmployeeId);
  try {
    const managerError = await assertManager(companyId, managerId);
    if (managerError) return fail(managerError);

    const { count } = await prisma.warehouses.updateMany({
      where: { id, company_id: companyId },
      data: {
        code: parsed.data.code,
        name: parsed.data.name,
        address: nullable(parsed.data.address),
        manager_employee_id: managerId,
      },
    });
    if (count === 0) return fail('El depósito no existe');
    revalidatePath(WAREHOUSE_PATH);
    return ok(null);
  } catch (error) {
    return toActionError(error, logger, 'actualizar el depósito', 'Ya existe un depósito con ese código o nombre');
  }
}

/**
 * Borra un deposito sin historial o lo desactiva; con stock, se rechaza.
 *
 * Todo en una transaccion que PRIMERO lockea el deposito (FOR UPDATE) y recien despues mira
 * saldos y movimientos. El motor de stock lo lee con FOR SHARE (paso 3 del orden de locks de
 * `lib/stock-engine.ts`), asi que un movimiento en curso termina antes de que se evalue la baja,
 * y uno nuevo espera a que la baja confirme y ve el deposito inactivo o borrado. Este camino no
 * toma otro lock antes del deposito: no puede cerrar un ciclo con el motor.
 */
export async function removeWarehouse(id: string): Promise<ActionResult<{ mode: RemovalMode }>> {
  if (!(await checkPermissionServer('almacenes', 'depositos', 'delete'))) return fail(NO_PERMISSION);
  const companyId = await getActiveCompanyId();
  try {
    const result = await prisma.$transaction(async (tx): Promise<ActionResult<{ mode: RemovalMode }>> => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM warehouses
        WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid
        FOR UPDATE
      `;
      if (locked.length === 0) return fail('El depósito no existe');

      // Sentencias separadas despues del lock: cada una ve lo que confirmo un movimiento que se esperaba.
      const stock = await tx.stock_balances.aggregate({ where: { warehouse_id: id }, _sum: { quantity: true } });
      const movementCount = await tx.stock_movements.count({
        where: { OR: [{ warehouse_id: id }, { target_warehouse_id: id }] },
      });
      const decision = warehouseRemoval(Number(stock._sum.quantity ?? 0), movementCount);
      if ('error' in decision) return fail(decision.error);

      if (decision.mode === 'delete') {
        await tx.stock_balances.deleteMany({ where: { warehouse_id: id } });
        await tx.warehouses.delete({ where: { id } });
      } else {
        await tx.warehouses.update({ where: { id }, data: { is_active: false } });
      }
      return ok({ mode: decision.mode });
    });
    if (result.ok) revalidatePath(WAREHOUSE_PATH);
    return result;
  } catch (error) {
    if (isForeignKeyError(error)) {
      return fail(
        'El depósito tiene registros asociados (recepciones de compra, entregas de ropa o unidades): no se puede borrar. Desactivalo.'
      );
    }
    return toActionError(error, logger, 'dar de baja el depósito');
  }
}

export async function reactivateWarehouse(id: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('almacenes', 'depositos', 'update'))) return fail(NO_PERMISSION);
  const companyId = await getActiveCompanyId();
  try {
    const { count } = await prisma.warehouses.updateMany({
      where: { id, company_id: companyId },
      data: { is_active: true },
    });
    if (count === 0) return fail('El depósito no existe');
    revalidatePath(WAREHOUSE_PATH);
    return ok(null);
  } catch (error) {
    return toActionError(error, logger, 'reactivar el depósito');
  }
}

/** Responsables posibles de un deposito (empleados activos), para el formulario. */
export async function searchDepotManagerOptions(query: string) {
  const [canCreate, canUpdate] = await Promise.all([
    checkPermissionServer('almacenes', 'depositos', 'create'),
    checkPermissionServer('almacenes', 'depositos', 'update'),
  ]);
  if (!canCreate && !canUpdate) return { items: [], total: 0 };
  return findEmployeeOptions(await getActiveCompanyId(), query, 30);
}

/** Datos de un deposito para el formulario de edicion. */
export async function getDepotForEdit(id: string) {
  if (!(await checkPermissionServer('almacenes', 'depositos', 'view'))) return null;
  const companyId = await getActiveCompanyId();
  const depot = await prisma.warehouses.findFirst({
    where: { id, company_id: companyId },
    select: {
      id: true,
      code: true,
      name: true,
      address: true,
      manager_employee_id: true,
      manager: { select: { file: true, lastname: true, firstname: true } },
    },
  });
  if (!depot) return null;
  const { manager, ...rest } = depot;
  return { ...rest, managerLabel: manager ? employeeLabel(manager) : null };
}

export type DepotForEdit = NonNullable<Awaited<ReturnType<typeof getDepotForEdit>>>;
