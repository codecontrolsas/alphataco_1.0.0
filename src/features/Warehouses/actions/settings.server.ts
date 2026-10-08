'use server';

import { revalidatePath } from 'next/cache';
import { checkPermissionServer } from '@/features/Permissions';
import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { toActionError } from '../lib/action-errors';
import { directExitLimitSchema, type DirectExitLimitFormValues } from '../schemas/requests';
import { normalizeDecimal } from '../schemas/stock-movement';

const logger = new Logger('features/Warehouses/settings');

/** Monto maximo de salida directa de la empresa (`null` = sin limite). */
export async function getDirectExitSettings() {
  if (!(await checkPermissionServer('almacenes', 'config-almacen', 'view'))) return null;
  const companyId = await getActiveCompanyId();
  const row = await prisma.warehouse_settings.findUnique({
    where: { company_id: companyId },
    select: { direct_exit_max_amount: true },
  });
  return { directExitMaxAmount: row?.direct_exit_max_amount?.toFixed(2) ?? null };
}

export async function updateDirectExitLimitAction(values: DirectExitLimitFormValues): Promise<ActionResult> {
  if (!(await checkPermissionServer('almacenes', 'config-almacen', 'update'))) {
    return fail('No tenés permiso para cambiar la configuración de Almacenes');
  }
  const parsed = directExitLimitSchema.safeParse(values);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos');

  const profile = await getServerAuthProfile();
  if (!profile) return fail('Tu sesión expiró. Volvé a ingresar.');
  const companyId = await getActiveCompanyId();
  const amount = parsed.data.amount ? normalizeDecimal(parsed.data.amount) : null;

  try {
    await prisma.warehouse_settings.upsert({
      where: { company_id: companyId },
      create: { company_id: companyId, direct_exit_max_amount: amount, updated_by: profile.id },
      update: { direct_exit_max_amount: amount, updated_by: profile.id },
    });
    logger.info('Monto de salida directa actualizado', { data: { amount } });
    revalidatePath('/dashboard/warehouse');
    return ok(null);
  } catch (error) {
    return toActionError(error, logger, 'guardar la configuración');
  }
}
