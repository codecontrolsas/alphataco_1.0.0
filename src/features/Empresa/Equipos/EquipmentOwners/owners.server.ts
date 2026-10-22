'use server';

import { Logger } from '@/lib/logger';
import { NULL_FILTER_VALUE, stateToPrismaParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams, FacetResult } from '@/shared/components/common/DataTable/types';
import { fetchExportRowsInBatches, tooManyRowsMessage } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { equipmentOwnerCreateSchema } from '../../lib/catalog-input-schemas';
import { CATALOG_EXPORT_MAX_ROWS, catalogExportFailure } from '../../lib/catalog-table.server';
import { requireConfigTabPermission } from '../../lib/config-access.server';
import { assertEquipmentOwnerReadable } from '../lib/catalog-guards';
import { catalogAccessError, catalogWriteScope, resolveCatalogAccess } from '../lib/catalog-scope';
import {
  equipmentOwnerUpdateInputSchema,
  reassignAndDeactivateOwnerSchema,
  type EquipmentOwnerUpdateInput,
} from './lib/owner-update-input';
import type { EquipmentOwnerListItem } from './lib/owners-types';
import { OWNER_LIST_SELECT, VALID_SORT_FIELDS, buildWhereClause, parseOwnersState } from './lib/owners-where';

// ============================================================================
// LOGGER
// ============================================================================

const logger = new Logger('features/Empresa/Equipos/EquipmentOwners');

// ============================================================================
// QUERY PAGINADA — Tabla principal (equipment_owners)
// ============================================================================

export async function getEquipmentOwnersPaginated(searchParams: DataTableSearchParams) {
  await requireConfigTabPermission('titulares', 'view');
  try {
    const state = parseOwnersState(searchParams);
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
      prisma.equipment_owners.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: OWNER_LIST_SELECT,
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

export async function getAllEquipmentOwnersForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<EquipmentOwnerListItem[]>> {
  await requireConfigTabPermission('titulares', 'view');
  try {
    const state = parseOwnersState(searchParams);
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
      listIds: (take) => prisma.equipment_owners.findMany({ where, orderBy: safeOrderBy, select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.equipment_owners.findMany({ where: { AND: [where, { id: { in: ids } }] }, select: OWNER_LIST_SELECT }),
      tooLargeMessage: tooManyRowsMessage('titulares'),
    });
    return { ok: true, data: rows };
  } catch (error) {
    logger.error('Error al exportar titulares de equipos', { data: { error } });
    return catalogExportFailure(error, 'la lista de titulares');
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
    const state = parseOwnersState(searchParams);

    // crossWhere: aplica todos los filtros EXCEPTO el de la columna propia
    const crossState = {
      ...state,
      filters: { ...state.filters },
    };
    delete crossState.filters[columnId];

    const crossWhere = buildWhereClause(crossState, await getActiveCompanyId());

    switch (columnId) {
      case 'is_active': {
        const rows = await prisma.equipment_owners.groupBy({
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

      default:
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener faceta de titular de equipo', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// MUTACIONES — Prisma
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
      select: OWNER_LIST_SELECT,
    });
    return result;
  } catch (error) {
    logger.error('Error al crear titular de equipo', { data: { error } });
    throw new Error('No se pudo crear el titular. Intente nuevamente.');
  }
}

type OwnerTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Perímetro sin RLS: un titular global se lee pero no se edita desde una empresa. */
async function assertOwnerWritable(companyId: string, ownerId: string): Promise<void> {
  const existing = await prisma.equipment_owners.findUnique({ where: { id: ownerId }, select: { company_id: true } });
  const accessError = catalogAccessError(resolveCatalogAccess(existing, companyId, 'write'), 'El titular no existe');
  if (accessError) throw new Error(accessError);
}

/**
 * Aplica la edición del titular dentro de una transacción. Los tipos de contrato se modifican con
 * altas/bajas explícitas; el resultado nunca puede quedar vacío y el campo legacy `contract_type`
 * toma el primero del conjunto resultante.
 */
async function applyOwnerUpdate(tx: OwnerTx, data: EquipmentOwnerUpdateInput) {
  const current = await tx.equipment_owner_contract_types.findMany({
    where: { equipment_owner_id: data.id },
    select: { contract_type: true },
  });
  const toRemove = new Set(data.contract_types.remove);
  const toAdd = Array.from(new Set(data.contract_types.add));
  const resulting = Array.from(
    new Set([...current.map((row) => row.contract_type).filter((type) => !toRemove.has(type)), ...toAdd])
  );
  if (resulting.length === 0) throw new Error('Debe seleccionar al menos un tipo de contrato');

  if (toRemove.size > 0) {
    await tx.equipment_owner_contract_types.deleteMany({
      where: { equipment_owner_id: data.id, contract_type: { in: Array.from(toRemove) } },
    });
  }
  if (toAdd.length > 0) {
    await tx.equipment_owner_contract_types.createMany({
      data: toAdd.map((contract_type) => ({ equipment_owner_id: data.id, contract_type })),
      skipDuplicates: true,
    });
  }

  return tx.equipment_owners.update({
    where: { id: data.id },
    data: {
      name: data.name,
      is_active: data.is_active,
      cuit: data.cuit,
      contract_type: resulting[0],
    },
    select: OWNER_LIST_SELECT,
  });
}

export async function updateEquipmentOwnerPrisma(input: EquipmentOwnerUpdateInput) {
  await requireConfigTabPermission('titulares', 'update');
  const data = equipmentOwnerUpdateInputSchema.parse(input);
  try {
    await assertOwnerWritable(await getActiveCompanyId(), data.id);
    return await prisma.$transaction((tx) => applyOwnerUpdate(tx, data));
  } catch (error) {
    logger.error('Error al actualizar titular de equipo', { data: { error, id: data.id } });
    throw error instanceof Error ? error : new Error('No se pudo actualizar el titular. Intente nuevamente.');
  }
}

/**
 * "Reemplazar y desactivar": valida el acceso de escritura al titular y la legibilidad del
 * reemplazo ANTES de tocar nada, y reasigna los equipos + actualiza el titular en UNA transacción
 * (si el update falla, los equipos no quedan movidos).
 */
export async function reassignAndDeactivateEquipmentOwner(
  fromOwnerId: string,
  toOwnerId: string | null,
  input: EquipmentOwnerUpdateInput
) {
  await requireConfigTabPermission('titulares', 'update');
  const parsed = reassignAndDeactivateOwnerSchema.parse({ fromOwnerId, toOwnerId, data: input });
  if (parsed.data.id !== parsed.fromOwnerId) throw new Error('El titular a actualizar no coincide con el reasignado');
  if (parsed.toOwnerId === parsed.fromOwnerId) throw new Error('El titular de reemplazo debe ser distinto');
  try {
    const companyId = await getActiveCompanyId();
    await assertOwnerWritable(companyId, parsed.fromOwnerId);
    if (parsed.toOwnerId) await assertEquipmentOwnerReadable(companyId, parsed.toOwnerId);

    const result = await prisma.$transaction(async (tx) => {
      const moved = await tx.vehicles.updateMany({
        where: { owner_id: parsed.fromOwnerId, company_id: companyId },
        data: { owner_id: parsed.toOwnerId },
      });
      const owner = await applyOwnerUpdate(tx, parsed.data);
      return { reassigned: moved.count, owner };
    });
    logger.info('Titular desactivado con reasignación de equipos', {
      data: { fromOwnerId: parsed.fromOwnerId, toOwnerId: parsed.toOwnerId, count: result.reassigned },
    });
    return result;
  } catch (error) {
    logger.error('Error al reasignar equipos y actualizar titular', { data: { error, fromOwnerId, toOwnerId } });
    throw error instanceof Error ? error : new Error('No se pudo reasignar los equipos. Intente nuevamente.');
  }
}
