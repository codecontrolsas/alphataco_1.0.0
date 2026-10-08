'use server';

import { revalidatePath } from 'next/cache';
import { checkPermissionServer } from '@/features/Permissions';
import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { toActionError } from '../lib/action-errors';
import { registerReturn, writeOffLoanedUnit } from '../lib/stock-engine';
import { StockError } from '../lib/stock-errors';
import { hasTireMaterials } from '../lib/tire-stock';
import { returnLoanSchema, writeOffLoanSchema, type ReturnLoanFormValues, type WriteOffLoanFormValues } from '../schemas/loans';

const logger = new Logger('features/Warehouses/loans');

const WAREHOUSE_PATH = '/dashboard/warehouse';
const TRANSACTION_OPTIONS = { timeout: 20_000, maxWait: 5_000 };

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Las cubiertas montadas se desmontan desde Gomeria (etapa 6), no como un prestamo. */
async function assertNotTireUnits(tx: Tx, companyId: string, unitIds: string[]) {
  const units = await tx.material_units.findMany({
    where: { id: { in: unitIds }, company_id: companyId },
    select: { material_id: true },
  });
  if (await hasTireMaterials(tx, units.map((u) => u.material_id))) {
    throw new StockError('MANAGED_ELSEWHERE', 'Las cubiertas montadas se desmontan desde Gomería');
  }
}

/** Depositos activos a los que se puede devolver. */
export async function getReturnWarehouses() {
  if (!(await checkPermissionServer('almacenes', 'prestamos', 'create'))) return [];
  const companyId = await getActiveCompanyId();
  return prisma.warehouses.findMany({
    where: { company_id: companyId, is_active: true },
    select: { id: true, code: true, name: true },
    orderBy: { name: 'asc' },
  });
}

interface ReturnResult {
  number: string;
  serials: string[];
  warehouseName: string;
}

/** Devuelve unidades prestadas al deposito elegido (genera un movimiento RETURN). */
export async function returnLoanedUnitsAction(values: ReturnLoanFormValues): Promise<ActionResult<ReturnResult>> {
  if (!(await checkPermissionServer('almacenes', 'prestamos', 'create'))) {
    return fail('No tenés permiso para registrar devoluciones');
  }
  const parsed = returnLoanSchema.safeParse(values);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos');

  const profile = await getServerAuthProfile();
  if (!profile) return fail('Tu sesión expiró. Volvé a ingresar.');
  const companyId = await getActiveCompanyId();

  try {
    const result = await withActor(
      profile.credentialId,
      async (tx) => {
        await assertNotTireUnits(tx, companyId, parsed.data.unitIds);
        const registered = await registerReturn(tx, companyId, profile.id, {
          exitMovementId: parsed.data.exitMovementId,
          unitIds: parsed.data.unitIds,
          warehouseId: parsed.data.warehouseId,
          occurredOn: parsed.data.occurredOn,
          notes: parsed.data.notes || null,
        });
        const [units, warehouse] = await Promise.all([
          tx.material_units.findMany({
            where: { id: { in: parsed.data.unitIds } },
            select: { serial_number: true },
            orderBy: { serial_number: 'asc' },
          }),
          tx.warehouses.findUniqueOrThrow({ where: { id: parsed.data.warehouseId }, select: { name: true } }),
        ]);
        return { number: registered.number, serials: units.map((u) => u.serial_number), warehouseName: warehouse.name };
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    logger.info('Devolucion registrada', { data: { number: result.number } });
    revalidatePath(WAREHOUSE_PATH);
    return ok(result);
  } catch (error) {
    return toActionError(error, logger, 'registrar la devolución');
  }
}

/** Da de baja una unidad prestada que no vuelve (extraviada o rota). */
export async function writeOffLoanedUnitAction(
  values: WriteOffLoanFormValues
): Promise<ActionResult<{ serialNumber: string }>> {
  if (!(await checkPermissionServer('almacenes', 'prestamos', 'delete'))) {
    return fail('No tenés permiso para dar de baja herramientas');
  }
  const parsed = writeOffLoanSchema.safeParse(values);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos');

  const profile = await getServerAuthProfile();
  if (!profile) return fail('Tu sesión expiró. Volvé a ingresar.');
  const companyId = await getActiveCompanyId();

  try {
    const result = await withActor(
      profile.credentialId,
      async (tx) => {
        await assertNotTireUnits(tx, companyId, [parsed.data.unitId]);
        return writeOffLoanedUnit(tx, companyId, profile.id, parsed.data);
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    logger.info('Unidad dada de baja', { data: { unitId: result.unitId } });
    revalidatePath(WAREHOUSE_PATH);
    return ok({ serialNumber: result.serialNumber });
  } catch (error) {
    return toActionError(error, logger, 'dar de baja la herramienta', 'Ese préstamo ya fue dado de baja');
  }
}
