/**
 * Piezas que repiten las consultas de las tres tablas de entregas de ropa (historial del empleado, todas
 * las entregas y reporte global): select de personas y artículos, filtros por persona y por legajo, orden y
 * facetas de una columna. El `where` y el `select` completos siguen siendo de cada lista.
 *
 * Sin `'use server'`: son helpers que importan las server actions de cada tabla.
 */
import { DELIVERY_STATUS_ACTIVE, DELIVERY_STATUS_CANCELLED } from '@/features/Clothing/lib/delivery-stock-where';
import type { Prisma } from '@/generated/prisma/client';
import { NULL_FILTER_VALUE, parseSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { prisma } from '@/shared/lib/prisma';
import { toFacetMap, withoutOwnFilter } from '@/shared/lib/table-facets';
import { containsInsensitive, type SingleFacetResult } from '@/shared/lib/table-list-query';

/** Las dos relaciones de la entrega con un empleado. */
export const RECIPIENT_RELATION = 'employees_clothing_deliveries_employee_idToemployees';
export const DELIVERED_BY_RELATION = 'employees_clothing_deliveries_delivered_by_idToemployees';

/** Persona de la entrega (destinatario o quien entregó), con el legajo. */
export const DELIVERY_PERSON_SELECT = {
  select: { id: true, firstname: true, lastname: true, file: true },
} as const;

/** Artículos de la entrega con marca y talle, para la celda "Artículos". */
export const DELIVERY_ITEMS_SELECT = {
  select: {
    id: true,
    quantity: true,
    clothing_items: { select: { id: true, name: true } },
    clothing_brands: { select: { id: true, name: true } },
    clothing_sizes: { select: { id: true, name: true } },
  },
} as const;

/** Filtro por el id de un empleado de la entrega; el centinela "Sin asignar" admite nulos. */
export function buildNullableEmployeeIdWhere(
  field: 'employee_id' | 'delivered_by_id',
  values: string[] | undefined
): Prisma.clothing_deliveriesWhereInput {
  if (!values || !Array.isArray(values) || values.length === 0) return {};
  if (values.includes(NULL_FILTER_VALUE)) {
    const nonNullValues = values.filter((v) => v !== NULL_FILTER_VALUE);
    return {
      OR: [{ [field]: null }, ...(nonNullValues.length > 0 ? [{ [field]: { in: nonNullValues } }] : [])],
    };
  }
  return { [field]: { in: values } };
}

/** Filtro de texto por el legajo de una de las personas de la entrega. */
export function buildPersonFileWhere(
  relation: typeof RECIPIENT_RELATION | typeof DELIVERED_BY_RELATION,
  values: string[] | undefined
): Prisma.clothing_deliveriesWhereInput {
  const search = values?.[0]?.trim();
  if (!search) return {};
  return { [relation]: { file: containsInsensitive(search) } };
}

/** "[legajo] Apellido Nombre", la etiqueta de las opciones de los filtros por persona. */
function personFacetName(e: { file: string | null; lastname: string | null; firstname: string | null }) {
  return `[${e.file ?? ''}] ${e.lastname ?? ''} ${e.firstname ?? ''}`.trim();
}

/**
 * Función que arma el `where` de una faceta: sin filtros activos es el `base`; con filtros, el de la tabla
 * sin el filtro propio de la columna (cross-filter).
 */
export function createCrossWhere(
  searchParams: DataTableSearchParams | undefined,
  base: Prisma.clothing_deliveriesWhereInput,
  buildWhere: (state: ReturnType<typeof parseSearchParams>) => Prisma.clothing_deliveriesWhereInput
) {
  const parsedState = searchParams && Object.keys(searchParams).length > 0 ? parseSearchParams(searchParams) : null;
  const hasActiveFilters = parsedState && (Object.keys(parsedState.filters).length > 0 || parsedState.search);
  return (excludeColumn: string): Prisma.clothing_deliveriesWhereInput => {
    if (!parsedState || !hasActiveFilters) return base;
    return buildWhere(withoutOwnFilter(parsedState, excludeColumn));
  };
}

/** Faceta del tipo de entrega (enum). */
export async function deliveryTypeFacet(where: Prisma.clothing_deliveriesWhereInput): Promise<SingleFacetResult> {
  const rows = await prisma.clothing_deliveries.groupBy({ by: ['delivery_type'], where, _count: true });
  return { counts: toFacetMap(rows.map((r) => ({ key: r.delivery_type, count: r._count }))) };
}

/** Faceta del estado (columna virtual derivada de `cancelled_at`). */
export async function deliveryStatusFacet(where: Prisma.clothing_deliveriesWhereInput): Promise<SingleFacetResult> {
  const [active, cancelled] = await Promise.all([
    prisma.clothing_deliveries.count({ where: { ...where, cancelled_at: null } }),
    prisma.clothing_deliveries.count({ where: { ...where, cancelled_at: { not: null } } }),
  ]);
  const counts = new Map<string, number>();
  if (active > 0) counts.set(DELIVERY_STATUS_ACTIVE, active);
  if (cancelled > 0) counts.set(DELIVERY_STATUS_CANCELLED, cancelled);
  return { counts };
}

/** Faceta del depósito (FK nullable: las entregas anteriores a Almacenes no tienen). */
export async function deliveryWarehouseFacet(where: Prisma.clothing_deliveriesWhereInput): Promise<SingleFacetResult> {
  const rows = await prisma.clothing_deliveries.groupBy({ by: ['warehouse_id'], where, _count: true });
  const counts = toFacetMap(rows.map((r) => ({ key: r.warehouse_id, count: r._count })));
  const ids = rows.map((r) => r.warehouse_id).filter((id): id is string => id != null);
  const warehouses =
    ids.length > 0
      ? await prisma.warehouses.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      : [];
  return { counts, resolvedOptions: warehouses };
}

/** Faceta de una de las personas de la entrega (destinatario o quien entregó), con "[legajo] Apellido Nombre". */
export async function deliveryPersonFacet(
  field: 'employee_id' | 'delivered_by_id',
  where: Prisma.clothing_deliveriesWhereInput
): Promise<SingleFacetResult> {
  const rows = await prisma.clothing_deliveries.groupBy({ by: [field], where, _count: true });
  const counts = toFacetMap(rows.map((r) => ({ key: r[field], count: r._count })));

  const ids = rows.map((r) => r[field]).filter((id): id is string => id != null);
  const employees =
    ids.length > 0
      ? await prisma.employees.findMany({
          where: { id: { in: ids } },
          select: { id: true, firstname: true, lastname: true, file: true },
        })
      : [];

  return { counts, resolvedOptions: employees.map((e) => ({ id: e.id, name: personFacetName(e) })) };
}
