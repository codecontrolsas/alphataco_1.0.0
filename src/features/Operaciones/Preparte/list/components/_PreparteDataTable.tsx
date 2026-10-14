'use client';

import { Button } from '@/components/ui/button';
import {
  DataTable,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { TooltipProvider } from '@/components/ui/tooltip';
import { formatCalendarDate } from '@/shared/utils/calendar-date';
import {
  Ban,
  CheckCircle2,
  CircleOff,
  Clock,
  Edit,
  RefreshCw,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import moment from 'moment';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  getAllPrepartesForExport,
  getPreparteSingleFacet,
  getPrepartesPaginated,
  type PreparteListItem,
} from '../actions.server';
import {
  HIDDEN_COLUMNS_BY_DEFAULT,
  PREPARTE_STATUS_LABELS,
  formatPreparteType,
  getColumns,
  getPreparteReason,
  type PreparteTableCallbacks,
} from '../columns';
import { PREPARTE_TABLE_ID } from '../../constants';
import { unwrapExportResult } from '@/shared/lib/export-result';

interface Props {
  data: PreparteListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  /** Clave de las preferencias guardadas. */
  prefsId: string;
  /** Namespace de los params de la URL. */
  namespace: string;
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
  callbacks: PreparteTableCallbacks;
  clearSelectionTrigger?: number;
}

const STATUS_ICONS: Record<string, LucideIcon> = {
  pendiente: Clock,
  confirmado: CheckCircle2,
  reprogramado: RefreshCw,
  cancelado: Ban,
  rechazado: XCircle,
  vencido: XCircle,
};

const ALL_FILTER_IDS = [
  'requestDate',
  'executionDate',
  'numero_pedido',
  'status',
  'customer',
  'service',
  'sector',
  'area',
  'customerEquipment',
  'serviceItem',
  'quantity',
  'tipo',
  'jornada',
  'start_time',
  'end_time',
  'solicitante',
  'confirmed_by',
  'rejectedBy',
  'cancelledBy',
  'reprogrammedBy',
  'observaciones',
];

const DEFAULT_VISIBLE_FILTERS = new Set(['requestDate', 'status', 'customer']);

export function _PreparteDataTable({
  data,
  totalRows,
  searchParams,
  prefsId,
  namespace,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
  callbacks,
  clearSelectionTrigger,
}: Props) {
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);
  const [selectedRows, setSelectedRows] = useState<PreparteListItem[]>([]);
  const [localClearSelectionTrigger, setLocalClearSelectionTrigger] = useState(0);
  const previousParamsRef = useRef<string | undefined>(undefined);

  // Facets lazy: cada filtro pide sus opciones y conteos al abrirse (con los filtros actuales de la tabla).
  const makeEnumFetchFacet = useCallback(
    (columnId: string, labels: Record<string, string>, icons: Record<string, LucideIcon>, nullLabel: string) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getPreparteSingleFacet(columnId, params);
        if (!result) return { options: [], counts: new Map() };
        const options = [
          ...Object.entries(labels).map(([value, label]) => ({ value, label, icon: icons[value] })),
          ...(result.counts.has(NULL_FILTER_VALUE)
            ? [{ value: NULL_FILTER_VALUE, label: nullLabel, icon: CircleOff }]
            : []),
        ];
        return { options, counts: result.counts };
      },
    []
  );

  const makeFkFetchFacet = useCallback(
    (columnId: string, nullLabel = 'Sin asignar') =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getPreparteSingleFacet(columnId, params);
        if (!result) return { options: [], counts: new Map() };
        const options = [
          ...(result.resolvedOptions ?? []),
          ...(result.counts.has(NULL_FILTER_VALUE)
            ? [{ value: NULL_FILTER_VALUE, label: nullLabel, icon: CircleOff }]
            : []),
        ];
        return { options, counts: result.counts };
      },
    []
  );

  /** Columnas de texto libre (tipo, jornada): las opciones salen de los valores presentes. */
  const makeValuesFetchFacet = useCallback(
    (columnId: string, formatLabel: (value: string) => string, nullLabel: string) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getPreparteSingleFacet(columnId, params);
        if (!result) return { options: [], counts: new Map() };
        const options = [
          ...Array.from(result.counts.keys())
            .filter((value) => value !== NULL_FILTER_VALUE)
            .map((value) => ({ value, label: formatLabel(value) })),
          ...(result.counts.has(NULL_FILTER_VALUE)
            ? [{ value: NULL_FILTER_VALUE, label: nullLabel, icon: CircleOff }]
            : []),
        ];
        return { options, counts: result.counts };
      },
    []
  );

  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((column) => [column, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  const mergedFilterVisibility = useMemo(() => {
    if (Object.keys(initialFilterVisibility).length > 0) return initialFilterVisibility;
    return Object.fromEntries(ALL_FILTER_IDS.map((id) => [id, DEFAULT_VISIBLE_FILTERS.has(id)]));
  }, [initialFilterVisibility]);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      { columnId: 'requestDate', title: 'Fecha de solicitud', type: 'dateRange' },
      { columnId: 'executionDate', title: 'Fecha de ejecución', type: 'dateRange' },
      { columnId: 'numero_pedido', title: 'N° pedido', type: 'text', placeholder: 'Buscar pedido...' },
      {
        columnId: 'status',
        title: 'Estado',
        fetchFacet: makeEnumFetchFacet('status', PREPARTE_STATUS_LABELS, STATUS_ICONS, 'Sin estado'),
      },
      { columnId: 'customer', title: 'Cliente', fetchFacet: makeFkFetchFacet('customer') },
      { columnId: 'service', title: 'Contrato', fetchFacet: makeFkFetchFacet('service') },
      { columnId: 'sector', title: 'Sector (cliente)', fetchFacet: makeFkFetchFacet('sector', 'Sin sector') },
      { columnId: 'area', title: 'Área (cliente)', fetchFacet: makeFkFetchFacet('area', 'Sin área') },
      {
        columnId: 'customerEquipment',
        title: 'Equipo cliente',
        fetchFacet: makeFkFetchFacet('customerEquipment', 'Sin equipo'),
      },
      { columnId: 'serviceItem', title: 'Ítem', fetchFacet: makeFkFetchFacet('serviceItem', 'Sin ítem') },
      { columnId: 'quantity', title: 'Cantidad', type: 'text', placeholder: 'Cantidad exacta...' },
      {
        columnId: 'tipo',
        title: 'Tipo',
        fetchFacet: makeValuesFetchFacet('tipo', formatPreparteType, 'Sin tipo'),
      },
      {
        columnId: 'jornada',
        title: 'Jornada',
        fetchFacet: makeValuesFetchFacet('jornada', (value) => value || 'Sin jornada', 'Sin jornada'),
      },
      { columnId: 'start_time', title: 'Hora de inicio', type: 'text', placeholder: 'Buscar hora...' },
      { columnId: 'end_time', title: 'Hora de fin', type: 'text', placeholder: 'Buscar hora...' },
      { columnId: 'solicitante', title: 'Solicitante', type: 'text', placeholder: 'Buscar solicitante...' },
      { columnId: 'confirmed_by', title: 'Confirmado por', type: 'text', placeholder: 'Buscar confirmante...' },
      { columnId: 'rejectedBy', title: 'Rechazado por', fetchFacet: makeFkFetchFacet('rejectedBy') },
      { columnId: 'cancelledBy', title: 'Cancelado por', fetchFacet: makeFkFetchFacet('cancelledBy') },
      { columnId: 'reprogrammedBy', title: 'Reprogramado por', fetchFacet: makeFkFetchFacet('reprogrammedBy') },
      { columnId: 'observaciones', title: 'Observaciones', type: 'text', placeholder: 'Buscar observación...' },
    ],
    [makeEnumFetchFacet, makeFkFetchFacet, makeValuesFetchFacet]
  );

  const columns = useMemo(() => getColumns({ permissionsMap, callbacks }), [permissionsMap, callbacks]);

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getPrepartesPaginated(params), []);
  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    const serializedParams = JSON.stringify(params);
    if (previousParamsRef.current && previousParamsRef.current !== serializedParams) {
      setSelectedRows([]);
      setLocalClearSelectionTrigger((value) => value + 1);
    }
    previousParamsRef.current = serializedParams;
    setCurrentParams(params);
  }, []);
  const canUpdate = permissionsMap['operaciones:preparte:update'] === true;

  return (
    // Un solo proveedor de tooltips para todas las celdas (antes cada celda montaba el suyo)
    <TooltipProvider>
      <DataTable
        columns={columns}
        data={data}
        totalRows={totalRows}
        searchParams={searchParams}
        queryFn={tableQueryFn}
        queryKey={['preparte-list']}
        onStateChange={handleStateChange}
        searchPlaceholder="Buscar por pedido, solicitante, observación o motivo..."
        showSearch
        facetedFilters={facetedFilters}
        initialColumnVisibility={mergedColumnVisibility}
        initialFilterVisibility={mergedFilterVisibility}
        tableId={prefsId}
        paramNamespace={namespace}
        mobileCards
        showFilterToggle
        emptyMessage="No hay pedidos registrados"
        data-testid={PREPARTE_TABLE_ID}
        enableRowSelection={
          canUpdate
            ? (row) => row.original.status === 'pendiente' || row.original.status === 'reprogramado'
            : false
        }
        showRowSelection={canUpdate}
        onRowSelectionChange={setSelectedRows}
        clearSelectionTrigger={(clearSelectionTrigger ?? 0) + localClearSelectionTrigger}
        toolbarActions={
          canUpdate ? (
            <Button
              variant="outline"
              size="sm"
              disabled={selectedRows.length === 0}
              onClick={() => callbacks.onBulkStatus(selectedRows)}
            >
              <Edit className="mr-2 h-4 w-4" />
              Cambiar estado
            </Button>
          ) : undefined
        }
        exportConfig={{
          fetchAllData: async () => unwrapExportResult(await getAllPrepartesForExport(currentParams)),
          options: {
            filename: `gestion-pedidos-${moment().format('YYYY-MM-DD')}`,
            title: 'Gestión de Pedidos',
            sheetName: 'Pedidos',
          },
          formatters: {
            requestDate: (value) => formatCalendarDate(typeof value === 'string' ? value : null),
            executionDate: (value, row) =>
              row.subject_to_availability && !row.executionDate
                ? 'Pendiente de fecha'
                : formatCalendarDate(typeof value === 'string' ? value : null),
            status: (value) => PREPARTE_STATUS_LABELS[String(value)] ?? 'Sin estado',
            customer: (value) => String(value || '-'),
            service: (value) => String(value || '-'),
            sector: (value) => String(value || '-'),
            area: (value) => String(value || '-'),
            customerEquipment: (value) => String(value || '-'),
            serviceItem: (value) => String(value || '-'),
            tipo: (value) => formatPreparteType(typeof value === 'string' ? value : null),
            reason: (_value, row) => getPreparteReason(row),
            preparteImage: (value) => (value ? String(value) : '-'),
          },
        }}
      />
    </TooltipProvider>
  );
}
