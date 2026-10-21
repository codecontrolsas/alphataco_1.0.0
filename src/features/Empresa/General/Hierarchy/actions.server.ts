'use server';

import { Logger } from '@/lib/logger';
import type { DataTableSearchParams, FacetResult } from '@/shared/components/common/DataTable';
import {
  NULL_FILTER_VALUE,
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  parseSearchParams,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import { fetchExportRowsInBatches } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { z } from 'zod';
import { nameActiveCreateSchema, nameActiveUpdateSchema } from '../../lib/catalog-input-schemas';
import {
  CATALOG_EXPORT_MAX_ROWS,
  buildIsActiveWhere,
  catalogExportFailure,
  catalogTooLargeMessage,
} from '../../lib/catalog-table.server';
import { configPermissionError, requireConfigTabPermission } from '../../lib/config-access.server';
import { descendantsOf, wouldCreateCycle } from '../OrgChart/lib/org-chart-rules';

// ============================================================================
// LOGGER
// ============================================================================

const logger = new Logger('features/Empresa/General/Hierarchy');

// ============================================================================
// VALID SORT FIELDS — solo campos reales de BD
// ============================================================================

const VALID_SORT_FIELDS = new Set(['name', 'is_active', 'created_at', 'parent']);

/** Columnas FK: se ordenan por el nombre de la relación. */
const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  parent: (dir) => ({ parent: { name: dir } }),
};

/** Etiqueta del filtro y de la celda para los sectores sin padre. */
const ROOT_SECTOR_LABEL = 'Ninguno (sector raíz)';

function resolveSorts(sorting: ReturnType<typeof parseState>['sorting']) {
  const resolved: Array<Record<string, unknown>> = [];
  for (const s of sorting) {
    if (!VALID_SORT_FIELDS.has(s.id)) continue;
    const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
    const fkMapper = FK_SORT_MAP[s.id];
    resolved.push(fkMapper ? fkMapper(dir) : { [s.id]: dir });
  }
  return resolved;
}

// ============================================================================
// WHERE BUILDER — DRY helper compartido por paginated, export y facets
// ============================================================================

/** Claves de filtro que esta tabla realmente usa; el resto de la URL se descarta antes de armar el where. */
const ALLOWED_FILTER_KEYS = new Set(['is_active', 'name', 'parent', ...dateRangeKeys(['created_at'])]);

function parseState(searchParams: DataTableSearchParams | undefined) {
  return sanitizeFilters(parseSearchParams(searchParams ?? {}), ALLOWED_FILTER_KEYS);
}

function buildWhereClause(state: ReturnType<typeof parseState>, companyId: string) {
  return withCompany(
    {
      // La búsqueda y el filtro de estado pueden traer un OR cada uno: van en AND para que no se pisen.
      AND: [
        buildSearchWhere(state.search, ['name']),
        buildIsActiveWhere(state.filters['is_active']),
        // FK "Depende de": acepta NULL_FILTER_VALUE (sector raíz)
        buildFiltersWhere({ parent: state.filters['parent'] ?? [] }, { parent: 'parent_id' }),
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
  is_active: true,
  created_at: true,
  parent_id: true,
  parent: { select: { id: true, name: true } },
} as const;

// ============================================================================
// QUERY PAGINADA
// ============================================================================

export async function getHierarchiesPaginated(searchParams: DataTableSearchParams) {
  await requireConfigTabPermission('organigrama', 'view');
  try {
    const state = parseState(searchParams);
    const { skip, take } = stateToPrismaParams(state);

    const where = buildWhereClause(state, await getActiveCompanyId());

    // Inactivos siempre al final, luego orden del usuario, luego nombre como fallback
    const safeOrderBy = [{ is_active: 'desc' as const }, ...resolveSorts(state.sorting), { name: 'asc' as const }];

    const [data, total] = await Promise.all([
      prisma.hierarchy.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: LIST_SELECT,
      }),
      prisma.hierarchy.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener sectores', { data: { error } });
    throw new Error('No se pudo obtener la lista. Intente nuevamente.');
  }
}

// ============================================================================
// EXPORT COMPLETO — sin skip/take, mismos filtros
// ============================================================================

export async function getAllHierarchiesForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<HierarchyListItem[]>> {
  await requireConfigTabPermission('organigrama', 'view');
  try {
    const state = parseState(searchParams);
    const companyId = await getActiveCompanyId();
    const where = buildWhereClause(state, companyId);

    const safeOrderBy = [
      { is_active: 'desc' as const },
      ...resolveSorts(state.sorting),
      { name: 'asc' as const },
      { id: 'asc' as const },
    ];

    const rows = await fetchExportRowsInBatches({
      maxRows: CATALOG_EXPORT_MAX_ROWS,
      listIds: (take) => prisma.hierarchy.findMany({ where, orderBy: safeOrderBy, select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.hierarchy.findMany({ where: { id: { in: ids }, company_id: companyId }, select: LIST_SELECT }),
      tooLargeMessage: catalogTooLargeMessage('sectores'),
    });
    return { ok: true, data: rows };
  } catch (error) {
    logger.error('Error al exportar sectores', { data: { error } });
    return catalogExportFailure(error, 'la lista de sectores');
  }
}

// ============================================================================
// SINGLE FACET — lazy-load on-demand por columna con cross-filtering
// ============================================================================

/**
 * Retorna counts + opciones para UNA sola columna.
 * Aplica TODOS los filtros activos EXCEPTO el de la propia columna (cross-filter).
 */
export async function getHierarchySingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<FacetResult | null> {
  await requireConfigTabPermission('organigrama', 'view');
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
        const rows = await prisma.hierarchy.groupBy({
          by: ['is_active'],
          where: crossWhere,
          _count: true,
        });

        const counts = new Map<string, number>();
        for (const r of rows) {
          // is_active es Boolean? (nullable): el null se cuenta bajo NULL_FILTER_VALUE
          counts.set(r.is_active === null ? NULL_FILTER_VALUE : String(r.is_active), r._count);
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

      case 'parent': {
        const companyId = await getActiveCompanyId();
        const rows = await prisma.hierarchy.groupBy({
          by: ['parent_id'],
          where: crossWhere,
          _count: true,
        });

        const counts = new Map<string, number>();
        const parentIds: string[] = [];
        for (const r of rows) {
          if (r.parent_id === null) {
            counts.set(NULL_FILTER_VALUE, r._count);
          } else {
            counts.set(r.parent_id, r._count);
            parentIds.push(r.parent_id);
          }
        }

        const parents = parentIds.length
          ? await prisma.hierarchy.findMany({
              where: { id: { in: parentIds }, company_id: companyId },
              select: { id: true, name: true },
              orderBy: { name: 'asc' },
            })
          : [];

        return {
          options: [
            ...parents.map((p) => ({ value: p.id, label: p.name })),
            ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: ROOT_SECTOR_LABEL }] : []),
          ],
          counts,
        };
      }

      default:
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener faceta de sectores', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// OPCIONES DEL COMBO "DEPENDE DE"
// ============================================================================

const parentIdSchema = z.string().uuid('Identificador inválido').nullable();
const hierarchyCreateSchema = nameActiveCreateSchema.extend({ parent_id: parentIdSchema });
const hierarchyUpdateSchema = nameActiveUpdateSchema.extend({ parent_id: parentIdSchema });

const CYCLE_ERROR = 'Un sector no puede depender de sí mismo ni de uno de sus sectores dependientes.';

/** Mapa id → parent_id de todos los sectores de la empresa (una sola query). */
async function loadParentMap(companyId: string) {
  const rows = await prisma.hierarchy.findMany({
    where: { company_id: companyId },
    select: { id: true, parent_id: true },
  });
  return new Map<string, string | null>(rows.map((r) => [r.id, r.parent_id]));
}

/** Mensaje del problema con el padre elegido, o `null` si es válido (existe en la empresa y no crea un ciclo). */
async function parentError(companyId: string, nodeId: string | null, parentId: string | null): Promise<string | null> {
  if (parentId === null) return null;
  const parentOf = await loadParentMap(companyId);
  if (!parentOf.has(parentId)) return 'El sector del que depende no existe en la empresa activa.';
  if (nodeId && wouldCreateCycle(parentOf, nodeId, parentId)) return CYCLE_ERROR;
  return null;
}

/**
 * Sectores activos de la empresa para elegir "Depende de".
 * Excluye `excludeId` y todos sus descendientes (no pueden ser su propio padre). El padre actual
 * se incluye aunque esté inactivo, para que el combo no se vea vacío al editar.
 */
export async function getHierarchyParentOptions(excludeId?: string, currentParentId?: string | null) {
  await requireConfigTabPermission('organigrama', 'view');
  try {
    const companyId = await getActiveCompanyId();
    const excluded = excludeId ? descendantsOf(await loadParentMap(companyId), excludeId) : new Set<string>();
    const rows = await prisma.hierarchy.findMany({
      where: {
        company_id: companyId,
        OR: [{ is_active: true }, ...(currentParentId ? [{ id: currentParentId }] : [])],
      },
      select: { id: true, name: true, is_active: true },
      orderBy: { name: 'asc' },
    });
    return rows
      .filter((r) => !excluded.has(r.id))
      .map((r) => ({ id: r.id, name: r.is_active === false ? `${r.name} (inactivo)` : r.name }));
  } catch (error) {
    logger.error('Error al obtener opciones de sector padre', { data: { error } });
    throw new Error('No se pudieron obtener los sectores. Intente nuevamente.');
  }
}

// ============================================================================
// MUTACIONES — crear y actualizar con Prisma
// ============================================================================

/**
 * Resultado de las mutaciones de sectores. El error viaja como dato: Next reemplaza el mensaje de un
 * `Error` lanzado en una Server Action por un texto genérico en producción, y "no puede depender de
 * sí mismo" es justamente lo que el usuario necesita leer.
 */
export type HierarchyMutationResult = { ok: true; id: string } | { ok: false; error: string };

export async function createHierarchyPrisma(data: {
  name: string;
  is_active: boolean;
  parent_id: string | null;
}): Promise<HierarchyMutationResult> {
  const denied = await configPermissionError('organigrama', 'create');
  if (denied) return { ok: false, error: denied };
  const parsed = hierarchyCreateSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  const input = parsed.data;
  try {
    const companyId = await getActiveCompanyId();
    const invalid = await parentError(companyId, null, input.parent_id);
    if (invalid) return { ok: false, error: invalid };
    const result = await prisma.hierarchy.create({
      data: {
        name: input.name,
        is_active: input.is_active,
        parent_id: input.parent_id,
      },
      select: { id: true },
    });
    return { ok: true, id: result.id };
  } catch (error) {
    logger.error('Error al crear sector', { data: { error } });
    return { ok: false, error: 'No se pudo crear el sector. Intente nuevamente.' };
  }
}

export async function updateHierarchyPrisma(data: {
  id: string;
  name: string;
  is_active: boolean;
  parent_id: string | null;
}): Promise<HierarchyMutationResult> {
  const denied = await configPermissionError('organigrama', 'update');
  if (denied) return { ok: false, error: denied };
  const parsed = hierarchyUpdateSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  const input = parsed.data;
  try {
    // Perímetro sin RLS: sólo filas de la empresa activa.
    const companyId = await getActiveCompanyId();
    const owned = await prisma.hierarchy.findFirst({
      where: { id: input.id, company_id: companyId },
      select: { id: true },
    });
    if (!owned) return { ok: false, error: 'El sector no existe en la empresa activa.' };
    const invalid = await parentError(companyId, input.id, input.parent_id);
    if (invalid) return { ok: false, error: invalid };
    await prisma.hierarchy.update({
      where: { id: input.id },
      data: {
        name: input.name,
        is_active: input.is_active,
        parent_id: input.parent_id,
      },
      select: { id: true },
    });
    return { ok: true, id: input.id };
  } catch (error) {
    logger.error('Error al actualizar sector', { data: { error } });
    return { ok: false, error: 'No se pudo actualizar el sector. Intente nuevamente.' };
  }
}

// ============================================================================
// TIPOS EXPORTADOS
// ============================================================================

export type HierarchyListItem = Awaited<ReturnType<typeof getHierarchiesPaginated>>['data'][number];
