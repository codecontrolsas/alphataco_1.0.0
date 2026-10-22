import type { Prisma } from '@/generated/prisma/client';
import { CANCELLED_ROW_STATUS, getOperationToday } from './dashboard-dates';

/**
 * Relaciones equipo ↔ parte de HOY de la empresa: los equipos "en operaciones" (sin los servicios
 * cancelados). La usan el indicador y el diálogo de disponibles, así los dos excluyen el mismo
 * conjunto. `includeCancelled` trae todas las filas, para informar aparte las canceladas.
 */
export function buildTodayReportVehicleRelationsWhere(
  companyId: string,
  typeIds: readonly string[] | undefined,
  includeCancelled = false
) {
  const typeFilter = typeIds?.length ? { type: { in: [...typeIds] } } : {};
  return {
    equipment_id: { not: null },
    dailyreportrows: {
      status: includeCancelled ? undefined : { not: CANCELLED_ROW_STATUS },
      dailyreport: { date: new Date(getOperationToday()), is_active: true, company_id: companyId },
    },
    vehicles: { is_active: true, company_id: companyId, ...typeFilter },
  } satisfies Prisma.dailyreportequipmentrelationsWhereInput;
}
