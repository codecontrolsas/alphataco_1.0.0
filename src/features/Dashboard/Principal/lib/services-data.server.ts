import 'server-only';

import type { ServiceDetailByClient, ServicesSummaryResult } from '@/features/Dashboard/Principal/actions/types';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { buildTodayServicesWhere } from './dashboard-dates';
import { groupServicesByClient, summarizeServicesByType } from './indicators';

/**
 * Servicios del parte diario de una empresa: cuerpo de las acciones del tablero sin la sesión (la web las llama tras
 * validar permiso y empresa activa; la API móvil, con el contexto de su token). Mismo criterio único de «servicios del
 * día» (`buildTodayServicesWhere`) para la tarjeta, el resumen por tipo y el detalle por cliente. Corren con el cliente
 * contextual; lanzan si no se pueden calcular.
 */

/** Empleados activos de la empresa. */
export function countActiveEmployees(companyId: string) {
  return prisma.employees.count({ where: withCompany({ is_active: true }, companyId) });
}

/** Equipos activos de la empresa (toda la flota activa). */
export function countActiveVehicles(companyId: string) {
  return prisma.vehicles.count({ where: withCompany({ is_active: true }, companyId) });
}

/** Servicios del día: filas del parte de hoy (hora argentina) pendientes o ejecutadas. */
export function countTodayServices(companyId: string) {
  return prisma.dailyreportrows.count({ where: buildTodayServicesWhere(companyId) });
}

/** Resumen de servicios por tipo para hoy; los sin tipo van en «Sin tipo» para que el total coincida con la tarjeta. */
export async function computeServicesSummary(companyId: string): Promise<ServicesSummaryResult[]> {
  const grouped = await prisma.dailyreportrows.groupBy({
    by: ['type_service'],
    where: buildTodayServicesWhere(companyId),
    _count: { id: true },
  });
  return summarizeServicesByType(grouped);
}

/** Detalle de servicios por cliente para una fecha (por defecto, hoy en hora argentina). */
export async function computeServicesDetailByClient(companyId: string, date?: string): Promise<ServiceDetailByClient[]> {
  const rows = await prisma.dailyreportrows.findMany({
    where: buildTodayServicesWhere(companyId, date),
    select: {
      type_service: true,
      status: true,
      customers: { select: { id: true, name: true } },
    },
  });
  return groupServicesByClient(rows);
}
