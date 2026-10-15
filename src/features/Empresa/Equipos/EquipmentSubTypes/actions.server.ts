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
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import { equipmentSubTypeCreateSchema, equipmentSubTypeUpdateSchema } from '../../lib/catalog-input-schemas';
import { requireConfigTabPermission } from '../../lib/config-access.server';
import { assertChecklistTemplatesOwned, assertCompatibleItemsReadable } from '../lib/catalog-guards';
import { catalogAccessError, catalogReadScope, catalogWriteScope, resolveCatalogAccess } from '../lib/catalog-scope';
import { canHaveCompatibleItems, parseCompatibleItemKeys, typeIdsWithoutSubTypes } from '../lib/hitch-compatibility';

// ============================================================================
// LOGGER
// ============================================================================

const logger = new Logger('features/Empresa/Equipos/EquipmentSubTypes');

// ============================================================================
// VALID SORT FIELDS — solo campos reales de BD
// ============================================================================

const VALID_SORT_FIELDS = new Set(['name', 'is_active', 'created_at']);

// FK_SORT_MAP — para ordenar por campos de relaciones
const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  type: (dir) => ({ type_sub_type_typeTotype: { name: dir } }),
};

// ============================================================================
// WHERE BUILDER — DRY helper compartido por paginated, export y facets
// ============================================================================

function buildWhereClause(state: ReturnType<typeof parseSearchParams>) {
  const searchWhere = buildSearchWhere(state.search, ['name']);

  // is_active es booleano nullable — manejo manual
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

  // Filtro FK type (UUID) — viene en state.filters['type']
  const typeValues = state.filters['type'];
  const typeFilter: Record<string, unknown> = {};
  if (typeValues?.length) {
    const realValues = typeValues.filter((v) => v !== NULL_FILTER_VALUE);
    const hasNull = typeValues.includes(NULL_FILTER_VALUE);

    if (hasNull && realValues.length > 0) {
      typeFilter.OR = [{ type: { in: realValues } }, { type: null }];
    } else if (hasNull) {
      typeFilter.type = null;
    } else if (realValues.length === 1) {
      typeFilter.type = realValues[0];
    } else {
      typeFilter.type = { in: realValues };
    }
  }

  // Filtros de texto libre por columna
  const textFiltersWhere = buildTextFiltersWhere(state.filters, ['name']);

  // Filtros de rango de fecha
  const dateFiltersWhere = buildDateRangeFiltersWhere(state.filters, ['created_at']);

  return {
    ...searchWhere,
    ...isActiveFilter,
    ...typeFilter,
    ...textFiltersWhere,
    ...dateFiltersWhere,
  };
}

// ============================================================================
// QUERY PAGINADA
// ============================================================================

export async function getEquipmentSubTypesPaginated(searchParams: DataTableSearchParams) {
  await requireConfigTabPermission('subtipos', 'view');
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
      } else if (FK_SORT_MAP[s.id]) {
        resolvedSorts.push(FK_SORT_MAP[s.id](s.desc ? 'desc' : 'asc'));
      }
    }
    // Inactivos siempre al final, luego orden del usuario, luego nombre como fallback
    const safeOrderBy = [{ is_active: 'desc' as const }, ...resolvedSorts, { name: 'asc' as const }];

    const [data, total] = await Promise.all([
      prisma.sub_type.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: {
          id: true,
          name: true,
          is_active: true,
          created_at: true,
          type: true,
          type_sub_type_typeTotype: {
            select: { id: true, name: true },
          },
        },
      }),
      prisma.sub_type.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener subtipos de equipos', { data: { error } });
    throw new Error('No se pudo obtener la lista. Intente nuevamente.');
  }
}

// ============================================================================
// EXPORT COMPLETO — sin skip/take, mismos filtros
// ============================================================================

export async function getAllEquipmentSubTypesForExport(searchParams: DataTableSearchParams) {
  await requireConfigTabPermission('subtipos', 'view');
  try {
    const state = parseSearchParams(searchParams);
    // `buildWhereClause` puede traer su propio `OR`: se combinan con AND para no pisarse.
    const where = { AND: [buildWhereClause(state), catalogReadScope(await getActiveCompanyId())] };

    const resolvedSorts: Array<Record<string, unknown>> = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        resolvedSorts.push({ [s.id]: s.desc ? 'desc' : 'asc' });
      } else if (FK_SORT_MAP[s.id]) {
        resolvedSorts.push(FK_SORT_MAP[s.id](s.desc ? 'desc' : 'asc'));
      }
    }
    const safeOrderBy = [{ is_active: 'desc' as const }, ...resolvedSorts, { name: 'asc' as const }];

    return await prisma.sub_type.findMany({
      where,
      orderBy: safeOrderBy,
      select: {
        id: true,
        name: true,
        is_active: true,
        created_at: true,
        type: true,
        type_sub_type_typeTotype: {
          select: { id: true, name: true },
        },
      },
    });
  } catch (error) {
    logger.error('Error al exportar subtipos de equipos', { data: { error } });
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
export async function getEquipmentSubTypeSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<FacetResult | null> {
  await requireConfigTabPermission('subtipos', 'view');
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
        const rows = await prisma.sub_type.groupBy({
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

      case 'type': {
        // FK UUID — agrupar por el campo 'type' (que es el ID del type_of_vehicles)
        const rows = await prisma.sub_type.groupBy({
          by: ['type'],
          where: crossWhere,
          _count: true,
        });

        const counts = new Map<string, number>();
        const typeIds: string[] = [];
        for (const r of rows) {
          if (r.type === null) {
            counts.set(NULL_FILTER_VALUE, r._count);
          } else {
            counts.set(r.type, r._count);
            typeIds.push(r.type);
          }
        }

        // Resolver nombres de los tipos
        const typeRecords =
          typeIds.length > 0
            ? await prisma.type.findMany({
                where: { id: { in: typeIds } },
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
              })
            : [];

        const resolvedOptions = typeRecords.map((t) => ({ value: t.id, label: t.name }));

        return { options: resolvedOptions, counts };
      }

      default:
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener faceta de subtipos de equipos', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// CATÁLOGOS — para el formulario (server actions, NO Supabase)
// ============================================================================

/**
 * Obtiene los tipos de unidad activos para el selector del formulario.
 * Reemplaza a FetchTypeOfVehicles (Supabase) sin company_id filter.
 */
export async function getActiveEquipmentTypes() {
  try {
    const companyId = await getActiveCompanyId();
    const data = await prisma.type.findMany({
      where: { is_active: true, ...catalogReadScope(companyId) },
      select: { id: true, name: true, is_tractor_unit: true, has_hitch: true },
      orderBy: { name: 'asc' },
    });
    return data;
  } catch (error) {
    logger.error('Error al obtener tipos de equipos activos', { data: { error } });
    throw new Error('No se pudo obtener los tipos. Intente nuevamente.');
  }
}

/**
 * Obtiene los checklists activos para el multi-select del formulario.
 * Reemplaza a useActiveChecklists (supabaseBrowser).
 */
export async function getActiveChecklistsForSubType() {
  try {
    const companyId = await getActiveCompanyId();
    const data = await prisma.checklist_templates.findMany({
      where: { is_active: true, company_id: companyId },
      select: { id: true, name: true, code: true, description: true },
      orderBy: { name: 'asc' },
    });
    return data;
  } catch (error) {
    logger.error('Error al obtener checklists activos', { data: { error } });
    throw new Error('No se pudo obtener los checklists. Intente nuevamente.');
  }
}

/**
 * Obtiene los checklists asignados a un subtipo específico.
 * Reemplaza a useSubTypeChecklists (supabaseBrowser).
 */
export async function getChecklistIdsForSubType(subTypeId: string): Promise<string[]> {
  try {
    const data = await prisma.checklist_template_sub_types.findMany({
      where: { sub_type_id: subTypeId },
      select: { template_id: true },
    });
    return data.map((item) => item.template_id).filter(Boolean) as string[];
  } catch (error) {
    logger.error('Error al obtener checklists del subtipo', { data: { error, subTypeId } });
    throw new Error('No se pudo obtener los checklists del subtipo.');
  }
}

/**
 * Obtiene los items compatibles para un subtipo específico.
 * Reemplaza a getCompatibleItemsForSubType (Supabase).
 */
export async function getCompatibleItemsForSubTypePrisma(subTypeId: string) {
  try {
    const data = await prisma.sub_type_compatible_items.findMany({
      where: { sub_type_id: subTypeId },
      select: { compatible_item_id: true, item_type: true },
    });
    return data;
  } catch (error) {
    logger.error('Error al obtener items compatibles del subtipo', { data: { error, subTypeId } });
    return [];
  }
}

// ============================================================================
// ITEMS COMPATIBLES DISPONIBLES — según los enganches del tipo padre
// ============================================================================

/**
 * Subtipos y tipos que un subtipo del tipo `parentTypeId` puede declarar como compatibles.
 *
 * Sólo tiene sentido si el tipo padre es unidad tractora con enganche; de ahí salen sus
 * `type_hitch_types`, y de cada tipo enganchable sus subtipos. Los tipos enganchables que no
 * tienen ningún subtipo cargado se ofrecen enteros (si no, quedarían sin forma de elegirse).
 */
export async function getAvailableCompatibleItems(parentTypeId: string) {
  const empty = {
    subTypes: [] as { id: string; name: string; type: string | null }[],
    types: [] as { id: string; name: string }[],
  };
  try {
    const companyId = await getActiveCompanyId();

    // El tipo padre se lee con el scope de catálogo (propio + global).
    const parentType = await prisma.type.findFirst({
      where: { id: parentTypeId, ...catalogReadScope(companyId) },
      select: { id: true, is_tractor_unit: true, has_hitch: true },
    });
    if (!canHaveCompatibleItems(parentType)) return empty;

    const hitchRows = await prisma.type_hitch_types.findMany({
      where: { type_id: parentTypeId, company_id: companyId },
      select: { compatible_type_id: true },
    });
    const compatibleTypeIds = hitchRows.map((row) => row.compatible_type_id);
    if (compatibleTypeIds.length === 0) return empty;

    const subTypes = await prisma.sub_type.findMany({
      where: { type: { in: compatibleTypeIds }, is_active: true, ...catalogReadScope(companyId) },
      select: { id: true, name: true, type: true },
      orderBy: { name: 'asc' },
    });

    const orphanTypeIds = typeIdsWithoutSubTypes(compatibleTypeIds, subTypes);
    const types =
      orphanTypeIds.length > 0
        ? await prisma.type.findMany({
            where: { id: { in: orphanTypeIds }, is_active: true, ...catalogReadScope(companyId) },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : [];

    return { subTypes, types };
  } catch (error) {
    logger.error('Error al obtener items compatibles disponibles', { data: { error, parentTypeId } });
    return empty;
  }
}

// ============================================================================
// MUTACIONES — crear y actualizar subtipos con Prisma
// ============================================================================

export type EquipmentSubTypeInput = {
  name: string;
  is_active: boolean;
  type_id: string;
  /**
   * Items compatibles tal como los emite el multi-select: claves `"<item_type>:<id>"`.
   * El saneo (`parseCompatibleItemKeys`) corre **en el servidor**: el cliente no decide qué
   * `item_type` termina en `sub_type_compatible_items`.
   */
  compatible_item_keys: string[];
  /** Plantillas de checklist asociadas (`checklist_template_sub_types`). */
  checklist_ids: string[];
};

/** El tipo padre elegido tiene que ser legible por la empresa activa (propio o global). */
async function assertParentTypeReadable(companyId: string, typeId: string): Promise<void> {
  const parent = await prisma.type.findFirst({
    where: { id: typeId, ...catalogReadScope(companyId) },
    select: { id: true },
  });
  if (!parent) throw new Error('Tipo de unidad no encontrado');
}

/**
 * Sanea las claves del multi-select y verifica que cada item referenciado sea legible por la
 * empresa activa, junto con el tipo padre y los checklists.
 */
async function validateSubTypeInput(companyId: string, input: EquipmentSubTypeInput) {
  const compatibleItems = parseCompatibleItemKeys(input.compatible_item_keys);
  await Promise.all([
    assertParentTypeReadable(companyId, input.type_id),
    assertChecklistTemplatesOwned(companyId, input.checklist_ids),
    assertCompatibleItemsReadable(companyId, compatibleItems),
  ]);
  return compatibleItems;
}

export async function createEquipmentSubType(input: EquipmentSubTypeInput) {
  await requireConfigTabPermission('subtipos', 'create');
  input = equipmentSubTypeCreateSchema.parse(input);
  try {
    const companyId = await getActiveCompanyId();
    const compatibleItems = await validateSubTypeInput(companyId, input);

    const created = await prisma.$transaction(async (tx) => {
      const subType = await tx.sub_type.create({
        data: {
          name: input.name,
          is_active: input.is_active,
          type: input.type_id,
          ...catalogWriteScope(companyId),
        },
        select: { id: true, name: true, is_active: true, type: true },
      });

      if (compatibleItems.length > 0) {
        await tx.sub_type_compatible_items.createMany({
          data: compatibleItems.map((item) => ({
            sub_type_id: subType.id,
            compatible_item_id: item.id,
            item_type: item.type,
          })),
          skipDuplicates: true,
        });
      }

      if (input.checklist_ids.length > 0) {
        await tx.checklist_template_sub_types.createMany({
          // `checklist_template_sub_types` no tiene company_id: el perímetro lo da
          // `assertChecklistTemplatesOwned` sobre las plantillas.
          data: input.checklist_ids.map((template_id) => ({ sub_type_id: subType.id, template_id })),
          skipDuplicates: true,
        });
      }

      return subType;
    });

    revalidatePath('/dashboard/configuration');
    return created;
  } catch (error) {
    logger.error('Error al crear subtipo de equipo', { data: { error } });
    throw error instanceof Error ? error : new Error('No se pudo crear el subtipo. Intente nuevamente.');
  }
}

export async function updateEquipmentSubType(input: EquipmentSubTypeInput & { id: string }) {
  await requireConfigTabPermission('subtipos', 'update');
  input = equipmentSubTypeUpdateSchema.parse(input);
  try {
    const companyId = await getActiveCompanyId();

    // Perímetro sin RLS: un subtipo global se lee pero no se edita desde una empresa.
    const existing = await prisma.sub_type.findUnique({
      where: { id: input.id },
      select: { id: true, company_id: true },
    });
    const access = resolveCatalogAccess(existing, companyId, 'write');
    const accessError = catalogAccessError(access, 'El subtipo de unidad no existe');
    if (accessError) throw new Error(accessError);

    const compatibleItems = await validateSubTypeInput(companyId, input);

    const updated = await prisma.$transaction(async (tx) => {
      const subType = await tx.sub_type.update({
        where: { id: input.id },
        data: { name: input.name, is_active: input.is_active, type: input.type_id },
        select: { id: true, name: true, is_active: true, type: true },
      });

      // Items compatibles y checklists se reemplazan enteros: el form manda siempre el conjunto.
      await tx.sub_type_compatible_items.deleteMany({ where: { sub_type_id: input.id } });
      if (compatibleItems.length > 0) {
        await tx.sub_type_compatible_items.createMany({
          data: compatibleItems.map((item) => ({
            sub_type_id: input.id,
            compatible_item_id: item.id,
            item_type: item.type,
          })),
          skipDuplicates: true,
        });
      }

      await tx.checklist_template_sub_types.deleteMany({ where: { sub_type_id: input.id } });
      if (input.checklist_ids.length > 0) {
        await tx.checklist_template_sub_types.createMany({
          data: input.checklist_ids.map((template_id) => ({ sub_type_id: input.id, template_id })),
          skipDuplicates: true,
        });
      }

      return subType;
    });

    revalidatePath('/dashboard/configuration');
    return updated;
  } catch (error) {
    logger.error('Error al actualizar subtipo de equipo', { data: { error } });
    throw error instanceof Error ? error : new Error('No se pudo actualizar el subtipo. Intente nuevamente.');
  }
}

// ============================================================================
// TIPOS EXPORTADOS
// ============================================================================

export type EquipmentSubTypeListItem = Awaited<ReturnType<typeof getEquipmentSubTypesPaginated>>['data'][number];
