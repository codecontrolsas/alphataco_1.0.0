'use server';

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
import { ExportTooLargeError } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import {
  equipmentModelCreateSchema,
  equipmentModelUpdateSchema,
  firstIssueMessage,
} from '../../lib/catalog-input-schemas';
import {
  CATALOG_EXPORT_MAX_ROWS,
  buildIsActiveWhere,
  catalogExportFailure,
  catalogTooLargeMessage,
} from '../../lib/catalog-table.server';
import { requireConfigTabPermission } from '../../lib/config-access.server';
import { assertBrandReadable } from '../lib/catalog-guards';
import { catalogReadScope } from '../lib/catalog-scope';

// ============================================================================
// LOGGER
// ============================================================================

const logger = new Logger('features/Empresa/Equipos/EquipmentModels');

// ============================================================================
// VALID SORT FIELDS — solo campos reales de BD
// ============================================================================

const VALID_SORT_FIELDS = new Set(['name', 'is_active', 'created_at']);

// ============================================================================
// FK_SORT_MAP — para columnas FK que se ordenan por campo de la relación
// ============================================================================

const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  brand: (dir) => ({ brand_vehicles: { name: dir } }),
};

// ============================================================================
// WHERE BUILDER — DRY helper compartido por paginated, export y facets
// ============================================================================

/** Claves de filtro que esta tabla realmente usa; el resto de la URL se descarta antes de armar el where. */
const ALLOWED_FILTER_KEYS = new Set(['is_active', 'brand', 'name', ...dateRangeKeys(['created_at'])]);

function parseState(searchParams: DataTableSearchParams | undefined) {
  return sanitizeFilters(parseSearchParams(searchParams ?? {}), ALLOWED_FILTER_KEYS);
}

/** `where` del filtro facetado de marca (FK Int nullable). */
function buildBrandWhere(values: string[] | undefined): Record<string, unknown> {
  if (!values?.length) return {};
  const hasNull = values.includes(NULL_FILTER_VALUE);
  const realIds = values
    .filter((v) => v !== NULL_FILTER_VALUE)
    .map(Number)
    .filter((n) => !isNaN(n));

  if (hasNull && realIds.length > 0) return { OR: [{ brand: { in: realIds } }, { brand: null }] };
  if (hasNull) return { brand: null };
  if (realIds.length > 0) return { brand: { in: realIds } };
  return {};
}

/** Mismo where para lista, export y facets. Los filtros con OR van en AND para que no se pisen. */
function buildWhereClause(state: ReturnType<typeof parseState>, companyId: string) {
  return withCompany(
    {
      AND: [
        buildSearchWhere(state.search, ['name']),
        buildIsActiveWhere(state.filters['is_active']),
        buildBrandWhere(state.filters['brand']),
      ],
      ...buildTextFiltersWhere(state.filters, ['name']),
      ...buildDateRangeFiltersWhere(state.filters, ['created_at']),
    },
    companyId
  );
}

const LIST_SELECT = {
  id: true,
  name: true,
  brand: true,
  is_active: true,
  created_at: true,
  brand_vehicles: { select: { id: true, name: true } },
} as const;

// ============================================================================
// QUERY PAGINADA
// ============================================================================

export async function getEquipmentModelsPaginated(searchParams: DataTableSearchParams) {
  await requireConfigTabPermission('modelos', 'view');
  try {
    const state = parseState(searchParams);
    const { skip, take } = stateToPrismaParams(state);

    const where = buildWhereClause(state, await getActiveCompanyId());

    // Resolución de multi-sort
    const resolvedSorts: Array<Record<string, unknown>> = [];
    for (const s of state.sorting) {
      const fkMapper = FK_SORT_MAP[s.id];
      if (fkMapper) {
        resolvedSorts.push(fkMapper(s.desc ? 'desc' : 'asc'));
      } else if (VALID_SORT_FIELDS.has(s.id)) {
        resolvedSorts.push({ [s.id]: s.desc ? 'desc' : 'asc' });
      }
    }
    // Inactivos siempre al final, luego orden del usuario, luego nombre como fallback
    const safeOrderBy = [{ is_active: 'desc' as const }, ...resolvedSorts, { name: 'asc' as const }];

    const [data, total] = await Promise.all([
      prisma.model_vehicles.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: LIST_SELECT,
      }),
      prisma.model_vehicles.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener modelos de equipos', { data: { error } });
    throw new Error('No se pudo obtener la lista. Intente nuevamente.');
  }
}

// ============================================================================
// EXPORT COMPLETO — sin skip/take, mismos filtros
// ============================================================================

export async function getAllEquipmentModelsForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<EquipmentModelListItem[]>> {
  await requireConfigTabPermission('modelos', 'view');
  try {
    const state = parseState(searchParams);
    const where = buildWhereClause(state, await getActiveCompanyId());

    const resolvedSorts: Array<Record<string, unknown>> = [];
    for (const s of state.sorting) {
      const fkMapper = FK_SORT_MAP[s.id];
      if (fkMapper) {
        resolvedSorts.push(fkMapper(s.desc ? 'desc' : 'asc'));
      } else if (VALID_SORT_FIELDS.has(s.id)) {
        resolvedSorts.push({ [s.id]: s.desc ? 'desc' : 'asc' });
      }
    }
    const safeOrderBy = [
      { is_active: 'desc' as const },
      ...resolvedSorts,
      { name: 'asc' as const },
      { id: 'asc' as const },
    ];

    // Catálogo con id numérico: una sola consulta acotada al tope (pide una fila de más para detectarlo).
    const rows = await prisma.model_vehicles.findMany({
      where,
      orderBy: safeOrderBy,
      select: LIST_SELECT,
      take: CATALOG_EXPORT_MAX_ROWS + 1,
    });
    if (rows.length > CATALOG_EXPORT_MAX_ROWS) {
      throw new ExportTooLargeError(catalogTooLargeMessage('modelos')(CATALOG_EXPORT_MAX_ROWS));
    }
    return { ok: true, data: rows };
  } catch (error) {
    logger.error('Error al exportar modelos de equipos', { data: { error } });
    return catalogExportFailure(error, 'la lista de modelos');
  }
}

// ============================================================================
// SINGLE FACET — lazy-load on-demand por columna con cross-filtering
// ============================================================================

/**
 * Retorna counts + opciones para UNA sola columna.
 * Aplica TODOS los filtros activos EXCEPTO el de la propia columna (cross-filter).
 */
export async function getEquipmentModelSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<FacetResult | null> {
  await requireConfigTabPermission('modelos', 'view');
  try {
    const state = parseState(searchParams);

    // crossWhere: aplica todos los filtros EXCEPTO el de la columna propia
    const crossState = {
      ...state,
      filters: { ...state.filters },
    };
    delete crossState.filters[columnId];

    const crossWhere = buildWhereClause(crossState, await getActiveCompanyId());

    switch (columnId) {
      case 'is_active': {
        const rows = await prisma.model_vehicles.groupBy({
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

      case 'brand': {
        // Agrupar por brand (BigInt nullable)
        const rows = await prisma.model_vehicles.groupBy({
          by: ['brand'],
          where: crossWhere,
          _count: true,
        });

        const counts = new Map<string, number>();
        for (const r of rows) {
          if (r.brand === null) {
            counts.set(NULL_FILTER_VALUE, r._count);
          } else {
            counts.set(String(r.brand), r._count);
          }
        }

        // Resolver nombres de marcas
        const brandIds = rows.filter((r) => r.brand !== null).map((r) => r.brand as number);
        const brands =
          brandIds.length > 0
            ? await prisma.brand_vehicles.findMany({
                where: { id: { in: brandIds } },
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
              })
            : [];

        const resolvedOptions = brands.map((b) => ({
          value: String(b.id),
          label: b.name ?? `Marca ${b.id}`,
        }));

        if (counts.has(NULL_FILTER_VALUE)) {
          resolvedOptions.push({ value: NULL_FILTER_VALUE, label: 'Sin marca' });
        }

        return {
          options: resolvedOptions,
          counts,
        };
      }

      default:
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener faceta de modelo de equipo', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// MUTACIONES — crear y actualizar con Prisma
// ============================================================================

/**
 * Las mutaciones de este modulo devuelven { ok, error } en vez de lanzar: Next
 * reemplaza el mensaje de cualquier Error lanzado en una server action por un texto
 * generico en los builds de produccion, asi que el motivo real nunca llegaba al
 * usuario. Devolverlo como dato lo mantiene visible (ticket 616).
 */

/**
 * Verifica si ya existe un modelo con el mismo nombre para la misma marca.
 * La comparacion ignora mayusculas y espacios sobrantes: para el usuario
 * "Hiace L2H2" y "hiace l2h2 " son el mismo modelo.
 *
 * @param excludeId id a excluir de la busqueda (al editar, el propio registro)
 */
async function findDuplicateEquipmentModel(name: string, brand: number, excludeId?: number) {
  const companyId = await getActiveCompanyId();
  return prisma.model_vehicles.findFirst({
    where: {
      company_id: companyId,
      brand,
      name: { equals: name.trim(), mode: 'insensitive' },
      ...(excludeId != null ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, name: true, is_active: true },
  });
}

export async function createEquipmentModelPrisma(data: { name: string; brand: number; is_active: boolean }) {
  await requireConfigTabPermission('modelos', 'create');
  const parsedInput = equipmentModelCreateSchema.safeParse(data);
  if (!parsedInput.success) return { ok: false as const, error: firstIssueMessage(parsedInput.error) };
  data = parsedInput.data;
  try {
    // `brand` llega del cliente: tiene que ser una marca legible por la empresa (propia o global).
    await assertBrandReadable(await getActiveCompanyId(), data.brand);

    // Guarda contra duplicados: el alta se rechaza con un mensaje claro en vez de
    // crear una segunda fila identica (ticket 616).
    const duplicate = await findDuplicateEquipmentModel(data.name, data.brand);
    if (duplicate) {
      return {
        ok: false as const,
        error: duplicate.is_active
          ? `Ya existe el modelo "${duplicate.name}" para esta marca.`
          : `Ya existe el modelo "${duplicate.name}" para esta marca, pero esta inactivo. Reactivalo en lugar de crear uno nuevo.`,
      };
    }

    const result = await prisma.model_vehicles.create({
      data: {
        name: data.name,
        brand: data.brand,
        is_active: data.is_active,
      },
      select: {
        id: true,
        name: true,
        brand: true,
        is_active: true,
        created_at: true,
        brand_vehicles: { select: { id: true, name: true } },
      },
    });
    return { ok: true as const, data: result };
  } catch (error) {
    logger.error('Error al crear modelo de equipo', { data: { error } });
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'No se pudo crear el modelo. Intente nuevamente.',
    };
  }
}

export async function updateEquipmentModelPrisma(data: {
  id: number;
  name: string;
  brand: number;
  is_active: boolean;
}) {
  await requireConfigTabPermission('modelos', 'update');
  const parsedInput = equipmentModelUpdateSchema.safeParse(data);
  if (!parsedInput.success) return { ok: false as const, error: firstIssueMessage(parsedInput.error) };
  data = parsedInput.data;
  try {
    await assertBrandReadable(await getActiveCompanyId(), data.brand);

    const duplicate = await findDuplicateEquipmentModel(data.name, data.brand, data.id);
    if (duplicate) {
      return { ok: false as const, error: `Ya existe el modelo "${duplicate.name}" para esta marca.` };
    }

    // Perímetro sin RLS: `model_vehicles.company_id` es NOT NULL, no hay modelos globales.
    const owned = await prisma.model_vehicles.findFirst({
      where: withCompany({ id: data.id }, await getActiveCompanyId()),
      select: { id: true },
    });
    if (!owned) return { ok: false as const, error: 'El modelo no existe.' };

    const result = await prisma.model_vehicles.update({
      where: { id: data.id },
      data: {
        name: data.name,
        brand: data.brand,
        is_active: data.is_active,
      },
      select: {
        id: true,
        name: true,
        brand: true,
        is_active: true,
        created_at: true,
        brand_vehicles: { select: { id: true, name: true } },
      },
    });
    return { ok: true as const, data: result };
  } catch (error) {
    logger.error('Error al actualizar modelo de equipo', { data: { error } });
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'No se pudo actualizar el modelo. Intente nuevamente.',
    };
  }
}

// ============================================================================
// CATÁLOGO DE MARCAS ACTIVAS — para el formulario
// ============================================================================

export async function getActiveBrandsForSelect() {
  await requireConfigTabPermission('modelos', 'view');
  try {
    const companyId = await getActiveCompanyId();
    return await prisma.brand_vehicles.findMany({
      where: { is_active: true, ...catalogReadScope(companyId) },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener marcas activas', { data: { error } });
    return [];
  }
}

// ============================================================================
// TIPOS EXPORTADOS
// ============================================================================

export type EquipmentModelListItem = Awaited<ReturnType<typeof getEquipmentModelsPaginated>>['data'][number];
export type BrandForSelect = Awaited<ReturnType<typeof getActiveBrandsForSelect>>[number];
