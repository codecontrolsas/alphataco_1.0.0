'use server';

import { Prisma } from '@/generated/prisma/client';
import { condition_enum, status_type } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import type { DataTableSearchParams, FacetResult } from '@/shared/components/common/DataTable';
import {
  NULL_FILTER_VALUE,
  buildDateRangeFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  parseSearchParams,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import {
  equipmentOwnerCreateSchema,
  equipmentOwnerUpdateSchema,
  reassignVehiclesSchema,
} from '../../lib/catalog-input-schemas';
import { requireConfigTabPermission } from '../../lib/config-access.server';
import { assertEquipmentOwnerReadable } from '../lib/catalog-guards';
import { catalogAccessError, catalogReadScope, catalogWriteScope, resolveCatalogAccess } from '../lib/catalog-scope';

// ============================================================================
// LOGGER
// ============================================================================

const logger = new Logger('features/Empresa/Equipos/EquipmentOwners');

// ============================================================================
// VALID SORT FIELDS — solo campos reales de BD
// ============================================================================

const VALID_SORT_FIELDS = new Set(['name', 'cuit', 'is_active', 'created_at']);

// ============================================================================
// WHERE BUILDER — DRY helper compartido por paginated, export y facets
// ============================================================================

function buildWhereClause(state: ReturnType<typeof parseSearchParams>) {
  const searchWhere = buildSearchWhere(state.search, ['name', 'cuit']);

  // is_active es booleano nullable — manejar manualmente
  const isActiveValues = state.filters['is_active'];
  const isActiveFilter: Record<string, unknown> = {};
  if (isActiveValues?.length === 1) {
    if (isActiveValues[0] === NULL_FILTER_VALUE) {
      isActiveFilter.is_active = null;
    } else {
      isActiveFilter.is_active = isActiveValues[0] === 'true';
    }
  } else if (isActiveValues && isActiveValues.length > 1) {
    const conditions: Array<{ is_active: boolean | null }> = [];
    for (const v of isActiveValues) {
      if (v === NULL_FILTER_VALUE) conditions.push({ is_active: null });
      else conditions.push({ is_active: v === 'true' });
    }
    isActiveFilter.OR = conditions;
  }

  // Filtros texto libre por columna
  const textFiltersWhere = buildTextFiltersWhere(state.filters, ['name', 'cuit']);

  // Filtros de rango de fecha
  const dateFiltersWhere = buildDateRangeFiltersWhere(state.filters, ['created_at']);

  return {
    ...searchWhere,
    ...isActiveFilter,
    ...textFiltersWhere,
    ...dateFiltersWhere,
  };
}

// ============================================================================
// QUERY PAGINADA — Tabla principal (equipment_owners)
// ============================================================================

export async function getEquipmentOwnersPaginated(searchParams: DataTableSearchParams) {
  await requireConfigTabPermission('titulares', 'view');
  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = stateToPrismaParams(state);

    // `buildWhereClause` puede traer su propio `OR`: se combinan con AND para no pisarse.
    const where = { AND: [buildWhereClause(state), catalogReadScope(await getActiveCompanyId())] };

    // Resolución de multi-sort
    const resolvedSorts: Array<Record<string, unknown>> = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        resolvedSorts.push({ [s.id]: s.desc ? 'desc' : 'asc' });
      }
    }
    // Inactivos siempre al final, luego orden del usuario, luego nombre como fallback
    const safeOrderBy = [{ is_active: 'desc' as const }, ...resolvedSorts, { name: 'asc' as const }];

    const [data, total] = await Promise.all([
      prisma.equipment_owners.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: {
          id: true,
          name: true,
          cuit: true,
          is_active: true,
          created_at: true,
          equipment_owner_contract_types: {
            select: {
              id: true,
              contract_type: true,
            },
          },
        },
      }),
      prisma.equipment_owners.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener titulares de equipos', { data: { error } });
    throw new Error('No se pudo obtener la lista. Intente nuevamente.');
  }
}

// ============================================================================
// EXPORT COMPLETO — sin skip/take, mismos filtros
// ============================================================================

export async function getAllEquipmentOwnersForExport(searchParams: DataTableSearchParams) {
  await requireConfigTabPermission('titulares', 'view');
  try {
    const state = parseSearchParams(searchParams);
    const where = { AND: [buildWhereClause(state), catalogReadScope(await getActiveCompanyId())] };

    const resolvedSorts: Array<Record<string, unknown>> = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        resolvedSorts.push({ [s.id]: s.desc ? 'desc' : 'asc' });
      }
    }
    const safeOrderBy = [{ is_active: 'desc' as const }, ...resolvedSorts, { name: 'asc' as const }];

    return await prisma.equipment_owners.findMany({
      where,
      orderBy: safeOrderBy,
      select: {
        id: true,
        name: true,
        cuit: true,
        is_active: true,
        created_at: true,
        equipment_owner_contract_types: {
          select: {
            id: true,
            contract_type: true,
          },
        },
      },
    });
  } catch (error) {
    logger.error('Error al exportar titulares de equipos', { data: { error } });
    throw new Error('No se pudo exportar la lista. Intente nuevamente.');
  }
}

// ============================================================================
// SINGLE FACET — lazy-load on-demand por columna con cross-filtering
// ============================================================================

/**
 * Retorna counts + opciones para UNA sola columna de la tabla de titulares.
 * Aplica TODOS los filtros activos EXCEPTO el de la propia columna (cross-filter).
 */
export async function getEquipmentOwnerSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<FacetResult | null> {
  await requireConfigTabPermission('titulares', 'view');
  try {
    const state = searchParams ? parseSearchParams(searchParams) : parseSearchParams({});

    // crossWhere: aplica todos los filtros EXCEPTO el de la columna propia
    const crossState = {
      ...state,
      filters: { ...state.filters },
    };
    delete crossState.filters[columnId];

    const crossWhere = { AND: [buildWhereClause(crossState), catalogReadScope(await getActiveCompanyId())] };

    switch (columnId) {
      case 'is_active': {
        const rows = await prisma.equipment_owners.groupBy({
          by: ['is_active'],
          where: crossWhere,
          _count: true,
        });

        const counts = new Map<string, number>();
        for (const r of rows) {
          if (r.is_active === null) {
            counts.set(NULL_FILTER_VALUE, r._count);
          } else {
            counts.set(String(r.is_active), r._count);
          }
        }

        return {
          options: [
            { value: 'true', label: 'Activo' },
            { value: 'false', label: 'Inactivo' },
            ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar' }] : []),
          ],
          counts,
        };
      }

      default:
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener faceta de titular de equipo', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// QUERY PAGINADA — Tabla secundaria (vehicles por owner_id)
// ============================================================================

const VEHICLE_VALID_SORT_FIELDS = new Set([
  'domain',
  'chassis',
  'engine',
  'serie',
  'intern_number',
  'year',
  'condition',
  'status',
  'kilometer',
  'engine_hours',
  'created_at',
]);

const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  type: (dir) => ({ type_vehicles_typeTotype: { name: dir } }),
  subType: (dir) => ({ sub_type: { name: dir } }),
  brand: (dir) => ({ brand_vehicles: { name: dir } }),
  model: (dir) => ({ model_vehicles: { name: dir } }),
};

function buildVehicleWhereClause(
  ownerId: string,
  state: ReturnType<typeof parseSearchParams>,
  companyId: string
): Prisma.vehiclesWhereInput {
  const AND: Prisma.vehiclesWhereInput[] = [{ owner_id: ownerId }];

  // ── Búsqueda global (domain, intern_number, serie, engine, chassis) ────────
  const searchFields = ['domain', 'intern_number', 'serie', 'engine', 'chassis'];
  if (state.search) {
    AND.push({
      OR: searchFields.map((f) => ({
        [f]: { contains: state.search, mode: 'insensitive' as const },
      })),
    });
  }

  // ── is_active (booleano nullable) ─────────────────────────────────────────
  const isActiveValues = state.filters['is_active'];
  if (isActiveValues?.length) {
    const hasNull = isActiveValues.includes(NULL_FILTER_VALUE);
    const trueVal = isActiveValues.includes('true');
    const falseVal = isActiveValues.includes('false');
    const orConds: Prisma.vehiclesWhereInput[] = [];
    if (hasNull) orConds.push({ is_active: null });
    if (trueVal) orConds.push({ is_active: true });
    if (falseVal) orConds.push({ is_active: false });
    if (orConds.length === 1) AND.push(orConds[0]);
    else if (orConds.length > 1) AND.push({ OR: orConds });
  }

  // ── condition (enum nullable) ─────────────────────────────────────────────
  const conditionValues = state.filters['condition'];
  if (conditionValues?.length) {
    const hasNull = conditionValues.includes(NULL_FILTER_VALUE);
    const realValues = conditionValues
      .filter((v) => v !== NULL_FILTER_VALUE)
      .filter((v): v is condition_enum => Object.values(condition_enum).includes(v as condition_enum));
    if (hasNull && realValues.length > 0) {
      AND.push({ OR: [{ condition: null }, { condition: { in: realValues } }] });
    } else if (hasNull) {
      AND.push({ condition: null });
    } else if (realValues.length > 0) {
      AND.push({ condition: { in: realValues } });
    }
  }

  // ── status (enum nullable) ────────────────────────────────────────────────
  const statusValues = state.filters['status'];
  if (statusValues?.length) {
    const hasNull = statusValues.includes(NULL_FILTER_VALUE);
    const realValues = statusValues
      .filter((v) => v !== NULL_FILTER_VALUE)
      .filter((v): v is status_type => Object.values(status_type).includes(v as status_type));
    if (hasNull && realValues.length > 0) {
      AND.push({ OR: [{ status: null }, { status: { in: realValues } }] });
    } else if (hasNull) {
      AND.push({ status: null });
    } else if (realValues.length > 0) {
      AND.push({ status: { in: realValues } });
    }
  }

  // ── type (FK UUID — NOT nullable in schema) ───────────────────────────────
  const typeValues = state.filters['type'];
  if (typeValues?.length) {
    // type is NOT NULL in vehicles schema — ignore NULL_FILTER_VALUE
    const realValues = typeValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (realValues.length > 0) {
      AND.push({ type: { in: realValues } });
    }
  }

  // ── subType (FK UUID nullable) ────────────────────────────────────────────
  const subTypeValues = state.filters['subType'];
  if (subTypeValues?.length) {
    const hasNull = subTypeValues.includes(NULL_FILTER_VALUE);
    const realValues = subTypeValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (hasNull && realValues.length > 0) {
      AND.push({ OR: [{ subType: null }, { subType: { in: realValues } }] });
    } else if (hasNull) {
      AND.push({ subType: null });
    } else if (realValues.length > 0) {
      AND.push({ subType: { in: realValues } });
    }
  }

  // ── Filtros de texto libre por columna ────────────────────────────────────
  const textColumns = ['domain', 'intern_number', 'serie', 'engine', 'chassis'];
  for (const col of textColumns) {
    const val = state.filters[col];
    if (val?.length === 1 && val[0]) {
      AND.push({ [col]: { contains: val[0], mode: 'insensitive' as const } });
    }
  }

  // ── Filtros de rango de fecha ─────────────────────────────────────────────
  const createdAtValues = state.filters['created_at'];
  if (createdAtValues?.length === 2) {
    const [from, to] = createdAtValues;
    if (from || to) {
      const dateFilter: Prisma.vehiclesWhereInput = {};
      if (from) dateFilter.created_at = { ...((dateFilter.created_at as object) ?? {}), gte: new Date(from) };
      if (to) dateFilter.created_at = { ...((dateFilter.created_at as object) ?? {}), lte: new Date(to) };
      AND.push(dateFilter);
    }
  }

  return withCompany({ AND }, companyId);
}

export async function getVehiclesByOwnerPaginated(ownerId: string, searchParams: DataTableSearchParams) {
  await requireConfigTabPermission('titulares', 'view');
  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = stateToPrismaParams(state);

    const companyId = await getActiveCompanyId();
    const where = buildVehicleWhereClause(ownerId, state, companyId);

    const resolvedSorts: Array<Record<string, unknown>> = [];
    for (const s of state.sorting) {
      if (VEHICLE_VALID_SORT_FIELDS.has(s.id)) {
        resolvedSorts.push({ [s.id]: s.desc ? 'desc' : 'asc' });
      } else if (FK_SORT_MAP[s.id]) {
        resolvedSorts.push(FK_SORT_MAP[s.id](s.desc ? 'desc' : 'asc'));
      }
    }
    const safeOrderBy = [...resolvedSorts, { domain: 'asc' as const }];

    const [data, total] = await Promise.all([
      prisma.vehicles.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: {
          id: true,
          domain: true,
          chassis: true,
          engine: true,
          serie: true,
          intern_number: true,
          year: true,
          condition: true,
          status: true,
          kilometer: true,
          engine_hours: true,
          picture: true,
          is_active: true,
          created_at: true,
          type_vehicles_typeTotype: { select: { id: true, name: true } },
          sub_type: { select: { id: true, name: true } },
          brand_vehicles: { select: { id: true, name: true } },
          model_vehicles: { select: { id: true, name: true } },
          contractor_equipment: {
            select: {
              customers: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.vehicles.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener equipos por titular', { data: { error, ownerId } });
    throw new Error('No se pudo obtener la lista de equipos. Intente nuevamente.');
  }
}

// ============================================================================
// EXPORT COMPLETO — tabla secundaria
// ============================================================================

export async function getAllVehiclesByOwnerForExport(ownerId: string, searchParams: DataTableSearchParams) {
  await requireConfigTabPermission('titulares', 'view');
  try {
    const state = parseSearchParams(searchParams);
    const companyId = await getActiveCompanyId();
    const where = buildVehicleWhereClause(ownerId, state, companyId);

    const resolvedSorts: Array<Record<string, unknown>> = [];
    for (const s of state.sorting) {
      if (VEHICLE_VALID_SORT_FIELDS.has(s.id)) {
        resolvedSorts.push({ [s.id]: s.desc ? 'desc' : 'asc' });
      } else if (FK_SORT_MAP[s.id]) {
        resolvedSorts.push(FK_SORT_MAP[s.id](s.desc ? 'desc' : 'asc'));
      }
    }
    const safeOrderBy = [...resolvedSorts, { domain: 'asc' as const }];

    return await prisma.vehicles.findMany({
      where,
      orderBy: safeOrderBy,
      select: {
        id: true,
        domain: true,
        chassis: true,
        engine: true,
        serie: true,
        intern_number: true,
        year: true,
        condition: true,
        status: true,
        kilometer: true,
        engine_hours: true,
        picture: true,
        is_active: true,
        created_at: true,
        type_vehicles_typeTotype: { select: { id: true, name: true } },
        sub_type: { select: { id: true, name: true } },
        brand_vehicles: { select: { id: true, name: true } },
        model_vehicles: { select: { id: true, name: true } },
        contractor_equipment: {
          select: {
            customers: { select: { id: true, name: true } },
          },
        },
      },
    });
  } catch (error) {
    logger.error('Error al exportar equipos por titular', { data: { error, ownerId } });
    throw new Error('No se pudo exportar la lista. Intente nuevamente.');
  }
}

// ============================================================================
// SINGLE FACET — tabla secundaria (vehicles por owner)
// ============================================================================

export async function getVehicleByOwnerSingleFacet(
  ownerId: string,
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<FacetResult | null> {
  await requireConfigTabPermission('titulares', 'view');
  try {
    const state = searchParams ? parseSearchParams(searchParams) : parseSearchParams({});

    const crossState = {
      ...state,
      filters: { ...state.filters },
    };
    delete crossState.filters[columnId];

    const companyId = await getActiveCompanyId();
    const crossWhere = buildVehicleWhereClause(ownerId, crossState, companyId);

    switch (columnId) {
      case 'condition': {
        const rows = await prisma.vehicles.groupBy({
          by: ['condition'],
          where: crossWhere,
          _count: true,
        });

        const counts = new Map<string, number>();
        for (const r of rows) {
          if (r.condition === null) {
            counts.set(NULL_FILTER_VALUE, r._count);
          } else {
            counts.set(r.condition as string, r._count);
          }
        }

        return {
          options: [
            { value: 'operativo', label: 'Operativo' },
            { value: 'no_operativo', label: 'No operativo' },
            { value: 'en_reparacion', label: 'En reparación' },
            { value: 'operativo_condicionado', label: 'Operativo condicionado' },
            { value: 'en_preparacion', label: 'En preparación' },
            ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar' }] : []),
          ],
          counts,
        };
      }

      case 'status': {
        const rows = await prisma.vehicles.groupBy({
          by: ['status'],
          where: crossWhere,
          _count: true,
        });

        const counts = new Map<string, number>();
        for (const r of rows) {
          if (r.status === null) {
            counts.set(NULL_FILTER_VALUE, r._count);
          } else {
            counts.set(r.status as string, r._count);
          }
        }

        return {
          options: [
            { value: 'Avalado', label: 'Avalado' },
            { value: 'No_avalado', label: 'No avalado' },
            { value: 'Incompleto', label: 'Incompleto' },
            { value: 'Completo', label: 'Completo' },
            { value: 'Completo_con_doc_vencida', label: 'Completo con doc vencida' },
            ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar' }] : []),
          ],
          counts,
        };
      }

      case 'type': {
        const rows = await prisma.vehicles.groupBy({
          by: ['type'],
          where: crossWhere,
          _count: true,
        });

        const typeIds = rows.filter((r) => r.type !== null).map((r) => r.type as string);
        const types =
          typeIds.length > 0
            ? await prisma.type.findMany({ where: { id: { in: typeIds } }, select: { id: true, name: true } })
            : [];

        const nameMap = new Map(types.map((t) => [t.id, t.name]));
        const counts = new Map<string, number>();
        for (const r of rows) {
          counts.set(r.type as string, r._count);
        }

        const options = types.map((t) => ({ value: t.id, label: t.name }));

        return { options, counts };
      }

      case 'subType': {
        const rows = await prisma.vehicles.groupBy({
          by: ['subType'],
          where: crossWhere,
          _count: true,
        });

        const subTypeIds = rows.filter((r) => r.subType !== null).map((r) => r.subType as string);
        const subTypes =
          subTypeIds.length > 0
            ? await prisma.sub_type.findMany({
                where: { id: { in: subTypeIds } },
                select: { id: true, name: true },
              })
            : [];

        const counts = new Map<string, number>();
        for (const r of rows) {
          if (r.subType === null) {
            counts.set(NULL_FILTER_VALUE, r._count);
          } else {
            counts.set(r.subType as string, r._count);
          }
        }

        const options = subTypes.map((s) => ({ value: s.id, label: s.name ?? '' }));

        return {
          options: [
            ...options,
            ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar' }] : []),
          ],
          counts,
        };
      }

      case 'is_active': {
        const rows = await prisma.vehicles.groupBy({
          by: ['is_active'],
          where: crossWhere,
          _count: true,
        });

        const counts = new Map<string, number>();
        for (const r of rows) {
          if (r.is_active === null) {
            counts.set(NULL_FILTER_VALUE, r._count);
          } else {
            counts.set(String(r.is_active), r._count);
          }
        }

        return {
          options: [
            { value: 'true', label: 'Activo' },
            { value: 'false', label: 'Inactivo' },
            ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar' }] : []),
          ],
          counts,
        };
      }

      default:
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener faceta de equipo por titular', { data: { error, ownerId, columnId } });
    return null;
  }
}

// ============================================================================
// MUTACIONES — Prisma (reemplaza Supabase)
// ============================================================================

export async function createEquipmentOwnerPrisma(data: {
  name: string;
  is_active: boolean;
  cuit: string;
  contract_types: ('Leasing' | 'Alquiler' | 'Prendado')[];
}) {
  await requireConfigTabPermission('titulares', 'create');
  data = equipmentOwnerCreateSchema.parse(data);
  try {
    const result = await prisma.equipment_owners.create({
      data: {
        name: data.name,
        is_active: data.is_active,
        cuit: data.cuit,
        ...catalogWriteScope(await getActiveCompanyId()),
        // Campo legacy requerido por el schema: usar el primero de la lista
        contract_type: data.contract_types[0] as 'Leasing' | 'Alquiler' | 'Prendado',
        equipment_owner_contract_types: {
          create: data.contract_types.map((type) => ({ contract_type: type })),
        },
      },
      select: {
        id: true,
        name: true,
        cuit: true,
        is_active: true,
        created_at: true,
        equipment_owner_contract_types: { select: { id: true, contract_type: true } },
      },
    });
    return result;
  } catch (error) {
    logger.error('Error al crear titular de equipo', { data: { error } });
    throw new Error('No se pudo crear el titular. Intente nuevamente.');
  }
}

export async function updateEquipmentOwnerPrisma(data: {
  id: string;
  name: string;
  is_active: boolean;
  cuit: string;
  contract_types: ('Leasing' | 'Alquiler' | 'Prendado')[];
}) {
  await requireConfigTabPermission('titulares', 'update');
  data = equipmentOwnerUpdateSchema.parse(data);
  try {
    // Perímetro sin RLS: un titular global se lee pero no se edita desde una empresa.
    const companyId = await getActiveCompanyId();
    const existing = await prisma.equipment_owners.findUnique({ where: { id: data.id }, select: { company_id: true } });
    const accessError = catalogAccessError(resolveCatalogAccess(existing, companyId, 'write'), 'El titular no existe');
    if (accessError) throw new Error(accessError);

    // Actualizar en transacción: primero eliminar tipos existentes, luego insertar nuevos
    const result = await prisma.$transaction(async (tx) => {
      await tx.equipment_owner_contract_types.deleteMany({
        where: { equipment_owner_id: data.id },
      });

      return tx.equipment_owners.update({
        where: { id: data.id },
        data: {
          name: data.name,
          is_active: data.is_active,
          cuit: data.cuit,
          contract_type: data.contract_types[0] as 'Leasing' | 'Alquiler' | 'Prendado',
          equipment_owner_contract_types: {
            create: data.contract_types.map((type) => ({ contract_type: type })),
          },
        },
        select: {
          id: true,
          name: true,
          cuit: true,
          is_active: true,
          created_at: true,
          equipment_owner_contract_types: { select: { id: true, contract_type: true } },
        },
      });
    });
    return result;
  } catch (error) {
    logger.error('Error al actualizar titular de equipo', { data: { error, id: data.id } });
    throw error instanceof Error ? error : new Error('No se pudo actualizar el titular. Intente nuevamente.');
  }
}

/**
 * Reasigna masivamente los vehículos de un titular a otro (o a ninguno).
 * Antes esto se hacía desde el navegador con PostgREST: ahora es una server action y la
 * escritura va acotada a la empresa activa (sin RLS, es la única defensa del endpoint).
 */
export async function reassignVehiclesToOwner(fromOwnerId: string, toOwnerId: string | null) {
  await requireConfigTabPermission('titulares', 'update');
  ({ fromOwnerId, toOwnerId } = reassignVehiclesSchema.parse({ fromOwnerId, toOwnerId }));
  try {
    const companyId = await getActiveCompanyId();
    // `toOwnerId` llega del cliente: tiene que ser un titular legible por la empresa activa.
    if (toOwnerId) await assertEquipmentOwnerReadable(companyId, toOwnerId);

    const result = await prisma.vehicles.updateMany({
      where: { owner_id: fromOwnerId, company_id: companyId },
      data: { owner_id: toOwnerId },
    });
    logger.info('Vehículos reasignados', { data: { fromOwnerId, toOwnerId, count: result.count } });
    return result;
  } catch (error) {
    logger.error('Error al reasignar vehículos de titular', { data: { error, fromOwnerId, toOwnerId } });
    throw error instanceof Error ? error : new Error('No se pudo reasignar los vehículos. Intente nuevamente.');
  }
}

// ============================================================================
// TIPOS EXPORTADOS
// ============================================================================

export type EquipmentOwnerListItem = Awaited<ReturnType<typeof getEquipmentOwnersPaginated>>['data'][number];
export type VehicleByOwnerListItem = Awaited<ReturnType<typeof getVehiclesByOwnerPaginated>>['data'][number];
