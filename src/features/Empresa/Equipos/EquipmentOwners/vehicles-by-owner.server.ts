'use server';

import { Logger } from '@/lib/logger';
import type { DataTableSearchParams, FacetResult } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE, stateToPrismaParams } from '@/shared/components/common/DataTable/helpers';
import { fetchExportRowsInBatches } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { CATALOG_EXPORT_MAX_ROWS, catalogExportFailure, catalogTooLargeMessage } from '../../lib/catalog-table.server';
import { requireConfigTabPermission } from '../../lib/config-access.server';
import type { VehicleByOwnerListItem } from './lib/owners-types';
import {
  FK_SORT_MAP,
  VEHICLE_LIST_SELECT,
  VEHICLE_VALID_SORT_FIELDS,
  buildVehicleWhereClause,
  parseVehiclesState,
} from './lib/owners-where';

// ============================================================================
// LOGGER
// ============================================================================

const logger = new Logger('features/Empresa/Equipos/EquipmentOwners');

// ============================================================================
// QUERY PAGINADA — Tabla secundaria (vehicles por owner_id)
// ============================================================================

export async function getVehiclesByOwnerPaginated(ownerId: string, searchParams: DataTableSearchParams) {
  await requireConfigTabPermission('titulares', 'view');
  try {
    const state = parseVehiclesState(searchParams);
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
        select: VEHICLE_LIST_SELECT,
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

export async function getAllVehiclesByOwnerForExport(
  ownerId: string,
  searchParams: DataTableSearchParams
): Promise<ExportResult<VehicleByOwnerListItem[]>> {
  await requireConfigTabPermission('titulares', 'view');
  try {
    const state = parseVehiclesState(searchParams);
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
    const safeOrderBy = [...resolvedSorts, { domain: 'asc' as const }, { id: 'asc' as const }];

    const rows = await fetchExportRowsInBatches({
      maxRows: CATALOG_EXPORT_MAX_ROWS,
      listIds: (take) => prisma.vehicles.findMany({ where, orderBy: safeOrderBy, select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.vehicles.findMany({ where: { AND: [where, { id: { in: ids } }] }, select: VEHICLE_LIST_SELECT }),
      tooLargeMessage: catalogTooLargeMessage('equipos'),
    });
    return { ok: true, data: rows };
  } catch (error) {
    logger.error('Error al exportar equipos por titular', { data: { error, ownerId } });
    return catalogExportFailure(error, 'la lista de equipos');
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
    const state = parseVehiclesState(searchParams);

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
