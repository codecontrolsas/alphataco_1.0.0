'use server';

import { requireDashboardView } from '@/features/Dashboard/lib/permissions.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { buildTodayReportWhere } from '../lib/dashboard-dates';
import { groupServicesByClient, summarizeServicesByType } from '../lib/indicators';
import type { ServiceDetailByClient, ServicesSummaryResult } from './types';

const logger = new Logger('features/Dashboard/Principal/services');

/**
 * Servicios del parte diario: resumen por tipo y detalle por cliente. Todo acotado a la empresa
 * activa (`getActiveCompanyId()`).
 */

/**
 * Resumen de servicios por tipo para hoy (hora argentina): partes pendientes o ejecutados que
 * tienen tipo de servicio informado. Los porcentajes son sobre TODOS los del día, incluso los
 * sin tipo, así que pueden no sumar 100.
 */
export async function getServicesSummary(): Promise<ServicesSummaryResult[]> {
  await requireDashboardView('principal');
  logger.debug('Obteniendo resumen de servicios por tipo');

  try {
    const companyId = await getActiveCompanyId();

    const grouped = await prisma.dailyreportrows.groupBy({
      by: ['type_service'],
      where: { status: { in: ['pendiente', 'ejecutado'] }, ...buildTodayReportWhere(companyId) },
      _count: { id: true },
    });

    return summarizeServicesByType(grouped);
  } catch (error) {
    logger.error('Error al obtener resumen de servicios', { data: { error } });
    // Sin dato no hay []: "sin servicios" se leería como un día sin actividad.
    throw error;
  }
}

/**
 * Detalle de servicios por cliente para una fecha (por defecto, hoy en hora argentina): sólo
 * partes pendientes o ejecutados que tienen cliente; el total cuenta tipos mensual y adicional.
 */
export async function getServicesDetailByClient(date?: string): Promise<ServiceDetailByClient[]> {
  await requireDashboardView('principal');
  logger.debug('Obteniendo detalle de servicios por cliente', { data: { date } });
  if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Fecha inválida');

  try {
    const companyId = await getActiveCompanyId();

    const rows = await prisma.dailyreportrows.findMany({
      where: {
        customer_id: { not: null },
        status: { in: ['pendiente', 'ejecutado'] },
        ...buildTodayReportWhere(companyId, date),
      },
      select: {
        type_service: true,
        status: true,
        customers: { select: { id: true, name: true } },
      },
    });

    return groupServicesByClient(rows);
  } catch (error) {
    logger.error('Error al obtener detalle de servicios por cliente', { data: { error } });
    throw error;
  }
}

export type ServicesDetailByClientData = Awaited<ReturnType<typeof getServicesDetailByClient>>;
