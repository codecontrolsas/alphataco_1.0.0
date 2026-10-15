'use server';

import { checkPermissionServer } from '@/features/Permissions';
import { argentinaDate } from '@/features/Jobs/lib/dates';
import { findExpiringBatches } from '../lib/expiring-batches';
import { getBelowMinimumMaterials } from '../lib/stock-levels';
import { getActiveCompanyId } from '@/shared/lib/tenant';

/**
 * Materiales activos bajo su stock minimo, agotados incluidos. La regla vive en `lib/stock-levels.ts`
 * (una sola para el aviso, el contador de la sub-navegacion y la columna "Bajo minimo").
 */
export async function getMaterialsBelowMinimum() {
  if (!(await checkPermissionServer('almacenes', 'stock', 'view'))) return [];
  return getBelowMinimumMaterials(await getActiveCompanyId());
}

/** Lotes con saldo vencidos o por vencer, para el aviso de Stock (ver `lib/expiring-batches.ts`). */
export async function getExpiringBatches() {
  if (!(await checkPermissionServer('almacenes', 'stock', 'view'))) return [];
  return findExpiringBatches(await getActiveCompanyId(), argentinaDate());
}
