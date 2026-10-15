'use server';

import { percentageOrNull } from '@/features/Dashboard/lib/metric';
import { requireDashboardView } from '@/features/Dashboard/lib/permissions.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { buildTodayReportWhere } from '../lib/dashboard-dates';
import { summarizeFleet } from '../lib/indicators';
import { getEquipmentIndicators } from './fleet.server';

const logger = new Logger('features/Dashboard/Principal/kpis');

/**
 * Tarjetas de KPIs del tablero. Cada tarjeta pide SOLO lo suyo, así cada una se muestra en
 * cuanto está lista (cada una va en su propio `<Suspense>`) y una falla no tumba a las demás.
 * Ante una falla las acciones lanzan: un 0 inventado se leería como dato real.
 */

/** Empleados activos de la empresa activa. */
export async function getActiveEmployeesKpi() {
  await requireDashboardView('principal');
  logger.debug('Obteniendo KPI de empleados activos');

  try {
    const companyId = await getActiveCompanyId();
    const activeEmployees = await prisma.employees.count({ where: withCompany({ is_active: true }, companyId) });
    return { activeEmployees };
  } catch (error) {
    logger.error('Error al obtener KPI de empleados activos', { data: { error } });
    throw error;
  }
}

/**
 * Flota para las tarjetas de equipos y operatividad.
 *
 * - `activeVehicles`: TODOS los equipos activos (coincide con `totalFleet`).
 * - `operativeVehicles`: activos que NO están fuera de servicio (no operativo / en reparación /
 *   en preparación). `fleetMinusRepair` es la misma cifra calculada como activos − fuera de servicio.
 * - `operativityPercentage`: operativos / flota total; `null` si no hay flota.
 */
export async function getFleetKpis() {
  await requireDashboardView('principal');
  logger.debug('Obteniendo KPIs de flota');

  try {
    const companyId = await getActiveCompanyId();

    const [activeVehicles, equipmentData] = await Promise.all([
      prisma.vehicles.count({ where: withCompany({ is_active: true }, companyId) }),
      getEquipmentIndicators(),
    ]);

    const fleet = summarizeFleet(equipmentData);

    return {
      activeVehicles,
      operativeVehicles: fleet.operative,
      totalFleet: fleet.total,
      fleetMinusRepair: activeVehicles - fleet.notAvailable,
      operativityPercentage: percentageOrNull(fleet.operative, fleet.total),
    };
  } catch (error) {
    logger.error('Error al obtener KPIs de flota', { data: { error } });
    throw error;
  }
}

/**
 * Servicios del día: filas del parte diario de HOY (hora argentina) con estado pendiente o
 * ejecutado, de cualquier tipo y con o sin cliente.
 */
export async function getTodayServicesKpi() {
  await requireDashboardView('principal');
  logger.debug('Obteniendo KPI de servicios del día');

  try {
    const companyId = await getActiveCompanyId();
    const totalServices = await prisma.dailyreportrows.count({
      where: { status: { in: ['pendiente', 'ejecutado'] }, ...buildTodayReportWhere(companyId) },
    });
    return { totalServices };
  } catch (error) {
    logger.error('Error al obtener KPI de servicios del día', { data: { error } });
    throw error;
  }
}

export type FleetKpisData = Awaited<ReturnType<typeof getFleetKpis>>;
