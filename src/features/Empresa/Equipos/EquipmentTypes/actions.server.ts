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
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import { equipmentTypeCreateSchema, equipmentTypeUpdateSchema } from '../../lib/catalog-input-schemas';
import { requireConfigTabPermission } from '../../lib/config-access.server';
import { assertChecklistTemplatesOwned, assertTypesReadable } from '../lib/catalog-guards';
import { catalogAccessError, catalogReadScope, catalogWriteScope, resolveCatalogAccess } from '../lib/catalog-scope';
import { effectiveHitchTypeIds } from '../lib/hitch-compatibility';

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

function buildWhereClause(state: ReturnType<typeof parseSearchParams>) {
  // Búsqueda global
  const searchWhere = buildSearchWhere(state.search, ['name']);

  // is_active — booleano nullable, manejo manual
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

  // applies_to — string enum nullable, manejo manual
  const appliesToValues = state.filters['applies_to'];
  const appliesToFilter: Record<string, unknown> = {};
  if (appliesToValues?.length) {
    const nullIncluded = appliesToValues.includes(NULL_FILTER_VALUE);
    const realValues = appliesToValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (nullIncluded && realValues.length > 0) {
      appliesToFilter.OR = [{ applies_to: { in: realValues } }, { applies_to: null }];
    } else if (nullIncluded) {
      appliesToFilter.applies_to = null;
    } else {
      appliesToFilter.applies_to = realValues.length === 1 ? realValues[0] : { in: realValues };
    }
  }

  // is_tractor_unit — booleano nullable, manejo manual
  const isTractorValues = state.filters['is_tractor_unit'];
  const isTractorFilter: Record<string, unknown> = {};
  if (isTractorValues?.length === 1) {
    if (isTractorValues[0] === NULL_FILTER_VALUE) {
      isTractorFilter.is_tractor_unit = null;
    } else {
      isTractorFilter.is_tractor_unit = isTractorValues[0] === 'true';
    }
  } else if (isTractorValues && isTractorValues.length > 1) {
    const conditions: Array<{ is_tractor_unit: boolean | null }> = [];
    for (const v of isTractorValues) {
      if (v === NULL_FILTER_VALUE) conditions.push({ is_tractor_unit: null });
      else conditions.push({ is_tractor_unit: v === 'true' });
    }
    isTractorFilter.OR = conditions;
  }

  // Filtros de texto libre por columna
  const textFiltersWhere = buildTextFiltersWhere(state.filters, ['name']);

  // Filtros de rango de fecha
  const dateFiltersWhere = buildDateRangeFiltersWhere(state.filters, ['created_at']);

  return {
    ...searchWhere,
    ...isActiveFilter,
    ...appliesToFilter,
    ...isTractorFilter,
    ...textFiltersWhere,
    ...dateFiltersWhere,
  };
}

// ============================================================================
// QUERY PAGINADA
// ============================================================================

export async function getEquipmentTypesPaginated(searchParams: DataTableSearchParams) {
  await requireConfigTabPermission('tipos', 'view');
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
      prisma.type.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: {
          id: true,
          name: true,
          is_active: true,
          applies_to: true,
          is_tractor_unit: true,
          has_hitch: true,
          is_operative: true,
          generates_qr: true,
          created_at: true,
        },
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

export async function getAllEquipmentTypesForExport(searchParams: DataTableSearchParams) {
  await requireConfigTabPermission('tipos', 'view');
  try {
    const state = parseSearchParams(searchParams);
    // `buildWhereClause` puede traer su propio `OR`: se combinan con AND para no pisarse.
    const where = { AND: [buildWhereClause(state), catalogReadScope(await getActiveCompanyId())] };

    const resolvedSorts: Array<Record<string, unknown>> = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        resolvedSorts.push({ [s.id]: s.desc ? 'desc' : 'asc' });
      }
    }
    const safeOrderBy = [{ is_active: 'desc' as const }, ...resolvedSorts, { name: 'asc' as const }];

    return await prisma.type.findMany({
      where,
      orderBy: safeOrderBy,
      select: {
        id: true,
        name: true,
        is_active: true,
        applies_to: true,
        is_tractor_unit: true,
        has_hitch: true,
        is_operative: true,
        generates_qr: true,
        created_at: true,
      },
    });
  } catch (error) {
    logger.error('Error al exportar tipos de equipo', { data: { error } });
    throw new Error('No se pudo exportar la lista. Intente nuevamente.');
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

/** Obtiene todos los checklists activos para el select del formulario */
export async function getActiveChecklistsForForm() {
  try {
    const companyId = await getActiveCompanyId();
    const data = await prisma.checklist_templates.findMany({
      where: withCompany({ is_active: true }, companyId),
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });
    return data;
  } catch (error) {
    logger.error('Error al obtener checklists activos', { data: { error } });
    return [];
  }
}

/** Obtiene los IDs de checklists asignados a un tipo */
export async function getChecklistIdsForType(typeId: string): Promise<string[]> {
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

    const created = await prisma.type.create({
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

    // Crear relaciones de enganche
    if (hitchTypeIds.length > 0) {
      await prisma.type_hitch_types.createMany({
        data: hitchTypeIds.map((compatible_type_id) => ({
          type_id: created.id,
          compatible_type_id,
          company_id: companyId,
        })),
        skipDuplicates: true,
      });
    }

    // Crear relaciones de checklists
    if (formData.checklist_ids.length > 0) {
      await prisma.checklist_template_types.createMany({
        data: formData.checklist_ids.map((template_id) => ({
          type_id: created.id,
          template_id,
          company_id: companyId,
        })),
        skipDuplicates: true,
      });
    }

    revalidatePath('/dashboard/configuration');
    return { success: true, id: created.id };
  } catch (error) {
    logger.error('Error al crear tipo de equipo', { data: { error } });
    throw error instanceof Error ? error : new Error('No se pudo crear el tipo de equipo. Intente nuevamente.');
  }
}

export async function updateEquipmentType(formData: EquipmentTypeFormData & { id: string }) {
  await requireConfigTabPermission('tipos', 'update');
  formData = equipmentTypeUpdateSchema.parse(formData);
  try {
    const companyId = await getActiveCompanyId();

    // Perímetro sin RLS: un tipo global se lee pero no se edita desde una empresa.
    const existing = await prisma.type.findUnique({ where: { id: formData.id }, select: { company_id: true } });
    const accessError = catalogAccessError(
      resolveCatalogAccess(existing, companyId, 'write'),
      'El tipo de equipo no existe'
    );
    if (accessError) throw new Error(accessError);

    // Los ids llegan del cliente: se validan contra la empresa antes de escribir las pivotes.
    const hitchTypeIds = effectiveHitchTypeIds(formData, formData.hitch_type_ids);
    await Promise.all([
      assertTypesReadable(companyId, hitchTypeIds),
      assertChecklistTemplatesOwned(companyId, formData.checklist_ids),
    ]);

    await prisma.type.update({
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

    // Actualizar relaciones de enganche: delete + insert
    await prisma.type_hitch_types.deleteMany({ where: { type_id: formData.id } });
    if (hitchTypeIds.length > 0) {
      await prisma.type_hitch_types.createMany({
        data: hitchTypeIds.map((compatible_type_id) => ({
          type_id: formData.id,
          compatible_type_id,
          company_id: companyId,
        })),
        skipDuplicates: true,
      });
    }

    // Actualizar relaciones de checklists: delete + insert
    await prisma.checklist_template_types.deleteMany({ where: { type_id: formData.id } });
    if (formData.checklist_ids.length > 0) {
      await prisma.checklist_template_types.createMany({
        data: formData.checklist_ids.map((template_id) => ({
          type_id: formData.id,
          template_id,
          company_id: companyId,
        })),
        skipDuplicates: true,
      });
    }

    revalidatePath('/dashboard/configuration');
    return { success: true };
  } catch (error) {
    logger.error('Error al actualizar tipo de equipo', { data: { error } });
    throw error instanceof Error ? error : new Error('No se pudo actualizar el tipo de equipo. Intente nuevamente.');
  }
}

// ============================================================================
// TIPOS EXPORTADOS
// ============================================================================

export type EquipmentTypeListItem = Awaited<ReturnType<typeof getEquipmentTypesPaginated>>['data'][number];
