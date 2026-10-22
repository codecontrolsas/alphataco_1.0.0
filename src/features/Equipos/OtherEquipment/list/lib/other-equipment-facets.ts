import type { Prisma } from '@/generated/prisma/client';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { prisma } from '@/shared/lib/prisma';
import { toFacetMap } from '@/shared/lib/table-facets';
import type { OtherEquipmentEnumField } from './other-equipment-where';

/**
 * Opciones y conteos de UNA faceta de otros equipos. Recibe el `where` ya cruzado (sin el filtro propio
 * de la columna), así las dos listas (activos y dados de baja) comparten la misma lógica. Sin `'use server'`.
 */

export interface OtherEquipmentFacet {
  counts: Map<string, number>;
  /** Solo para columnas FK / M:M: las opciones se resuelven por nombre. */
  resolvedOptions?: Array<{ id: string; name: string | null }>;
}

type NamedRow = { id: string; name: string | null };

/** Campos UUID de `other_equipment` con su resolvedor de nombres. */
const FK_UUID_CONFIG: Record<string, { field: string; resolve: (ids: string[]) => Promise<NamedRow[]> }> = {
  type: {
    field: 'type_id',
    resolve: (ids) => prisma.type.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
  },
  sub_type: {
    field: 'sub_type_id',
    resolve: (ids) => prisma.sub_type.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
  },
  sector: {
    field: 'sector',
    resolve: (ids) => prisma.hierarchy.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
  },
  owner: {
    field: 'owner_id',
    resolve: (ids) =>
      prisma.equipment_owners.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
  },
  cost_center: {
    field: 'cost_center_id',
    resolve: (ids) => prisma.cost_center.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
  },
  linked_vehicle: {
    field: 'linked_vehicle_id',
    resolve: async (ids) => {
      const rows = await prisma.vehicles.findMany({ where: { id: { in: ids } }, select: { id: true, domain: true } });
      return rows.map((r) => ({ id: r.id, name: r.domain }));
    },
  },
};

export async function getOtherEquipmentFacet(
  columnId: string,
  where: Prisma.other_equipmentWhereInput,
  enumColumns: readonly OtherEquipmentEnumField[],
  booleanColumns: readonly string[]
): Promise<OtherEquipmentFacet | null> {
  // Enums
  if ((enumColumns as readonly string[]).includes(columnId)) {
    const rows = await prisma.other_equipment.groupBy({ by: [columnId as 'condition'], where, _count: true });
    return {
      counts: toFacetMap(
        rows.map((r) => ({ key: (r as Record<string, unknown>)[columnId] as string | null, count: r._count }))
      ),
    };
  }

  // Booleano NOT NULL
  if (booleanColumns.includes(columnId)) {
    const rows = await prisma.other_equipment.groupBy({ by: [columnId as 'has_certification'], where, _count: true });
    return { counts: toFacetMap(rows.map((r) => ({ key: r.has_certification, count: r._count }))) };
  }

  // FK UUID
  const fk = FK_UUID_CONFIG[columnId];
  if (fk) {
    const rows = await prisma.other_equipment.groupBy({ by: [fk.field as 'type_id'], where, _count: true });
    const keyed = rows.map((r) => ({
      key: (r as Record<string, unknown>)[fk.field] as string | null,
      count: r._count,
    }));
    const ids = keyed.map((r) => r.key).filter((k): k is string => k != null);
    return { counts: toFacetMap(keyed), resolvedOptions: ids.length > 0 ? await fk.resolve(ids) : [] };
  }

  // FK Int: marca / modelo (los ids se entregan como string)
  if (columnId === 'brand' || columnId === 'model') {
    const field = columnId === 'brand' ? 'brand_id' : 'model_id';
    const rows = await prisma.other_equipment.groupBy({ by: [field as 'brand_id'], where, _count: true });
    const keyed = rows.map((r) => ({ key: (r as Record<string, unknown>)[field] as number | null, count: r._count }));
    const ids = keyed.map((r) => r.key).filter((k): k is number => k != null);
    const options: Array<{ id: number; name: string | null }> =
      ids.length === 0
        ? []
        : columnId === 'brand'
          ? await prisma.brand_vehicles.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
          : await prisma.model_vehicles.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    return {
      counts: toFacetMap(keyed),
      resolvedOptions: options.map((o) => ({ id: String(o.id), name: o.name })),
    };
  }

  // M:M "Afectado a": un groupBy por cliente + un conteo de equipos sin ninguna afectación
  if (columnId === 'contractor_other_equipment') {
    const [rows, unassigned] = await Promise.all([
      prisma.contractor_other_equipment.groupBy({
        by: ['contractor_id'],
        where: { other_equipment: where },
        _count: true,
      }),
      prisma.other_equipment.count({ where: { AND: [where, { contractor_other_equipment: { none: {} } }] } }),
    ]);
    const counts = toFacetMap(rows.map((r) => ({ key: r.contractor_id, count: r._count })));
    if (unassigned > 0) counts.set(NULL_FILTER_VALUE, unassigned);
    const ids = rows.map((r) => r.contractor_id);
    const resolvedOptions =
      ids.length > 0
        ? await prisma.customers.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
        : [];
    return { counts, resolvedOptions };
  }

  return null;
}
