'use server';

import { revalidatePath } from 'next/cache';
import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { toActionError } from '../lib/action-errors';
import {
  getTiresWithoutStock,
  registerInitialTireInventory,
  type InitialInventoryResult,
} from '../lib/tire-stock';
import { normalizeDecimal } from '../schemas/stock-movement';
import { tireInventorySchema, type TireInventoryFormValues } from '../schemas/tire-inventory';

const logger = new Logger('features/Warehouses/tire-inventory');

const WAREHOUSE_PATH = '/dashboard/warehouse';
/** Puede cargar cientos de cubiertas con sus salidas: mas margen que los 5 s por defecto. */
const TRANSACTION_OPTIONS = { timeout: 60_000, maxWait: 5_000 };

/**
 * Cubiertas de Gomeria sin stock, agrupadas por tipo + marca, para la seccion "Inventario inicial
 * de cubiertas" (spec etapa 6 §3.5). Vacio si no hay o si el usuario no puede ajustar stock.
 */
export async function getTiresWithoutStockAction() {
  if (!(await checkPermissionServer('almacenes', 'movimientos', 'adjust'))) return [];
  const companyId = await getActiveCompanyId();
  return getTiresWithoutStock(prisma, companyId);
}

export type TiresWithoutStockGroup = Awaited<ReturnType<typeof getTiresWithoutStockAction>>[number];

/** Carga el inventario inicial: una entrada con todas las cubiertas sin stock y las salidas de las que estan afuera. */
export async function registerInitialTireInventoryAction(
  values: TireInventoryFormValues
): Promise<ActionResult<InitialInventoryResult>> {
  if (!(await checkPermissionServer('almacenes', 'movimientos', 'adjust'))) {
    return fail('No tenés permiso para ajustar stock');
  }
  const parsed = tireInventorySchema.safeParse(values);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos');

  const profile = await getServerAuthProfile();
  if (!profile) return fail('Tu sesión expiró. Volvé a ingresar.');
  const companyId = await getActiveCompanyId();

  try {
    const result = await withActor(
      profile.credentialId,
      (tx) =>
        registerInitialTireInventory(tx, companyId, profile.id, {
          warehouseId: parsed.data.warehouseId,
          costs: parsed.data.costs.map((c) => ({ ...c, unitCost: normalizeDecimal(c.unitCost) })),
        }),
      prisma,
      TRANSACTION_OPTIONS
    );
    logger.info('Inventario inicial de cubiertas cargado', { data: { entry: result.entryNumber, tires: result.tires } });
    revalidatePath(WAREHOUSE_PATH);
    return ok(result);
  } catch (error) {
    return toActionError(error, logger, 'cargar el inventario inicial de cubiertas');
  }
}

/** Depositos activos para el inventario inicial. */
export async function getTireInventoryWarehouses() {
  if (!(await checkPermissionServer('almacenes', 'movimientos', 'adjust'))) return [];
  const companyId = await getActiveCompanyId();
  return prisma.warehouses.findMany({
    where: { company_id: companyId, is_active: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}
