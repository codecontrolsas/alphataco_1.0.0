'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  DataTable,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { ClipboardList } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import {
  getEquipmentChecklistsForExport,
  getEquipmentChecklistsPaginated,
  getEquipmentChecklistsSingleFacet,
} from '../../actions/checklist-queries';
import { buildResolvedFacet, buildStaticFacet } from '../facet-helpers';
import { TableLoadError, useTrackedTableQuery } from '../table-load-state';
import { useTableViewDefaults } from '../use-table-view-defaults';
import {
  CHECKLIST_RESULT_LABELS,
  CHECKLIST_RESULT_OPTIONS,
  CRITICAL_ITEMS_OPTIONS,
  getChecklistColumns,
} from './columns';

const TABLE_ID = 'equipment-checklists';

/** Prefijo de la `queryKey` de la tabla: no cambiar (invalidaciones por prefijo desde otras pantallas). */
const QUERY_KEY_BASE = ['equipment-checklist-answers'] as const;

/** Tamaños de página: el servidor corta en 50, así que no se ofrece más. */
const PAGE_SIZE_OPTIONS = [10, 20, 30, 50];

const FILTER_IDS = ['result', 'template', 'performedBy', 'criticalItems', 'created_at', 'tractorUnit', 'observations'];
const DEFAULT_VISIBLE_FILTERS = ['result', 'template', 'created_at'];

interface EquipmentChecklistsDataTableProps {
  equipmentId: string;
}

/**
 * Historial de respuestas de checklist del equipo: paginado en el servidor (50 filas como máximo por página),
 * con filtros por resultado, checklist, usuario, ítems críticos, fecha, unidad tractora y observaciones.
 */
export function EquipmentChecklistsDataTable({ equipmentId }: EquipmentChecklistsDataTableProps) {
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>({});

  const columns = useMemo(() => getChecklistColumns(), []);

  // ── Datos paginados en el servidor ───────────────────────────────────────

  const fetchPage = useCallback(
    (params: DataTableSearchParams) => getEquipmentChecklistsPaginated(equipmentId, params),
    [equipmentId]
  );
  const { tableQueryFn, loadFailed, settled } = useTrackedTableQuery(fetchPage);
  const queryKey = useMemo(() => [...QUERY_KEY_BASE, equipmentId], [equipmentId]);

  // ── Facetas lazy-load ────────────────────────────────────────────────────

  const resultFacet = useCallback(
    async (params: DataTableSearchParams): Promise<FacetResult> =>
      buildStaticFacet(
        await getEquipmentChecklistsSingleFacet(equipmentId, 'result', params),
        'result',
        params,
        CHECKLIST_RESULT_OPTIONS,
        'Sin resultado'
      ),
    [equipmentId]
  );

  const criticalItemsFacet = useCallback(
    async (params: DataTableSearchParams): Promise<FacetResult> =>
      buildStaticFacet(
        await getEquipmentChecklistsSingleFacet(equipmentId, 'criticalItems', params),
        'criticalItems',
        params,
        CRITICAL_ITEMS_OPTIONS
      ),
    [equipmentId]
  );

  const templateFacet = useCallback(
    async (params: DataTableSearchParams): Promise<FacetResult> =>
      buildResolvedFacet(await getEquipmentChecklistsSingleFacet(equipmentId, 'template', params)),
    [equipmentId]
  );

  const performedByFacet = useCallback(
    async (params: DataTableSearchParams): Promise<FacetResult> =>
      buildResolvedFacet(
        await getEquipmentChecklistsSingleFacet(equipmentId, 'performedBy', params),
        'Usuario desconocido'
      ),
    [equipmentId]
  );

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      { columnId: 'result', title: 'Resultado', fetchFacet: resultFacet },
      { columnId: 'template', title: 'Checklist', fetchFacet: templateFacet },
      { columnId: 'performedBy', title: 'Realizado por', fetchFacet: performedByFacet },
      { columnId: 'criticalItems', title: 'Items Críticos Fallidos', fetchFacet: criticalItemsFacet },
      { columnId: 'created_at', title: 'Fecha', type: 'dateRange' },
      { columnId: 'tractorUnit', title: 'Unidad Tractor', type: 'text', placeholder: 'Dominio, serie o interno...' },
      { columnId: 'observations', title: 'Observaciones', type: 'text', placeholder: 'Buscar en las observaciones...' },
    ],
    [resultFacet, templateFacet, performedByFacet, criticalItemsFacet]
  );

  // ── Export a Excel ───────────────────────────────────────────────────────

  const exportConfig = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getEquipmentChecklistsForExport(equipmentId, currentParams)),
      options: {
        filename: 'checklists-equipo',
        sheetName: 'Checklists',
        title: 'Historial de Checklists del Equipo',
      },
      formatters: {
        created_at: (value: unknown) => (value ? formatArgentinaDateTime(value as Date) : ''),
        result: (value: unknown) =>
          typeof value === 'string' ? CHECKLIST_RESULT_LABELS[value] ?? 'Sin resultado' : 'Sin resultado',
      },
    }),
    [equipmentId, currentParams]
  );

  const viewDefaults = useTableViewDefaults(TABLE_ID, {
    hiddenColumns: [],
    visibleFilters: DEFAULT_VISIBLE_FILTERS,
    filterIds: FILTER_IDS,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5" />
          Historial de Checklists
        </CardTitle>
        <CardDescription>Listado de todas las respuestas de checklist realizadas para este equipo</CardDescription>
      </CardHeader>
      <CardContent>
        {!viewDefaults.ready ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <TooltipProvider delayDuration={100}>
            {loadFailed && <TableLoadError queryKey={queryKey} label="los checklists" />}

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
              searchPlaceholder="Buscar por checklist, usuario u observaciones..."
              showSearch
              showFilterToggle
              emptyMessage={settled ? 'No hay respuestas de checklist para este equipo.' : 'Cargando checklists...'}
              data-testid="equipment-checklists-table"
            />
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
}
