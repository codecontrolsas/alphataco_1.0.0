import 'server-only';

import type { EquipmentIndicatorResult } from '@/features/Dashboard/Principal/actions/types';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { CANCELLED_ROW_STATUS } from './dashboard-dates';
import { aggregateEquipmentIndicators } from './indicators';
import { buildTodayReportVehicleRelationsWhere } from './today-report-vehicles';

/**
 * Indicador de uso de equipos por tipo, calculado para una empresa. Es el cuerpo de `getEquipmentIndicators` sin la
 * sesión: la web lo llama después de validar el permiso y la empresa activa; la API móvil, con el contexto de su token.
 * Corre con el cliente contextual (el llamador fija el contexto de la empresa). Lanza si no se puede calcular.
 */
export async function computeEquipmentIndicators(
  companyId: string,
  typeIds: readonly string[]
): Promise<EquipmentIndicatorResult[]> {
  const typeFilter = typeIds.length ? { type: { in: [...typeIds] } } : {};

  const [allVehicles, reportRelations] = await Promise.all([
    prisma.vehicles.findMany({
      where: withCompany({ is_active: true, ...typeFilter }, companyId),
      select: { id: true, condition: true, type_vehicles_typeTotype: { select: { name: true } } },
    }),
    prisma.dailyreportequipmentrelations.findMany({
      where: buildTodayReportVehicleRelationsWhere(companyId, [...typeIds], true),
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
}
