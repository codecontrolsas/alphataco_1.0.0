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
import { fetchExportRowsInBatches } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import { equipmentTypeCreateSchema } from '../../lib/catalog-input-schemas';
import {
  CATALOG_EXPORT_MAX_ROWS,
  buildIsActiveWhere,
  catalogExportFailure,
  catalogTooLargeMessage,
} from '../../lib/catalog-table.server';
import { requireConfigTabPermission } from '../../lib/config-access.server';
import { assertChecklistTemplatesOwned, assertTypesReadable } from '../lib/catalog-guards';
import { catalogAccessError, catalogReadScope, catalogWriteScope, resolveCatalogAccess } from '../lib/catalog-scope';
import { effectiveHitchTypeIds } from '../lib/hitch-compatibility';
import { equipmentTypeUpdateInputSchema, type EquipmentTypeUpdateInput } from './lib/equipment-type-input';

// ============================================================================
// LOGGER
// ============================================================================

const logger = new Logger('features/Empresa/Equipos/EquipmentTypes');

// ============================================================================
// VALID SORT FIELDS — solo campos reales de BD
// ============================================================================

const VALID_SORT_FIELDS = new Set(['name', 'is_active', 'applies_to', 'is_tractor_unit', 'has_hitch', 'created_at']);

// ============================================================================
// WHERE BUILDER — DRY helper compartido por paginated, export y facets
// ============================================================================

/** Claves de filtro que esta tabla realmente usa; el resto de la URL se descarta antes de armar el where. */
const ALLOWED_FILTER_KEYS = new Set([
  'is_active',
  'applies_to',
  'is_tractor_unit',
  'name',
  ...dateRangeKeys(['created_at']),
]);

function parseState(searchParams: DataTableSearchParams | undefined) {
  return sanitizeFilters(parseSearchParams(searchParams ?? {}), ALLOWED_FILTER_KEYS);
}

/** `where` del filtro facetado de `is_tractor_unit` (booleano nullable): 'true' / 'false' / NULL_FILTER_VALUE. */
function buildIsTractorUnitWhere(values: string[] | undefined): Record<string, unknown> {
  if (!values?.length) return {};
  const toCondition = (value: string) => ({ is_tractor_unit: value === NULL_FILTER_VALUE ? null : value === 'true' });
  return values.length === 1 ? toCondition(values[0]) : { OR: values.map(toCondition) };
}

/** `where` del filtro facetado de `applies_to` (enum de texto nullable). */
function buildAppliesToWhere(values: string[] | undefined): Record<string, unknown> {
  if (!values?.length) return {};
  const nullIncluded = values.includes(NULL_FILTER_VALUE);
  const realValues = values.filter((v) => v !== NULL_FILTER_VALUE);
  if (nullIncluded && realValues.length > 0) return { OR: [{ applies_to: { in: realValues } }, { applies_to: null }] };
  if (nullIncluded) return { applies_to: null };
  return { applies_to: realValues.length === 1 ? realValues[0] : { in: realValues } };
}

/** Mismo where para lista, export y facets. Los filtros con OR van en AND para que no se pisen. */
function buildWhereClause(state: ReturnType<typeof parseState>, companyId: string) {
  return {
    AND: [
      buildSearchWhere(state.search, ['name']),
      buildIsActiveWhere(state.filters['is_active']),
      buildAppliesToWhere(state.filters['applies_to']),
      buildIsTractorUnitWhere(state.filters['is_tractor_unit']),
      buildTextFiltersWhere(state.filters, ['name']),
      buildDateRangeFiltersWhere(state.filters, ['created_at']),
      catalogReadScope(companyId),
    ],
  };
}

const LIST_SELECT = {
  id: true,
  name: true,
  is_active: true,
  applies_to: true,
  is_tractor_unit: true,
  has_hitch: true,
  is_operative: true,
  generates_qr: true,
  created_at: true,
} as const;

// ============================================================================
// QUERY PAGINADA
// ============================================================================

export async function getEquipmentTypesPaginated(searchParams: DataTableSearchParams) {
  await requireConfigTabPermission('tipos', 'view');
  try {
    const state = parseState(searchParams);
    const { skip, take } = stateToPrismaParams(state);

    const where = buildWhereClause(state, await getActiveCompanyId());

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
      prisma.type.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: LIST_SELECT,
      }),
      prisma.type.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener tipos de equipo', { data: { error } });
    throw new Error('No se pudo obtener la lista. Intente nuevamente.');
  }
}

// ============================================================================
// EXPORT COMPLETO — sin skip/take, mismos filtros
// ============================================================================

export async function getAllEquipmentTypesForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<EquipmentTypeListItem[]>> {
  await requireConfigTabPermission('tipos', 'view');
  try {
    const state = parseState(searchParams);
    const where = buildWhereClause(state, await getActiveCompanyId());

    const resolvedSorts: Array<Record<string, unknown>> = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        resolvedSorts.push({ [s.id]: s.desc ? 'desc' : 'asc' });
      }
    }
    const safeOrderBy = [
      { is_active: 'desc' as const },
      ...resolvedSorts,
      { name: 'asc' as const },
      { id: 'asc' as const },
    ];

    const rows = await fetchExportRowsInBatches({
      maxRows: CATALOG_EXPORT_MAX_ROWS,
      listIds: (take) => prisma.type.findMany({ where, orderBy: safeOrderBy, select: { id: true }, take }),
      fetchByIds: (ids) => prisma.type.findMany({ where: { AND: [where, { id: { in: ids } }] }, select: LIST_SELECT }),
      tooLargeMessage: catalogTooLargeMessage('tipos de unidad'),
    });
    return { ok: true, data: rows };
  } catch (error) {
    logger.error('Error al exportar tipos de equipo', { data: { error } });
    return catalogExportFailure(error, 'la lista de tipos de unidad');
  }
}

// ============================================================================
// SINGLE FACET — lazy-load on-demand por columna con cross-filtering
// ============================================================================

/**
 * Retorna counts + opciones para UNA sola columna.
 * Aplica TODOS los filtros activos EXCEPTO el de la propia columna (cross-filter).
 */
export async function getEquipmentTypeSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<FacetResult | null> {
  await requireConfigTabPermission('tipos', 'view');
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
        const rows = await prisma.type.groupBy({
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

      case 'applies_to': {
        const rows = await prisma.type.groupBy({
          by: ['applies_to'],
          where: crossWhere,
          _count: true,
        });

        const counts = new Map<string, number>();
        for (const r of rows) {
          if (r.applies_to === null) {
            counts.set(NULL_FILTER_VALUE, r._count);
          } else {
            counts.set(r.applies_to, r._count);
          }
        }

        return {
          options: [
            { value: 'vehicle', label: 'Vehículos' },
            { value: 'other_equipment', label: 'Otros Equipos' },
            ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar' }] : []),
          ],
          counts,
        };
      }

      case 'is_tractor_unit': {
        const rows = await prisma.type.groupBy({
          by: ['is_tractor_unit'],
          where: crossWhere,
          _count: true,
        });

        const counts = new Map<string, number>();
        for (const r of rows) {
          if (r.is_tractor_unit === null) {
            counts.set(NULL_FILTER_VALUE, r._count);
          } else {
            counts.set(String(r.is_tractor_unit), r._count);
          }
        }

        return {
          options: [
            { value: 'true', label: 'Sí' },
            { value: 'false', label: 'No' },
            ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar' }] : []),
          ],
          counts,
        };
      }

      default:
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener faceta de tipo de equipo', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// QUERIES DE CATÁLOGOS (para el formulario)
// ============================================================================

/** Obtiene los IDs de checklists asignados a un tipo */
export async function getChecklistIdsForType(typeId: string): Promise<string[]> {
  await requireConfigTabPermission('tipos', 'view');
  try {
    const data = await prisma.checklist_template_types.findMany({
      where: { type_id: typeId },
      select: { template_id: true },
    });
    return data.map((r) => r.template_id);
  } catch (error) {
    logger.error('Error al obtener checklists del tipo', { data: { error, typeId } });
    return [];
  }
}

/** Obtiene los IDs de tipos de enganche compatibles para un tipo */
export async function getHitchTypeIdsForType(typeId: string): Promise<string[]> {
  await requireConfigTabPermission('tipos', 'view');
  try {
    const data = await prisma.type_hitch_types.findMany({
      where: { type_id: typeId },
      select: { compatible_type_id: true },
    });
    return data.map((r) => r.compatible_type_id);
  } catch (error) {
    logger.error('Error al obtener tipos de enganche', { data: { error, typeId } });
    return [];
  }
}

/** Obtiene todos los tipos activos (para el multi-select de enganche) */
export async function getAllActiveTypes() {
  await requireConfigTabPermission('tipos', 'view');
  try {
    const companyId = await getActiveCompanyId();
    const data = await prisma.type.findMany({
      where: { is_active: true, ...catalogReadScope(companyId) },
      select: { id: true, name: true, is_tractor_unit: true },
      orderBy: { name: 'asc' },
    });
    return data;
  } catch (error) {
    logger.error('Error al obtener tipos activos', { data: { error } });
    return [];
  }
}

// ============================================================================
// MUTACIONES — crear y actualizar con Prisma
// ============================================================================

export interface EquipmentTypeFormData {
  id?: string;
  name: string;
  applies_to: 'vehicle' | 'other_equipment';
  is_active: boolean;
  is_operative: boolean;
  is_tractor_unit: boolean;
  has_hitch: boolean;
  hitch_type_ids: string[];
  checklist_ids: string[];
}

export async function createEquipmentType(formData: EquipmentTypeFormData) {
  await requireConfigTabPermission('tipos', 'create');
  formData = equipmentTypeCreateSchema.parse(formData);
  try {
    const companyId = await getActiveCompanyId();

    // Los ids llegan del cliente: se validan contra la empresa antes de escribir las pivotes.
    const hitchTypeIds = effectiveHitchTypeIds(formData, formData.hitch_type_ids);
    await Promise.all([
      assertTypesReadable(companyId, hitchTypeIds),
      assertChecklistTemplatesOwned(companyId, formData.checklist_ids),
    ]);

    // Tipo y relaciones en una sola transacción: no queda un tipo creado sin sus enganches/checklists.
    const created = await prisma.$transaction(async (tx) => {
      const type = await tx.type.create({
        data: {
          ...catalogWriteScope(companyId),
          name: formData.name,
          applies_to: formData.applies_to,
          is_active: formData.is_active,
          is_operative: formData.applies_to === 'other_equipment' ? formData.is_operative : false,
          is_tractor_unit: formData.is_tractor_unit,
          has_hitch: formData.is_tractor_unit ? formData.has_hitch : false,
        },
        select: { id: true },
      });

      // En el alta todo es "add"
      if (hitchTypeIds.length > 0) {
        await tx.type_hitch_types.createMany({
          data: hitchTypeIds.map((compatible_type_id) => ({
            type_id: type.id,
            compatible_type_id,
            company_id: companyId,
          })),
          skipDuplicates: true,
        });
      }

      if (formData.checklist_ids.length > 0) {
        await tx.checklist_template_types.createMany({
          data: formData.checklist_ids.map((template_id) => ({
            type_id: type.id,
            template_id,
            company_id: companyId,
          })),
          skipDuplicates: true,
        });
      }

      return type;
    });

    revalidatePath('/dashboard/configuration');
    return { success: true, id: created.id };
  } catch (error) {
    logger.error('Error al crear tipo de equipo', { data: { error } });
    throw error instanceof Error ? error : new Error('No se pudo crear el tipo de equipo. Intente nuevamente.');
  }
}

/**
 * Actualiza el tipo y sus relaciones M:M con altas/bajas explícitas (`hitches`, `checklists`).
 * Todo ocurre en una transacción; el `deleteMany` queda acotado a los ids de `remove`.
 * Devuelve las cantidades reales agregadas/quitadas.
 */
export async function updateEquipmentType(input: EquipmentTypeUpdateInput) {
  await requireConfigTabPermission('tipos', 'update');
  const formData = equipmentTypeUpdateInputSchema.parse(input);
  try {
    const companyId = await getActiveCompanyId();

    // Perímetro sin RLS: un tipo global se lee pero no se edita desde una empresa.
    const existing = await prisma.type.findUnique({ where: { id: formData.id }, select: { company_id: true } });
    const accessError = catalogAccessError(
      resolveCatalogAccess(existing, companyId, 'write'),
      'El tipo de equipo no existe'
    );
    if (accessError) throw new Error(accessError);

    // Si el tipo dejó de ser tractor o de llevar enganche, no se agregan enganches (las bajas sí se respetan).
    const hitchAdd = effectiveHitchTypeIds(formData, formData.hitches.add);
    const hitchRemove = Array.from(new Set(formData.hitches.remove));
    const checklistAdd = Array.from(new Set(formData.checklists.add));
    const checklistRemove = Array.from(new Set(formData.checklists.remove));

    // Los ids que se agregan llegan del cliente: se validan contra la empresa antes de escribir.
    await Promise.all([
      assertTypesReadable(companyId, hitchAdd),
      assertChecklistTemplatesOwned(companyId, checklistAdd),
    ]);

    const result = await prisma.$transaction(async (tx) => {
      await tx.type.update({
        where: { id: formData.id },
        data: {
          name: formData.name,
          applies_to: formData.applies_to,
          is_active: formData.is_active,
          is_operative: formData.applies_to === 'other_equipment' ? formData.is_operative : false,
          is_tractor_unit: formData.is_tractor_unit,
          has_hitch: formData.is_tractor_unit ? formData.has_hitch : false,
        },
      });

      const removedHitches = hitchRemove.length
        ? await tx.type_hitch_types.deleteMany({
            where: { type_id: formData.id, compatible_type_id: { in: hitchRemove } },
          })
        : { count: 0 };
      const addedHitches = hitchAdd.length
        ? await tx.type_hitch_types.createMany({
            data: hitchAdd.map((compatible_type_id) => ({
              type_id: formData.id,
              compatible_type_id,
              company_id: companyId,
            })),
            skipDuplicates: true,
          })
        : { count: 0 };

      const removedChecklists = checklistRemove.length
        ? await tx.checklist_template_types.deleteMany({
            where: { type_id: formData.id, template_id: { in: checklistRemove } },
          })
        : { count: 0 };
      const addedChecklists = checklistAdd.length
        ? await tx.checklist_template_types.createMany({
            data: checklistAdd.map((template_id) => ({
              type_id: formData.id,
              template_id,
              company_id: companyId,
            })),
            skipDuplicates: true,
          })
        : { count: 0 };

      return {
        hitches: { added: addedHitches.count, removed: removedHitches.count },
        checklists: { added: addedChecklists.count, removed: removedChecklists.count },
      };
    });

    revalidatePath('/dashboard/configuration');
    return { success: true, ...result };
  } catch (error) {
    logger.error('Error al actualizar tipo de equipo', { data: { error } });
    throw error instanceof Error ? error : new Error('No se pudo actualizar el tipo de equipo. Intente nuevamente.');
  }
}

// ============================================================================
// TIPOS EXPORTADOS
// ============================================================================

export type EquipmentTypeListItem = Awaited<ReturnType<typeof getEquipmentTypesPaginated>>['data'][number];
