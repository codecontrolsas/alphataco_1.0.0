'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { type DataTableFacetedFilterConfig, type DataTableSearchParams, type FacetResult } from '@/shared/components/common/DataTable/types';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { useCallback, useMemo, useState } from 'react';
import {
  getEquipmentRejectedRequestsForExport,
  getEquipmentRejectedRequestsPaginated,
  getEquipmentRejectedRequestsSingleFacet,
} from '../../lib/actions/vehicle-rejected-requests-actions';
import { buildResolvedFacet, buildStaticFacet } from '../facet-helpers';
import { TableLoadError, useTrackedTableQuery } from '../table-load-state';
import { useTableViewDefaults } from '../use-table-view-defaults';
import {
  HIDDEN_COLUMNS_BY_DEFAULT,
  REJECTION_TYPE_LABELS,
  REJECTION_TYPE_OPTIONS,
  SOURCE_LABELS,
  SOURCE_OPTIONS,
  getRejectedRequestsColumns,
} from './columns';

const TABLE_ID = 'equipment-rejected-requests';

/** Prefijo de la `queryKey` de la tabla: no cambiar (invalidaciones por prefijo desde otras pantallas). */
const QUERY_KEY_BASE = ['equipment-rejected-requests'] as const;

/** Tamaños de página: el servidor corta en 50, así que no se ofrece más. */
const PAGE_SIZE_OPTIONS = [10, 20, 30, 50];

const FILTER_IDS = [
  'rejectionType',
  'source',
  'rejectedBy',
  'rejectedAt',
  'items',
  'rejectionReason',
  'description',
  'supervisor',
  'preventiveType',
];
const DEFAULT_VISIBLE_FILTERS = ['rejectionType', 'source', 'rejectedBy'];

interface VehicleRejectedRequestsTableProps {
  equipmentId: string;
}

/**
 * Sub-tab "Solicitudes Rechazadas" del historial de mantenimiento del equipo.
 *
 * Muestra las solicitudes de mantenimiento rechazadas (totales o parciales) para este equipo. Es el único
 * lugar del sistema donde quedan registradas, ya que se quitaron del paso "Validar Solicitud" de Operaciones.
 * Paginada en el servidor (50 filas como máximo por página), con filtros y facetas lazy-load.
 */
export function VehicleRejectedRequestsTable({ equipmentId }: VehicleRejectedRequestsTableProps) {
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>({});

  const columns = useMemo(() => getRejectedRequestsColumns(), []);

  // ── Datos paginados en el servidor ───────────────────────────────────────

  const fetchPage = useCallback(
    (params: DataTableSearchParams) => getEquipmentRejectedRequestsPaginated(equipmentId, params),
    [equipmentId]
  );
  const { tableQueryFn, loadFailed, settled } = useTrackedTableQuery(fetchPage);
  const queryKey = useMemo(() => [...QUERY_KEY_BASE, equipmentId], [equipmentId]);

  // ── Facetas lazy-load ────────────────────────────────────────────────────

  const rejectionTypeFacet = useCallback(
    async (params: DataTableSearchParams): Promise<FacetResult> =>
      buildStaticFacet(
        await getEquipmentRejectedRequestsSingleFacet(equipmentId, 'rejectionType', params),
        'rejectionType',
        params,
        REJECTION_TYPE_OPTIONS
      ),
    [equipmentId]
  );

  const sourceFacet = useCallback(
    async (params: DataTableSearchParams): Promise<FacetResult> =>
      buildStaticFacet(
        await getEquipmentRejectedRequestsSingleFacet(equipmentId, 'source', params),
        'source',
        params,
        SOURCE_OPTIONS
      ),
    [equipmentId]
  );

  const rejectedByFacet = useCallback(
    async (params: DataTableSearchParams): Promise<FacetResult> =>
      buildResolvedFacet(await getEquipmentRejectedRequestsSingleFacet(equipmentId, 'rejectedBy', params)),
    [equipmentId]
  );

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      { columnId: 'rejectionType', title: 'Tipo de Rechazo', fetchFacet: rejectionTypeFacet },
      { columnId: 'source', title: 'Origen', fetchFacet: sourceFacet },
      { columnId: 'rejectedBy', title: 'Rechazado por', fetchFacet: rejectedByFacet },
      { columnId: 'rejectedAt', title: 'Fecha de Rechazo', type: 'dateRange' },
      { columnId: 'items', title: 'Ítems Rechazados', type: 'text', placeholder: 'Buscar en los ítems...' },
      { columnId: 'rejectionReason', title: 'Motivo', type: 'text', placeholder: 'Buscar en el motivo...' },
      { columnId: 'description', title: 'Descripción', type: 'text', placeholder: 'Buscar en la descripción...' },
      { columnId: 'supervisor', title: 'Supervisor', type: 'text', placeholder: 'Buscar por supervisor...' },
      {
        columnId: 'preventiveType',
        title: 'Tipo Preventivo',
        type: 'text',
        placeholder: 'Buscar por tipo preventivo...',
      },
    ],
    [rejectionTypeFacet, sourceFacet, rejectedByFacet]
  );

  // ── Export a Excel ───────────────────────────────────────────────────────

  const exportConfig = useMemo(
    () => ({
      fetchAllData: async () =>
        unwrapExportResult(await getEquipmentRejectedRequestsForExport(equipmentId, currentParams)),
      options: {
        filename: 'solicitudes-rechazadas',
        sheetName: 'Solicitudes Rechazadas',
        title: 'Solicitudes de Mantenimiento Rechazadas',
      },
      formatters: {
        rejectedAt: (value: unknown) => (value ? formatArgentinaDay(value as Date) : ''),
        rejectionType: (value: unknown) =>
          value === 'total' || value === 'partial' ? REJECTION_TYPE_LABELS[value] : String(value ?? ''),
        source: (value: unknown) => (typeof value === 'string' && value ? SOURCE_LABELS[value] ?? value : ''),
      },
    }),
    [equipmentId, currentParams]
  );

  const viewDefaults = useTableViewDefaults(TABLE_ID, {
    hiddenColumns: HIDDEN_COLUMNS_BY_DEFAULT,
    visibleFilters: DEFAULT_VISIBLE_FILTERS,
    filterIds: FILTER_IDS,
  });

  if (!viewDefaults.ready) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-6">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider delayDuration={100}>
      <Card>
        <CardContent className="pt-6">
          {loadFailed && <TableLoadError queryKey={queryKey} label="las solicitudes rechazadas" />}

          <DataTable
            columns={columns}
            data={[]}
            totalRows={0}
            queryFn={tableQueryFn}
            queryKey={queryKey}
            queryStaleTimeMs={10 * 1000}
            onStateChange={setCurrentParams}
            facetedFilters={facetedFilters}
            exportConfig={exportConfig}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            initialColumnVisibility={viewDefaults.initialColumnVisibility}
            initialFilterVisibility={viewDefaults.initialFilterVisibility}
            tableId={TABLE_ID}
            paramNamespace={TABLE_ID}
            searchPlaceholder="Buscar por motivo, ítems u origen..."
            showSearch
            showFilterToggle
            emptyMessage={
              settled ? 'No hay solicitudes rechazadas para este equipo.' : 'Cargando solicitudes rechazadas...'
            }
            data-testid="equipment-rejected-requests-table"
          />
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
