import 'server-only';

import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { prisma } from '@/shared/lib/prisma';
import { ATTENTION_THRESHOLDS, argentinaTodayAsUtcDate, daysAgo } from '../../lib/attention-thresholds';
import { resourceCompanyCondition, visibleEquipmentTypeCondition } from '../../shared/maintenance-resource';
import { getHiddenEquipmentTypeIds } from '../../utils/equipmentTypeVisibility';
import { getSupervisorFilterInfo } from '../../utils/supervisorFilter';
import type { ConfirmedAttentionKey, PendingAttentionKey } from '../constants';

/**
 * Armado de consultas compartido por las listas de pedidos de mantenimiento (Pendientes, Confirmados) y por
 * el Seguimiento de taller: las tres listan `maintenance_orders` cuyo recurso es un vehículo o un equipamiento
 * (ticket 596), con el mismo perímetro (empresa + tipos ocultos + supervisor) y el mismo filtro de equipo.
 *
 * Todo lo que devuelve va para meter DENTRO de un único `AND` (ver `assembleOrdersWhere`): varias de estas
 * condiciones son un `OR` y, spreadeadas al nivel raíz, una pisaría a la otra y se perdería la empresa.
 *
 * Módulo server-only SIN `'use server'`: no es un endpoint, lo importan los archivos de acciones.
 */

type WhereCondition = Record<string, unknown>;

/** Tope de filas de un export: más que esto no se descarga entero (se pide acotar con filtros). */
export const ORDER_LIST_EXPORT_MAX_ROWS = 10_000;

// ============================================================================
// PERÍMETRO
// ============================================================================

export interface OrderListScope {
  companyId: string;
  /** `null` si el usuario puede ver todas las solicitudes; si no, el perfil del supervisor. */
  supervisorId: string | null;
  hiddenTypeIds: readonly string[];
}

/**
 * Resuelve lo que acota la lista para el usuario actual. Si no se puede identificar al usuario NO se asume
 * "ve todo": se corta (antes `null` equivalía a sin filtro de supervisor).
 */
export async function resolveOrderListScope(companyId: string): Promise<OrderListScope> {
  const [filterInfo, hiddenTypeIds] = await Promise.all([getSupervisorFilterInfo(), getHiddenEquipmentTypeIds()]);
  if (!filterInfo) throw new Error('No se pudo verificar el usuario');

  return {
    companyId,
    supervisorId: filterInfo.shouldFilterBySupervisor ? filterInfo.userId : null,
    hiddenTypeIds,
  };
}

/** Condiciones de perímetro: empresa del recurso, tipos de equipamiento ocultos y filtro de supervisor. */
export function scopeConditions(scope: OrderListScope): WhereCondition[] {
  const equipmentCondition = visibleEquipmentTypeCondition(scope.hiddenTypeIds);
  return [
    resourceCompanyCondition(scope.companyId),
    ...(equipmentCondition ? [equipmentCondition] : []),
    ...(scope.supervisorId ? [{ maintenance_requests: { supervisor_id: scope.supervisorId } }] : []),
  ];
}

/**
 * Arma el `where` final: todo dentro de un único `AND`. El `AND` que devuelve `buildFiltersWhere` cuando se
 * mezcla "Sin asignar" con valores se desarma y se integra (si se spreadeara al raíz pisaría al perímetro).
 */
export function assembleOrdersWhere(parts: {
  scope: WhereCondition[];
  /** Condiciones ya armadas (búsqueda, filtros manuales, estado). */
  extra: WhereCondition[];
  /** Resultado de `buildFiltersWhere` (puede traer un `AND`). */
  filtersWhere?: WhereCondition;
  /** Resultados de `buildTextFiltersWhere` / `buildDateRangeFiltersWhere`. */
  simple?: WhereCondition[];
}) {
  const { AND: filtersAnd, ...filtersRest } = (parts.filtersWhere ?? {}) as WhereCondition & { AND?: unknown };
  const nestedAnd = Array.isArray(filtersAnd)
    ? (filtersAnd as WhereCondition[])
    : filtersAnd
      ? [filtersAnd as WhereCondition]
      : [];

  const and: WhereCondition[] = [...parts.scope, ...parts.extra, ...nestedAnd];
  if (Object.keys(filtersRest).length > 0) and.push(filtersRest);
  for (const piece of parts.simple ?? []) {
    if (Object.keys(piece).length > 0) and.push(piece);
  }

  return { AND: and };
}

// ============================================================================
// ATENCIÓN (filtro virtual `attention` de Por Programar y Por Ingresar)
// ============================================================================

/** Estado por defecto de cada lista: el `where` de la tabla sin filtros y el de sus métricas parten de acá. */
export const PENDING_LIST_DEFAULT_STATUS = 'pending_scheduling';
export const CONFIRMED_LIST_STATUS = 'date_confirmed';

/**
 * Condición de cada valor de `attention` en "Por Programar". La usan el listado (filtro virtual) y las métricas:
 * la tarjeta y el total de la tabla al filtrarla salen de esta misma condición, así que no pueden diferir.
 * - `overdue`: aprobado hace más de 7 días sin fecha (desde `created_at`, que es la "Fecha Aprobación").
 * - `date_rejected`: la fecha propuesta fue rechazada y el pedido volvió a programarse.
 * - `preventive`: nace del programa de mantenimiento (origen efectivo, el mismo que muestra la celda).
 */
export function pendingAttentionCondition(key: PendingAttentionKey, now: Date = new Date()): WhereCondition {
  switch (key) {
    case 'overdue':
      return { created_at: { lt: daysAgo(ATTENTION_THRESHOLDS.schedulingPendingDays, now) } };
    case 'date_rejected':
      return { date_rejected_at: { not: null } };
    case 'preventive':
      return effectiveSourceCondition(['preventive']);
  }
}

/**
 * Condición de cada valor de `attention` en "Por Ingresar".
 * - `past_date`: la fecha planificada es anterior a hoy (día argentino) y el equipo todavía no ingresó.
 */
export function confirmedAttentionCondition(key: ConfirmedAttentionKey): WhereCondition {
  switch (key) {
    case 'past_date':
      return { scheduled_date: { lt: argentinaTodayAsUtcDate() } };
  }
}

// ============================================================================
// CONDICIONES DE RECURSO (vehículo o equipamiento)
// ============================================================================

/** Búsqueda global: dominio / serie / N° interno del vehículo, serie / N° interno del equipamiento y N° de pedido. */
export function resourceSearchCondition(search: string): WhereCondition {
  const contains = { contains: search, mode: 'insensitive' as const };
  return {
    OR: [
      { vehicles: { OR: [{ domain: contains }, { serie: contains }, { intern_number: contains }] } },
      { other_equipment: { OR: [{ serial_number: contains }, { intern_number: contains }] } },
      { order_number: contains },
    ],
  };
}

/** Filtro "Equipo": el id puede ser de un vehículo o de un equipamiento; `NULL_FILTER_VALUE` = sin recurso. */
export function resourceIdsCondition(values: string[]): WhereCondition {
  const realValues = values.filter((v) => v !== NULL_FILTER_VALUE);
  const branches: WhereCondition[] = [];
  if (realValues.length > 0) {
    branches.push({ equipment_id: { in: realValues } }, { other_equipment_id: { in: realValues } });
  }
  if (values.includes(NULL_FILTER_VALUE)) branches.push({ equipment_id: null, other_equipment_id: null });
  return { OR: branches };
}

/** Filtro "Condición": el enum vive en el vehículo o en el equipamiento (mismo `condition_enum`). */
export function resourceConditionCondition(values: string[]): WhereCondition {
  const realValues = values.filter((v) => v !== NULL_FILTER_VALUE);
  const branches: WhereCondition[] = [];
  if (realValues.length > 0) {
    branches.push(
      { vehicles: { condition: { in: realValues } } },
      { other_equipment: { condition: { in: realValues } } }
    );
  }
  if (values.includes(NULL_FILTER_VALUE)) {
    branches.push({ vehicles: { condition: null } }, { other_equipment: { condition: null } });
  }
  return { OR: branches };
}

/** Filtros de texto por columna del recurso (dominio, serie, N° interno, km). `kilometer` solo existe en vehículos. */
export function resourceTextCondition(
  field: 'domain' | 'serie' | 'intern_number' | 'kilometer',
  term: string
): WhereCondition {
  const contains = { contains: term, mode: 'insensitive' as const };
  switch (field) {
    case 'domain':
      return { vehicles: { domain: contains } };
    case 'serie':
      return { OR: [{ vehicles: { serie: contains } }, { other_equipment: { serial_number: contains } }] };
    case 'intern_number':
      return { OR: [{ vehicles: { intern_number: contains } }, { other_equipment: { intern_number: contains } }] };
    case 'kilometer':
      return { vehicles: { kilometer: contains } };
  }
}

/** Filtro de texto de la descripción: la del pedido o, si no tiene, la de la solicitud (lo que muestra la columna). */
export function descriptionTextCondition(term: string): WhereCondition {
  const contains = { contains: term, mode: 'insensitive' as const };
  return { OR: [{ description: contains }, { maintenance_requests: { description: contains } }] };
}

/** Origen efectivo del pedido: el propio y, si no lo tiene, el de la solicitud (igual que la celda). */
export function effectiveSourceCondition(values: string[]): WhereCondition {
  const realValues = values.filter((v) => v !== NULL_FILTER_VALUE);
  const branches: WhereCondition[] = [];
  if (realValues.length > 0) {
    branches.push(
      { source: { in: realValues } },
      { source: null, maintenance_requests: { source: { in: realValues } } }
    );
  }
  if (values.includes(NULL_FILTER_VALUE)) {
    branches.push({
      source: null,
      OR: [{ maintenance_requests: { is: null } }, { maintenance_requests: { source: null } }],
    });
  }
  return { OR: branches };
}

/** Orden por "Equipo": dominio del vehículo y, para los equipamientos, su serie. */
export function resourceOrderBy(dir: 'asc' | 'desc'): Record<string, unknown>[] {
  return [{ vehicles: { domain: dir } }, { other_equipment: { serial_number: dir } }];
}

// ============================================================================
// FACETA "EQUIPO"
// ============================================================================

function vehicleOptionName(v: { domain: string | null; serie: string | null; intern_number: string | null }) {
  const label = v.domain || v.serie || 'Sin identificar';
  return v.intern_number ? `${label} (#${v.intern_number})` : label;
}

function equipmentOptionName(e: { serial_number: string | null; intern_number: string | null }) {
  const label = e.serial_number || 'Sin identificar';
  return e.intern_number ? `${label} (#${e.intern_number})` : label;
}

/**
 * Opciones y conteos de la faceta "Equipo" para un `where` ya armado (con el cross-filter aplicado).
 * Los ids de los recursos salen de las propias filas (ya acotadas por empresa) y el lookup no recorta por
 * nombre: no se resuelven ids sueltos que no estén en el universo de la consulta.
 */
export async function getResourceFacet(where: WhereCondition) {
  const rows = await prisma.maintenance_orders.groupBy({
    by: ['equipment_id', 'other_equipment_id'],
    where,
    _count: { _all: true },
  });

  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row.equipment_id ?? row.other_equipment_id ?? NULL_FILTER_VALUE;
    counts.set(key, (counts.get(key) ?? 0) + row._count._all);
  }

  const vehicleIds = rows.map((r) => r.equipment_id).filter((id): id is string => id !== null);
  const equipmentIds = rows.map((r) => r.other_equipment_id).filter((id): id is string => id !== null);

  const [vehicles, equipment] = await Promise.all([
    vehicleIds.length > 0
      ? prisma.vehicles.findMany({
          where: { id: { in: vehicleIds } },
          select: { id: true, domain: true, serie: true, intern_number: true },
        })
      : Promise.resolve([]),
    equipmentIds.length > 0
      ? prisma.other_equipment.findMany({
          where: { id: { in: equipmentIds } },
          select: { id: true, serial_number: true, intern_number: true },
        })
      : Promise.resolve([]),
  ]);

  const resolvedOptions = [
    ...vehicles.map((v) => ({ id: v.id, name: vehicleOptionName(v) })),
    ...equipment.map((e) => ({ id: e.id, name: equipmentOptionName(e) })),
  ].sort((a, b) => a.name.localeCompare(b.name, 'es'));

  return { counts, resolvedOptions };
}

/** Conteo de la faceta "Condición" (en memoria: la condición vive en el recurso, no en la orden). */
export async function getResourceConditionFacet(where: WhereCondition) {
  const orders = await prisma.maintenance_orders.findMany({
    where,
    select: {
      vehicles: { select: { condition: true } },
      other_equipment: { select: { condition: true } },
    },
  });

  const counts = new Map<string, number>();
  for (const order of orders) {
    const condition = (order.other_equipment ? order.other_equipment.condition : order.vehicles?.condition) ?? null;
    const key = condition ?? NULL_FILTER_VALUE;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return { counts };
}
