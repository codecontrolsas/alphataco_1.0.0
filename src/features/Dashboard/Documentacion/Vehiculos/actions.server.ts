'use server';

import {
  equipmentDocumentSpec,
  loadEquipmentDocumentRows,
  type EquipmentDocumentRow,
} from '@/features/Documentacion/DocumentosEquipos/lib/equipment-document-rows.server';
import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { Logger } from '@/lib/logger';
import { parseSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { applyTableState, facetCounts, paginate, type InMemoryTableSpec } from '@/shared/lib/in-memory-table';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { selectExpiringRows } from '../lib/expiring-documents.server';

const logger = new Logger('features/Dashboard/Documentacion/Vehiculos');

// ============================================================================
// CONSTANTS
// ============================================================================

/** Id de la columna "Tipo de Documento" de esta tabla. */
const TYPE_COLUMN_ID = 'document_type';

const BASE_SPEC = equipmentDocumentSpec(TYPE_COLUMN_ID);

/** Facetas de subtipo y propietario de esta tabla: ids de columna propios sobre los del equipo. */
function optionalFacet(id: string | null, name: string | null | undefined) {
  return id === null ? [] : [{ id, name: name ?? null }];
}

/** Misma búsqueda/filtros/facetas que la lista de permanentes; sin orden elegido, el más urgente primero. */
const SPEC: InMemoryTableSpec<EquipmentDocumentRow> = {
  ...BASE_SPEC,
  facets: {
    ...BASE_SPEC.facets,
    sub_type: (row) => optionalFacet(row.vehicles.subType, row.vehicles.sub_type?.name),
    owner: (row) => optionalFacet(row.vehicles.owner_id, row.vehicles.equipment_owners?.name),
  },
  sorters: {
    ...BASE_SPEC.sorters,
    sub_type: (row) => row.vehicles.sub_type?.name,
    owner: (row) => row.vehicles.equipment_owners?.name,
  },
  defaultSort: [(row) => row.validity, ...(BASE_SPEC.defaultSort ?? [])],
};

// ============================================================================
// ROWS
// ============================================================================

/**
 * Documentos de equipos activos que ya vencieron o vencen en los próximos 30 días: las filas del
 * motor de cumplimiento (estado derivado en hora argentina), sin faltantes ni "ya no aplica".
 */
async function loadRows() {
  const [companyId, canViewPrivate] = await Promise.all([
    getActiveCompanyId(),
    checkPermissionServer('documentacion', 'documentos-de-equipos', 'view_private'),
  ]);
  return selectExpiringRows(await loadEquipmentDocumentRows(companyId, false, canViewPrivate, ''));
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getVehicleExpiringDocsPaginated(searchParams: DataTableSearchParams) {
  logger.debug('Obteniendo documentos de vehículos por vencer');

  try {
    const state = parseSearchParams(searchParams);
    const filtered = applyTableState(await loadRows(), state, SPEC);
    return { data: paginate(filtered, state), total: filtered.length };
  } catch (error) {
    logger.error('Error al obtener documentos de vehículos por vencer', { data: { error } });
    throw new Error('No se pudieron obtener los documentos. Intente nuevamente.');
  }
}

// ============================================================================
// EXPORT QUERY (sin paginación)
// ============================================================================

export async function getAllVehicleExpiringDocsForExport(searchParams: DataTableSearchParams) {
  logger.debug('Exportando documentos de vehículos por vencer');

  try {
    const state = parseSearchParams(searchParams);
    return applyTableState(await loadRows(), state, SPEC);
  } catch (error) {
    logger.error('Error al exportar documentos de vehículos por vencer', { data: { error } });
    throw new Error('No se pudo exportar la lista. Intente nuevamente.');
  }
}

// ============================================================================
// FACETS — Single column (lazy-load)
// ============================================================================

/**
 * Obtiene counts (y opciones resueltas para FK) de UNA sola columna.
 * Implementa cross-filter: aplica todos los filtros activos EXCEPTO la columna propia.
 */
export async function getVehicleExpiringDocsSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{
  counts: Map<string, number>;
  resolvedOptions?: Array<{ id: string; name: string | null }>;
} | null> {
  logger.debug('Obteniendo facet de documentos de vehículos por vencer', { data: { columnId } });

  try {
    const result = facetCounts(await loadRows(), parseSearchParams(searchParams ?? {}), SPEC, columnId);
    if (!result) {
      logger.warn('columnId no reconocido en getVehicleExpiringDocsSingleFacet', { data: { columnId } });
      return null;
    }
    return result.options.length > 0
      ? { counts: result.counts, resolvedOptions: result.options }
      : { counts: result.counts };
  } catch (error) {
    logger.error('Error al obtener facet de documentos de vehículos por vencer', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// TIPOS EXPORTADOS
// ============================================================================

export type VehicleExpiringDocListItem = Awaited<ReturnType<typeof getVehicleExpiringDocsPaginated>>['data'][number];
