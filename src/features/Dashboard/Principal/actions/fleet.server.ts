'use server';

import { requireDashboardView } from '@/features/Dashboard/lib/permissions.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { cache } from 'react';
import { CANCELLED_ROW_STATUS } from '../lib/dashboard-dates';
import { aggregateEquipmentIndicators } from '../lib/indicators';
import { buildTodayReportVehicleRelationsWhere } from '../lib/today-report-vehicles';
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
    const typeIds = typeIdsKey ? typeIdsKey.split(',') : [];
    const typeFilter = typeIds.length ? { type: { in: typeIds } } : {};

    const [allVehicles, reportRelations] = await Promise.all([
      prisma.vehicles.findMany({
        where: withCompany({ is_active: true, ...typeFilter }, companyId),
        select: { id: true, condition: true, type_vehicles_typeTotype: { select: { name: true } } },
      }),
      prisma.dailyreportequipmentrelations.findMany({
        where: buildTodayReportVehicleRelationsWhere(companyId, typeIds, true),
        select: { equipment_id: true, dailyreportrows: { select: { status: true } } },
      }),
    ]);

    const usedIds = new Set<string>();
    const inCancelledIds = new Set<string>();
    for (const relation of reportRelations) {
      if (!relation.equipment_id) continue;
      if (relation.dailyreportrows?.status === CANCELLED_ROW_STATUS) inCancelledIds.add(relation.equipment_id);
      else usedIds.add(relation.equipment_id);
    }

    return aggregateEquipmentIndicators(allVehicles, usedIds, inCancelledIds);
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
