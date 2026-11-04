'use server';

import { requireDashboardView } from '@/features/Dashboard/lib/permissions.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { cache } from 'react';
import { computeEquipmentIndicators } from '../lib/equipment-indicators.server';
import type { EquipmentIndicatorResult } from './types';

const logger = new Logger('features/Dashboard/Principal/fleet');

/**
 * Flota del dashboard principal: indicadores de uso de equipos. Las tablas de los diálogos
 * (disponibles y fuera de servicio) están en `fleet-lists.server.ts`.
 *
 * Perímetro: todo sale de `getActiveCompanyId()`; los `typeIds` que manda el cliente sólo
 * acotan más el listado, nunca lo amplían fuera de la empresa activa.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Indicadores
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Memoizado por request con clave PRIMITIVA: un array de `typeIds` nuevo en cada llamada no
 * reutiliza `cache()` (compara por identidad), un string sí. La clave son los ids ordenados.
 */
const loadEquipmentIndicators = cache(async (typeIdsKey: string): Promise<EquipmentIndicatorResult[]> => {
  logger.debug('Obteniendo indicadores de equipos', { data: { typeIdsKey } });

  try {
    const companyId = await getActiveCompanyId();
    return await computeEquipmentIndicators(companyId, typeIdsKey ? typeIdsKey.split(',') : []);
  } catch (error) {
    logger.error('Error al obtener indicadores de equipos', { data: { error } });
    // Sin dato no hay []: una flota vacía se leería como "no hay equipos".
    throw error;
  }
});

/** Indicador de uso de equipos por tipo. Lanza si no se puede calcular. */
export async function getEquipmentIndicators(typeIds?: string[]): Promise<EquipmentIndicatorResult[]> {
  await requireDashboardView('principal');
  const key = [...new Set(typeIds ?? [])].filter(Boolean).sort().join(',');
  return loadEquipmentIndicators(key);
}

/**
 * Tipos de vehículo disponibles para el filtro: los de la empresa activa más los globales
 * (`company_id IS NULL`).
 */
const loadAllVehicleTypes = cache(async () => {
  logger.debug('Obteniendo todos los tipos de vehículos');

  try {
    const companyId = await getActiveCompanyId();

    return await prisma.type.findMany({
      where: {
        is_active: true,
        applies_to: 'vehicle',
        company_id: companyId,
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener tipos de vehículos', { data: { error } });
    throw error;
  }
});

/** Memoizado por request: las dos secciones de flota lo piden en el mismo render. */
export async function getAllVehicleTypes() {
  await requireDashboardView('principal');
  return loadAllVehicleTypes();
}
