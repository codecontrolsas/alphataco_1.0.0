import type { Prisma } from '@/generated/prisma/client';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { prisma } from '@/shared/lib/prisma';
import { toFacetMap } from '@/shared/lib/table-facets';

export type EmployeeFacetResult = {
  counts: Map<string, number>;
  resolvedOptions?: Array<{ id: string; name: string | null }>;
};

type NamedRow = { id: string; name: string | null };

/** Columnas enum: el id de la columna es el campo de `employees`. */
const ENUM_FACET_FIELDS = [
  'status',
  'gender',
  'nationality',
  'document_type',
  'marital_status',
  'level_of_education',
  'cost_type',
  'affiliate_status',
  'reason_for_termination',
] as const;

type EnumFacetField = (typeof ENUM_FACET_FIELDS)[number];

function isEnumFacetField(columnId: string): columnId is EnumFacetField {
  return (ENUM_FACET_FIELDS as readonly string[]).includes(columnId);
}

/**
 * FK UUID: campo de `employees` y resolutor de nombres. Cada resolutor acota por empresa (o catálogo global):
 * aunque los ids salgan de empleados de la empresa, no se resuelve nada de otra.
 */
const FK_UUID_FACETS: Record<
  string,
  {
    field:
      | 'hierarchical_position'
      | 'company_position'
      | 'type_of_contract'
      | 'workflow_diagram'
      | 'category_id'
      | 'covenants_id'
      | 'guild_id'
      | 'cost_center_id'
      | 'birthplace';
    resolve: (ids: string[], companyId: string) => Promise<NamedRow[]>;
  }
> = {
  hierarchy: {
    field: 'hierarchical_position',
    resolve: (ids, companyId) =>
      prisma.hierarchy.findMany({
        where: { id: { in: ids }, company_id: companyId },
        select: { id: true, name: true },
      }),
  },
  company_positions: {
    field: 'company_position',
    resolve: (ids, companyId) =>
      prisma.company_positions.findMany({
        where: { id: { in: ids }, company_id: companyId },
        select: { id: true, name: true },
      }),
  },
  types_of_contract: {
    field: 'type_of_contract',
    resolve: (ids, companyId) =>
      prisma.types_of_contract.findMany({
        where: { id: { in: ids }, company_id: companyId },
        select: { id: true, name: true },
      }),
  },
  work_diagram: {
    field: 'workflow_diagram',
    resolve: (ids, companyId) =>
      prisma.work_diagram.findMany({
        where: { id: { in: ids }, company_id: companyId },
        select: { id: true, name: true },
      }),
  },
  category: {
    field: 'category_id',
    // La categoría no tiene empresa propia: cuelga del convenio.
    resolve: (ids, companyId) =>
      prisma.category.findMany({
        where: { id: { in: ids }, OR: [{ covenant_id: null }, { covenant: { company_id: companyId } }] },
        select: { id: true, name: true },
      }),
  },
  covenant: {
    field: 'covenants_id',
    resolve: (ids, companyId) =>
      prisma.covenant.findMany({
        where: { id: { in: ids }, company_id: companyId },
        select: { id: true, name: true },
      }),
  },
  guild: {
    field: 'guild_id',
    // Los sindicatos pueden ser globales (company_id NULL).
    resolve: (ids, companyId) =>
      prisma.guild.findMany({
        where: { id: { in: ids }, OR: [{ company_id: null }, { company_id: companyId }] },
        select: { id: true, name: true },
      }),
  },
  cost_center: {
    field: 'cost_center_id',
    resolve: (ids, companyId) =>
      prisma.cost_center.findMany({
        where: { id: { in: ids }, company_id: companyId },
        select: { id: true, name: true },
      }),
  },
  countries: {
    field: 'birthplace',
    // Catálogo global (países).
    resolve: (ids) => prisma.countries.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
  },
};

/**
 * M:M: se agrupa la PIVOTE (no se traen todas las filas) restringida a los empleados del `where` cruzado.
 * Los "sin asignar" son los empleados del `where` sin ninguna fila en la pivote.
 */
async function m2mFacet(
  column: 'contractor_employee' | 'empleado_aptitudes' | 'workshop_sectors',
  where: Prisma.employeesWhereInput,
  companyId: string
): Promise<EmployeeFacetResult> {
  let rows: Array<{ key: string | null; count: number }>;
  let withRelation: Prisma.employeesWhereInput;
  let resolve: (ids: string[]) => Promise<NamedRow[]>;

  if (column === 'contractor_employee') {
    const grouped = await prisma.contractor_employee.groupBy({
      by: ['contractor_id'],
      where: { employees: where },
      _count: { _all: true },
    });
    rows = grouped.map((r) => ({ key: r.contractor_id, count: r._count._all }));
    withRelation = { contractor_employee: { some: {} } };
    resolve = (ids) =>
      prisma.customers.findMany({
        where: { id: { in: ids }, company_id: companyId },
        select: { id: true, name: true },
      });
  } else if (column === 'empleado_aptitudes') {
    const grouped = await prisma.empleado_aptitudes.groupBy({
      by: ['aptitud_id'],
      where: { employees: where },
      _count: { _all: true },
    });
    rows = grouped.map((r) => ({ key: r.aptitud_id, count: r._count._all }));
    withRelation = { empleado_aptitudes: { some: {} } };
    resolve = async (ids) =>
      (
        await prisma.aptitudes_tecnicas.findMany({
          where: { id: { in: ids }, company_id: companyId },
          select: { id: true, nombre: true },
        })
      ).map((a) => ({ id: a.id, name: a.nombre }));
  } else {
    const grouped = await prisma.employee_workshop_sectors.groupBy({
      by: ['workshop_sector_id'],
      where: { employees: where },
      _count: { _all: true },
    });
    rows = grouped.map((r) => ({ key: r.workshop_sector_id, count: r._count._all }));
    withRelation = { employee_workshop_sectors: { some: {} } };
    resolve = (ids) =>
      prisma.workshop_sectors.findMany({
        where: { id: { in: ids }, company_id: companyId },
        select: { id: true, name: true },
      });
  }

  const [totalInScope, withAny] = await Promise.all([
    prisma.employees.count({ where }),
    prisma.employees.count({ where: { AND: [where, withRelation] } }),
  ]);

  const counts = toFacetMap(rows.filter((r) => r.key != null));
  const unassigned = totalInScope - withAny;
  if (unassigned > 0) counts.set(NULL_FILTER_VALUE, unassigned);

  const ids = rows.map((r) => r.key).filter((key): key is string => key != null);
  const resolvedOptions = ids.length > 0 ? await resolve(ids) : [];
  return { counts, resolvedOptions };
}

/**
 * Faceta de UNA columna con el `where` ya cruzado (sin el filtro propio). Devuelve conteos vacíos si la columna
 * no es facetable.
 */
export async function runEmployeeFacet(
  columnId: string,
  where: Prisma.employeesWhereInput,
  companyId: string
): Promise<EmployeeFacetResult> {
  if (isEnumFacetField(columnId)) {
    // `by` recibe un campo de un conjunto de enums: se fija a uno de ellos solo para el tipado de Prisma.
    const rows = await prisma.employees.groupBy({ by: [columnId as 'status'], where, _count: { _all: true } });
    return {
      counts: toFacetMap(
        rows.map((r) => ({ key: (r as Record<string, unknown>)[columnId] as string | null, count: r._count._all }))
      ),
    };
  }

  const fk = FK_UUID_FACETS[columnId];
  if (fk) {
    const rows = await prisma.employees.groupBy({
      by: [fk.field as 'hierarchical_position'],
      where,
      _count: { _all: true },
    });
    const keyOf = (row: object) => (row as Record<string, unknown>)[fk.field] as string | null;
    const counts = toFacetMap(rows.map((r) => ({ key: keyOf(r), count: r._count._all })));
    const ids = rows.map(keyOf).filter((id): id is string => id != null);
    return { counts, resolvedOptions: ids.length > 0 ? await fk.resolve(ids, companyId) : [] };
  }

  if (columnId === 'province') {
    const rows = await prisma.employees.groupBy({ by: ['province'], where, _count: { _all: true } });
    const counts = toFacetMap(rows.map((r) => ({ key: String(r.province), count: r._count._all })));
    const ids = rows.map((r) => r.province);
    const options = ids.length
      ? await prisma.provinces.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      : [];
    return { counts, resolvedOptions: options.map((p) => ({ id: String(p.id), name: p.name })) };
  }

  if (columnId === 'city') {
    const rows = await prisma.employees.groupBy({ by: ['city'], where, _count: { _all: true } });
    const counts = toFacetMap(rows.map((r) => ({ key: r.city == null ? null : String(r.city), count: r._count._all })));
    const ids = rows.map((r) => r.city).filter((id): id is bigint => id != null);
    const options = ids.length
      ? await prisma.cities.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      : [];
    return { counts, resolvedOptions: options.map((c) => ({ id: String(c.id), name: c.name })) };
  }

  if (columnId === 'contractor_employee' || columnId === 'empleado_aptitudes' || columnId === 'workshop_sectors') {
    return m2mFacet(columnId, where, companyId);
  }

  return { counts: new Map() };
}
