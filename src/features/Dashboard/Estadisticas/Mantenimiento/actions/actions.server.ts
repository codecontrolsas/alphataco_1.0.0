'use server';

import { argentinaDayStart } from '@/features/Dashboard/Principal/lib/dashboard-dates';
import { requireDashboardView } from '@/features/Dashboard/lib/permissions.server';
import { OPEN_MAINTENANCE_REQUEST_WHERE } from '@/features/Mantenimiento/lib/open-requests';
import { MAINTENANCE_ORDER_TERMINAL_STATUSES } from '@/features/Mantenimiento/lib/order-status';
import { type_of_maintenance_ENUM, work_order_item_status, work_order_status } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import moment from 'moment';
import { UNKNOWN_SOURCE_KEY } from '../chart-constants';
import {
  CONTRACT_TYPES_BY_CATEGORY,
  categoryForContractType,
  computeDaysElapsed,
  emptyTypeMap,
  toSortedOptions,
} from '../lib/ownership';
import type {
  MaintenanceMonthSummary,
  MaintenanceVehicle,
  OwnershipCategory,
  VehicleStatus,
  WorkdaysAggregate,
} from '../types';
import { resolvePeriodInstants, type PeriodGranularity } from '../utils/periods';

const logger = new Logger('Dashboard/Estadisticas/Mantenimiento');

// ============================================================================
// CONSTANTES INTERNAS
// ============================================================================

// Solicitudes abiertas: `OPEN_MAINTENANCE_REQUEST_WHERE` (misma regla que la ficha del equipo).
// Pedidos: la misma constante que la ficha del equipo (`cancelled` no existe para los pedidos;
// el terminal que faltaba era `rejected`).
const TERMINAL_ORDER_STATUSES: string[] = [...MAINTENANCE_ORDER_TERMINAL_STATUSES];
const TERMINAL_WORK_ORDER_STATUSES: work_order_status[] = [
  work_order_status.completed,
  work_order_status.cancelled,
  work_order_status.completed_partial,
];

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Días DISTINTOS con parte (sin cancelados) por equipo en `[from, to)`, contados en Postgres.
 * `dailyreport.date` es `@db.Date`, así que se compara contra fechas calendario ISO.
 * `contractTypes` null = todos los equipos con tipo de contrato; si no, sólo esos tipos.
 */
async function queryWorkedDaysByVehicle(
  companyId: string,
  from: string,
  to: string,
  contractTypes: string[] | null
): Promise<{ vehicleId: string; days: number }[]> {
  const rows = await prisma.$queryRaw<{ vehicle_id: string; days: number }[]>`
    SELECT der.equipment_id::text AS vehicle_id, COUNT(DISTINCT dr.date)::int AS days
    FROM dailyreportequipmentrelations der
    JOIN vehicles v ON v.id = der.equipment_id
    JOIN dailyreportrows drr ON drr.id = der.daily_report_row_id
    JOIN dailyreport dr ON dr.id = drr.daily_report_id
    WHERE v.company_id = ${companyId}::uuid
      AND v.is_active = true
      AND v.type_of_contract IS NOT NULL
      AND (${contractTypes}::text[] IS NULL OR v.type_of_contract::text = ANY(${contractTypes}::text[]))
      AND drr.status <> 'cancelado'
      AND dr.company_id = ${companyId}::uuid
      AND dr.is_active = true
      AND dr.date >= ${from}::date
      AND dr.date < ${to}::date
    GROUP BY der.equipment_id
  `;
  return rows.map((row) => ({ vehicleId: row.vehicle_id, days: row.days }));
}

// ============================================================================
// SUMMARY (liviano — se carga upfront)
// ============================================================================

/**
 * Devuelve los datos LIVIANOS del dashboard de mantenimiento para el mes:
 * counts por categoria, tipos disponibles por categoria, counts por condicion.
 * NO incluye la lista de vehiculos ni dias trabajados — eso se pide on-demand
 * con `getMaintenanceCategoryVehicles` cuando se abre cada acordeon.
 */
export async function getMaintenanceMonthSummary(monthKey: string): Promise<MaintenanceMonthSummary> {
  await requireDashboardView('mantenimiento');
  const companyId = await getActiveCompanyId();
  logger.debug('Fetching maintenance month summary', { data: { companyId, monthKey } });

  try {
    const monthStart = moment.utc(monthKey, 'YYYY-MM').startOf('month');
    if (!monthStart.isValid()) {
      throw new Error(`Invalid monthKey: ${monthKey}`);
    }

    const monthEnd = monthStart.clone().add(1, 'month').startOf('month');
    const daysElapsed = computeDaysElapsed(monthStart);

    const baseWhere = {
      company_id: companyId,
      is_active: true,
      type_of_contract: { not: null },
    } as const;

    const [vehiclesLight, workedDaysRows, oldestReport] = await Promise.all([
      // Trae lo necesario para counts + types + condicion por categoria
      prisma.vehicles.findMany({
        where: baseWhere,
        select: {
          id: true,
          condition: true,
          type_of_contract: true,
          type_vehicles_typeTotype: { select: { id: true, name: true } },
        },
      }),
      // Para workdays globales: días DISTINTOS con parte (sin cancelados) por equipo del mes, contados
      // en la base. Antes se traían todas las relaciones del mes a Node para deduplicar fechas.
      queryWorkedDaysByVehicle(companyId, monthStart.format('YYYY-MM-DD'), monthEnd.format('YYYY-MM-DD'), null),
      prisma.dailyreport.findFirst({
        where: { company_id: companyId, is_active: true },
        orderBy: { date: 'asc' },
        select: { date: true },
      }),
    ]);

    // Estructura inicial vacia (helpers)
    const emptyConditionCounts = (): Record<VehicleStatus, number> => ({
      operativo: 0,
      operativo_condicionado: 0,
      en_preparacion: 0,
      no_operativo: 0,
      en_reparacion: 0,
    });

    // Counts, tipos y conditionCountsByCategory en una sola pasada
    const countsByCategory: Record<OwnershipCategory, number> = { Propios: 0, Leasing: 0, Contratados: 0 };
    const typesPerCat = emptyTypeMap();
    const conditionCountsByCategory: Record<OwnershipCategory, Record<VehicleStatus, number>> = {
      Propios: emptyConditionCounts(),
      Leasing: emptyConditionCounts(),
      Contratados: emptyConditionCounts(),
    };
    // Index vehicle id → categoria, para mapear los workedDays luego
    const categoryByVehicleId = new Map<string, OwnershipCategory>();

    for (const v of vehiclesLight) {
      const cat = categoryForContractType(v.type_of_contract);
      countsByCategory[cat] += 1;
      categoryByVehicleId.set(v.id, cat);

      const t = v.type_vehicles_typeTotype;
      if (t?.id && t?.name) typesPerCat[cat].set(t.id, t.name);

      // condition es nullable; default operativo (mismo criterio que en el detail action)
      const status = (v.condition as VehicleStatus | null) ?? 'operativo';
      if (status in conditionCountsByCategory[cat]) {
        conditionCountsByCategory[cat][status] += 1;
      }
    }

    const workdaysByCategory: Record<OwnershipCategory, WorkdaysAggregate> = {
      Propios: { worked: 0, possible: countsByCategory.Propios * daysElapsed },
      Leasing: { worked: 0, possible: countsByCategory.Leasing * daysElapsed },
      Contratados: { worked: 0, possible: countsByCategory.Contratados * daysElapsed },
    };
    for (const { vehicleId, days } of workedDaysRows) {
      const cat = categoryByVehicleId.get(vehicleId);
      if (!cat) continue;
      // Cap a daysElapsed: si se cargaron dias futuros, no inflan el worked.
      workdaysByCategory[cat].worked += Math.min(days, daysElapsed);
    }

    return {
      month: monthStart.format('YYYY-MM'),
      daysElapsed,
      daysInMonth: monthStart.daysInMonth(),
      countsByCategory,
      typesByCategory: {
        Propios: toSortedOptions(typesPerCat.Propios),
        Leasing: toSortedOptions(typesPerCat.Leasing),
        Contratados: toSortedOptions(typesPerCat.Contratados),
      },
      conditionCountsByCategory,
      workdaysByCategory,
      earliestMonth: oldestReport ? moment.utc(oldestReport.date).startOf('month').format('YYYY-MM') : null,
    };
  } catch (error) {
    logger.error('Error fetching maintenance month summary', { data: { error, monthKey } });
    throw error;
  }
}

// ============================================================================
// PER-CATEGORY DETAIL (pesado — se carga lazy al abrir cada acordeon)
// ============================================================================

/**
 * Devuelve los vehiculos detallados de UNA categoria para el mes dado:
 * - status (derivado de condition)
 * - workedDays (fechas unicas en daily reports del mes)
 * - workflows abiertos (counts de solicitudes, ordenes, reparaciones, work orders)
 */
export async function getMaintenanceCategoryVehicles(
  monthKey: string,
  category: OwnershipCategory
): Promise<MaintenanceVehicle[]> {
  await requireDashboardView('mantenimiento');
  const companyId = await getActiveCompanyId();
  logger.debug('Fetching maintenance category vehicles', { data: { companyId, monthKey, category } });

  try {
    const monthStart = moment.utc(monthKey, 'YYYY-MM').startOf('month');
    if (!monthStart.isValid()) {
      throw new Error(`Invalid monthKey: ${monthKey}`);
    }
    const monthEnd = monthStart.clone().add(1, 'month').startOf('month');
    const contractTypes = CONTRACT_TYPES_BY_CATEGORY[category];

    const [vehiclesRaw, workedDaysRows] = await Promise.all([
      prisma.vehicles.findMany({
        where: {
          company_id: companyId,
          is_active: true,
          type_of_contract: { in: contractTypes },
        },
        select: {
          id: true,
          domain: true,
          condition: true,
          type_of_contract: true,
          type_vehicles_typeTotype: { select: { id: true, name: true } },
          sub_type: { select: { id: true, name: true } },
          brand_vehicles: { select: { name: true } },
          model_vehicles: { select: { name: true } },
          _count: {
            select: {
              maintenance_requests: { where: OPEN_MAINTENANCE_REQUEST_WHERE },
              maintenance_orders: { where: { status: { notIn: TERMINAL_ORDER_STATUSES } } },
              work_orders: { where: { status: { notIn: TERMINAL_WORK_ORDER_STATUSES } } },
            },
          },
        },
        orderBy: { domain: 'asc' },
      }),
      queryWorkedDaysByVehicle(
        companyId,
        monthStart.format('YYYY-MM-DD'),
        monthEnd.format('YYYY-MM-DD'),
        contractTypes
      ),
    ]);

    const workedDaysByVehicle = new Map(workedDaysRows.map((row) => [row.vehicleId, row.days]));

    // Mapear al shape final
    const vehicles: MaintenanceVehicle[] = vehiclesRaw.map((v) => {
      const requests = v._count.maintenance_requests;
      const orders = v._count.maintenance_orders;
      const workOrders = v._count.work_orders;
      // condition es nullable pero por defecto es 'operativo'. Si llega null, asumimos operativo.
      const status: VehicleStatus = (v.condition as VehicleStatus | null) ?? 'operativo';
      return {
        id: v.id,
        domain: v.domain,
        brand: v.brand_vehicles?.name ?? null,
        model: v.model_vehicles?.name ?? null,
        category,
        typeId: v.type_vehicles_typeTotype?.id ?? null,
        typeName: v.type_vehicles_typeTotype?.name ?? null,
        subTypeId: v.sub_type?.id ?? null,
        subTypeName: v.sub_type?.name ?? null,
        status,
        workflows: {
          total: requests + orders + workOrders,
          requests,
          orders,
          workOrders,
        },
        workedDays: workedDaysByVehicle.get(v.id) ?? 0,
      };
    });

    return vehicles;
  } catch (error) {
    logger.error('Error fetching maintenance category vehicles', { data: { error, monthKey, category } });
    throw error;
  }
}

// ============================================================================
// EQUIPOS EN MANTENIMIENTO POR TIPO (ticket 233)
// ============================================================================

export type MaintenanceTypeVehicle = {
  id: string;
  domain: string | null;
  internNumber: string | null;
  status: VehicleStatus;
  kilometer: string | null;
  engineHours: string | null;
  /** Solicitudes/ordenes/OT/reparaciones abiertas (no terminales) del equipo. */
  openCount: number;
};

export type MaintenanceByTypeGroup = {
  typeId: string;
  typeName: string;
  /** Equipos unicos (dominios) de este tipo en mantenimiento en el mes. */
  count: number;
  vehicles: MaintenanceTypeVehicle[];
};

/**
 * Para el mes dado, agrupa por TIPO de equipo los equipos UNICOS (dominios) que
 * estuvieron en mantenimiento ese mes — definido como equipos que entraron al
 * taller (maintenance_orders.workshop_entry_date dentro del mes). Cada equipo
 * aparece una sola vez (findMany de vehicles = 1 fila por dominio) e incluye sus
 * solicitudes/procesos abiertos ACTUALES (openCount) para el detalle. Ordenado
 * por cantidad de equipos desc.
 */
export async function getMaintenanceByTypeForMonth(monthKey: string): Promise<MaintenanceByTypeGroup[]> {
  await requireDashboardView('mantenimiento');
  const companyId = await getActiveCompanyId();
  logger.debug('Fetching maintenance by type for month', { data: { companyId, monthKey } });

  try {
    const monthStart = moment.utc(monthKey, 'YYYY-MM').startOf('month');
    if (!monthStart.isValid()) {
      throw new Error(`Invalid monthKey: ${monthKey}`);
    }
    const monthEnd = monthStart.clone().add(1, 'month').startOf('month');

    const vehiclesRaw = await prisma.vehicles.findMany({
      where: {
        company_id: companyId,
        is_active: true,
        maintenance_orders: {
          some: {
            workshop_entry_date: {
              gte: argentinaDayStart(monthStart.format('YYYY-MM-DD')),
              lt: argentinaDayStart(monthEnd.format('YYYY-MM-DD')),
            },
          },
        },
      },
      select: {
        id: true,
        domain: true,
        intern_number: true,
        condition: true,
        kilometer: true,
        engine_hours: true,
        type_vehicles_typeTotype: { select: { id: true, name: true } },
        _count: {
          select: {
            maintenance_requests: { where: OPEN_MAINTENANCE_REQUEST_WHERE },
            maintenance_orders: { where: { status: { notIn: TERMINAL_ORDER_STATUSES } } },
            work_orders: { where: { status: { notIn: TERMINAL_WORK_ORDER_STATUSES } } },
          },
        },
      },
      orderBy: { domain: 'asc' },
    });

    // Agrupar por tipo. Cada vehiculo es un dominio unico (1 fila por equipo).
    const byType = new Map<string, MaintenanceByTypeGroup>();
    for (const v of vehiclesRaw) {
      const typeId = v.type_vehicles_typeTotype?.id ?? 'sin-tipo';
      const typeName = v.type_vehicles_typeTotype?.name ?? 'Sin tipo';
      let group = byType.get(typeId);
      if (!group) {
        group = { typeId, typeName, count: 0, vehicles: [] };
        byType.set(typeId, group);
      }
      const openCount = v._count.maintenance_requests + v._count.maintenance_orders + v._count.work_orders;
      group.vehicles.push({
        id: v.id,
        domain: v.domain,
        internNumber: v.intern_number,
        status: (v.condition as VehicleStatus | null) ?? 'operativo',
        kilometer: v.kilometer,
        engineHours: v.engine_hours,
        openCount,
      });
      group.count += 1;
    }

    return Array.from(byType.values()).sort((a, b) => b.count - a.count);
  } catch (error) {
    logger.error('Error fetching maintenance by type for month', { data: { error, monthKey } });
    throw error;
  }
}

// ============================================================================
// ORIGEN DE LAS SOLICITUDES DE MANTENIMIENTO (ticket 680)
// ============================================================================

export type RequestSourceSlice = {
  /** Valor crudo de `maintenance_requests.source` (o UNKNOWN_SOURCE_KEY si es null). */
  source: string;
  count: number;
};

export type RequestSourceStats = {
  /** Rango efectivo consultado, en ISO — para que la UI pueda mostrarlo si hace falta. */
  from: string;
  to: string;
  total: number;
  slices: RequestSourceSlice[];
};

/**
 * Ticket 680 — de dónde vienen las solicitudes de mantenimiento creadas dentro
 * del período (checklist / manual / preventivo).
 *
 * Agrega en la base con `groupBy`: nunca trae las solicitudes para contarlas en
 * memoria. El período se corta por `created_at`, que es la fecha en la que
 * nació la solicitud (el dato que el gráfico dice mostrar).
 */
export async function getMaintenanceRequestSourceStats(
  granularity: PeriodGranularity,
  anchor: string
): Promise<RequestSourceStats> {
  await requireDashboardView('mantenimiento');
  const companyId = await getActiveCompanyId();
  logger.debug('Fetching maintenance request source stats', { data: { companyId, granularity, anchor } });

  try {
    const { start, end } = resolvePeriodInstants(granularity, anchor);

    const grouped = await prisma.maintenance_requests.groupBy({
      by: ['source'],
      where: {
        created_at: { gte: start, lt: end },
        // La solicitud es de un vehiculo O de un equipamiento (excluyentes por
        // CHECK en BD). En los dos casos la empresa sale del recurso.
        OR: [{ vehicles: { company_id: companyId } }, { other_equipment: { company_id: companyId } }],
      },
      _count: { _all: true },
    });

    let total = 0;
    const slices: RequestSourceSlice[] = grouped.map((row) => {
      const count = row._count._all;
      total += count;
      return { source: row.source ?? UNKNOWN_SOURCE_KEY, count };
    });

    slices.sort((a, b) => b.count - a.count);

    return { from: start.toISOString(), to: end.toISOString(), total, slices };
  } catch (error) {
    logger.error('Error fetching maintenance request source stats', {
      data: { error, granularity, anchor },
    });
    throw error;
  }
}

// ============================================================================
// PREVENTIVO VS CORRECTIVO (ticket 682)
// ============================================================================

export type MaintenanceKindStats = {
  from: string;
  to: string;
  /** Tareas ejecutadas clasificadas, por tipo de mantenimiento. */
  counts: Record<type_of_maintenance_ENUM, number>;
  /** Suma de `counts` — el denominador de los porcentajes. */
  total: number;
  /**
   * Tareas ejecutadas cuyo tipo de reparación no tiene tipo de mantenimiento
   * cargado. No entran en los porcentajes; se avisan aparte para no inflar ni
   * ocultar el dato.
   */
  unclassified: number;
  /**
   * Tareas de diagnóstico completadas en el período. Se excluyen del cálculo
   * porque el diagnóstico se genera siempre y no es una reparación ejecutada
   * (criterio del cliente en la reunión del 10/09).
   */
  diagnostics: number;
};

/**
 * Ticket 682 — qué porcentaje del trabajo que ejecutó el taller fue preventivo
 * y qué porcentaje correctivo.
 *
 * La unidad es la TAREA EJECUTADA (`work_order_item_repairs` en estado
 * `completed`), que es lo único en el sistema que lleva el dato: la tarea
 * apunta a su tipo de reparación y el tipo de reparación tiene el tipo de
 * mantenimiento. El período se corta por `completed_at` — cuándo se ejecutó, no
 * cuándo se planificó.
 *
 * Se agrega en la base por `repair_type_id` y recién después se traduce a tipo
 * de mantenimiento con un único lookup de los tipos presentes (tabla chica):
 * Prisma no puede agrupar por un campo de la relación.
 */
export async function getMaintenanceKindStats(
  granularity: PeriodGranularity,
  anchor: string
): Promise<MaintenanceKindStats> {
  await requireDashboardView('mantenimiento');
  const companyId = await getActiveCompanyId();
  logger.debug('Fetching maintenance kind stats', { data: { companyId, granularity, anchor } });

  try {
    const { start, end } = resolvePeriodInstants(granularity, anchor);

    const periodWhere = {
      status: work_order_item_status.completed,
      completed_at: { gte: start, lt: end },
      work_order_items: { work_orders: { company_id: companyId } },
    } as const;

    const [grouped, diagnostics] = await Promise.all([
      prisma.work_order_item_repairs.groupBy({
        by: ['repair_type_id'],
        where: { ...periodWhere, is_diagnostico: false },
        _count: { _all: true },
      }),
      prisma.work_order_item_repairs.count({ where: { ...periodWhere, is_diagnostico: true } }),
    ]);

    const counts: Record<type_of_maintenance_ENUM, number> = {
      [type_of_maintenance_ENUM.Preventivo]: 0,
      [type_of_maintenance_ENUM.Correctivo]: 0,
      [type_of_maintenance_ENUM.Otro]: 0,
    };
    let unclassified = 0;

    if (grouped.length > 0) {
      const repairTypes = await prisma.types_of_repairs.findMany({
        where: { id: { in: grouped.map((row) => row.repair_type_id) } },
        select: { id: true, type_of_maintenance: true },
      });
      const kindByRepairType = new Map(repairTypes.map((t) => [t.id, t.type_of_maintenance]));

      for (const row of grouped) {
        const kind = kindByRepairType.get(row.repair_type_id) ?? null;
        if (kind) counts[kind] += row._count._all;
        else unclassified += row._count._all;
      }
    }

    const total = counts.Preventivo + counts.Correctivo + counts.Otro;

    return { from: start.toISOString(), to: end.toISOString(), counts, total, unclassified, diagnostics };
  } catch (error) {
    logger.error('Error fetching maintenance kind stats', { data: { error, granularity, anchor } });
    throw error;
  }
}
