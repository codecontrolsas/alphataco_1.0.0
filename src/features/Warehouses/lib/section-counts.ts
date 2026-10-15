import 'server-only';

import { argentinaDate } from '@/features/Jobs/lib/dates';
import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { cache } from 'react';
import { findExpiringBatches } from './expiring-batches';
import { openLoansWhere } from './loans';
import { requestScopeConditions, resolveRequestScope } from './request-scope';
import { countBelowMinimum } from './stock-levels';

/**
 * Contadores de la sub-navegación de Almacenes. Cada función va envuelta en `React.cache` (sin
 * argumentos) para que, dentro de un mismo request, la sección activa y su contador no repitan la
 * consulta. Cada una respeta el permiso `view` de su sección y comparte regla con su lista.
 * `null` = no se pudo calcular o no corresponde mostrarlo: la UI muestra "—", nunca un 0 inventado.
 */

/** Stock = materiales bajo su mínimo + lotes vencidos o por vencer (los dos avisos de la sección). */
export const getStockSectionCount = cache(async (): Promise<number | null> => {
  if (!(await checkPermissionServer('almacenes', 'stock', 'view'))) return null;
  const companyId = await getActiveCompanyId();
  const [belowMin, batches] = await Promise.all([
    countBelowMinimum(companyId),
    findExpiringBatches(companyId, argentinaDate()),
  ]);
  return belowMin + batches.length;
});

/**
 * Pedidos = pendientes de aprobación. Misma visibilidad que la lista: comparte el alcance con ella
 * (`request-scope.ts`).
 */
export const getRequestsSectionCount = cache(async (): Promise<number | null> => {
  const scope = await resolveRequestScope();
  if (!scope) return null;
  return prisma.material_requests.count({
    where: { AND: [...requestScopeConditions(scope), { status: 'PENDING_APPROVAL' }] },
  });
});

/** Préstamos = abiertos (`openLoansWhere`, el mismo filtro base que la lista). */
export const getLoansSectionCount = cache(async (): Promise<number | null> => {
  if (!(await checkPermissionServer('almacenes', 'prestamos', 'view'))) return null;
  return prisma.material_units.count({ where: openLoansWhere(await getActiveCompanyId()) });
});
