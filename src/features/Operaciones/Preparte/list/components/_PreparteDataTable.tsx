'use client';

import { Button } from '@/components/ui/button';
import {
  DataTable,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
} from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { useQuery } from '@tanstack/react-query';
import { CircleOff, Edit } from 'lucide-react';
import moment from 'moment';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  getAllPrepartesForExport,
  getPreparteFacets,
  getPrepartesPaginated,
  type PreparteListItem,
} from '../actions.server';
import { PREPARTE_STATUS_UI } from '../../lib/preparte-status-ui';
import {
  HIDDEN_COLUMNS_BY_DEFAULT,
  PREPARTE_STATUS_LABELS,
  formatPreparteDate,
  formatPreparteType,
  getColumns,
  getPreparteReason,
  type PreparteTableCallbacks,
} from '../columns';

interface Props {
  data: PreparteListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
  callbacks: PreparteTableCallbacks;
  clearSelectionTrigger?: number;
  /** Acciones de la sección (informe, alta) que van junto a las de la tabla. */
  extraToolbarActions?: React.ReactNode;
}

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

function withNullOption(
  options: Array<{ value: string; label: string }>,
  counts: Map<string, number> | undefined,
  label: string
) {
  return counts?.has(NULL_FILTER_VALUE)
    ? [...options, { value: NULL_FILTER_VALUE, label, icon: CircleOff }]
    : options;
}

export function _PreparteDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
  callbacks,
  clearSelectionTrigger,
  extraToolbarActions,
}: Props) {
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);
  const [selectedRows, setSelectedRows] = useState<PreparteListItem[]>([]);
  const [localClearSelectionTrigger, setLocalClearSelectionTrigger] = useState(0);
  const previousParamsRef = useRef<string | undefined>(undefined);

  const facetParams = useMemo(() => {
    const { page, pageSize, sort, sortBy, sortOrder, ...filters } = currentParams;
    return filters;
  }, [currentParams]);

  const { data: facets, isFetching: isFetchingFacets } = useQuery({
    queryKey: ['preparte-list-facets', facetParams],
    queryFn: () => getPreparteFacets(facetParams),
    staleTime: 5 * 60 * 1000,
  });

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
        options: withNullOption(
          Object.entries(PREPARTE_STATUS_UI).map(([value, ui]) => ({
            value,
            label: ui.label,
            icon: ui.icon,
          })),
          facets?.status,
          'Sin estado'
        ),
        externalCounts: facets?.status,
      },
      {
        columnId: 'customer',
        title: 'Cliente',
        options: facets?.customerOptions.map((option) => ({ value: option.id, label: option.name ?? 'No encontrado' })) ?? [],
        externalCounts: facets?.customer,
      },
      {
        columnId: 'service',
        title: 'Contrato',
        options: facets?.serviceOptions.map((option) => ({ value: option.id, label: option.name ?? 'No encontrado' })) ?? [],
        externalCounts: facets?.service,
      },
      {
        columnId: 'sector',
        title: 'Sector (cliente)',
        options: withNullOption(
          facets?.sectorOptions
            .filter((option) => option.id !== NULL_FILTER_VALUE)
            .map((option) => ({ value: option.id, label: option.name })) ?? [],
          facets?.sector,
          'Sin sector'
        ),
        externalCounts: facets?.sector,
      },
      {
        columnId: 'area',
        title: 'Área (cliente)',
        options: withNullOption(
          facets?.areaOptions
            .filter((option) => option.id !== NULL_FILTER_VALUE)
            .map((option) => ({ value: option.id, label: option.name })) ?? [],
          facets?.area,
          'Sin área'
        ),
        externalCounts: facets?.area,
      },
      {
        columnId: 'customerEquipment',
        title: 'Equipo cliente',
        options: withNullOption(
          facets?.customerEquipmentOptions
            .filter((option) => option.id !== NULL_FILTER_VALUE)
            .map((option) => ({ value: option.id, label: option.name })) ?? [],
          facets?.customerEquipment,
          'Sin equipo'
        ),
        externalCounts: facets?.customerEquipment,
      },
      {
        columnId: 'serviceItem',
        title: 'Ítem',
        options: withNullOption(
          facets?.serviceItemOptions
            .filter((option) => option.id !== NULL_FILTER_VALUE)
            .map((option) => ({ value: option.id, label: option.name })) ?? [],
          facets?.serviceItem,
          'Sin ítem'
        ),
        externalCounts: facets?.serviceItem,
      },
      { columnId: 'quantity', title: 'Cantidad', type: 'text', placeholder: 'Cantidad exacta...' },
      {
        columnId: 'tipo',
        title: 'Tipo',
        options: withNullOption(
          facets?.tipo
            ? Array.from(facets.tipo.keys())
                .filter((value) => value !== NULL_FILTER_VALUE)
                .map((value) => ({ value, label: formatPreparteType(value) }))
            : [],
          facets?.tipo,
          'Sin tipo'
        ),
        externalCounts: facets?.tipo,
      },
      {
        columnId: 'jornada',
        title: 'Jornada',
        options: withNullOption(
          facets?.jornada
            ? Array.from(facets.jornada.keys())
                .filter((value) => value !== NULL_FILTER_VALUE)
                .map((value) => ({ value, label: value || 'Sin jornada' }))
            : [],
          facets?.jornada,
          'Sin jornada'
        ),
        externalCounts: facets?.jornada,
      },
      { columnId: 'start_time', title: 'Hora de inicio', type: 'text', placeholder: 'Buscar hora...' },
      { columnId: 'end_time', title: 'Hora de fin', type: 'text', placeholder: 'Buscar hora...' },
      { columnId: 'solicitante', title: 'Solicitante', type: 'text', placeholder: 'Buscar solicitante...' },
      { columnId: 'confirmed_by', title: 'Confirmado por', type: 'text', placeholder: 'Buscar confirmante...' },
      {
        columnId: 'rejectedBy',
        title: 'Rechazado por',
        options: withNullOption(
          facets?.rejectedByOptions
            .filter((option) => option.id !== NULL_FILTER_VALUE)
            .map((option) => ({ value: option.id, label: option.name })) ?? [],
          facets?.rejectedBy,
          'Sin asignar'
        ),
        externalCounts: facets?.rejectedBy,
      },
      {
        columnId: 'cancelledBy',
        title: 'Cancelado por',
        options: withNullOption(
          facets?.cancelledByOptions
            .filter((option) => option.id !== NULL_FILTER_VALUE)
            .map((option) => ({ value: option.id, label: option.name })) ?? [],
          facets?.cancelledBy,
          'Sin asignar'
        ),
        externalCounts: facets?.cancelledBy,
      },
      {
        columnId: 'reprogrammedBy',
        title: 'Reprogramado por',
        options: withNullOption(
          facets?.reprogrammedByOptions
            .filter((option) => option.id !== NULL_FILTER_VALUE)
            .map((option) => ({ value: option.id, label: option.name })) ?? [],
          facets?.reprogrammedBy,
          'Sin asignar'
        ),
        externalCounts: facets?.reprogrammedBy,
      },
      { columnId: 'observaciones', title: 'Observaciones', type: 'text', placeholder: 'Buscar observación...' },
    ],
    [facets]
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
      mobileCards
      facetedFilters={facetedFilters}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      tableId={tableId}
      paramNamespace={tableId}
      showFilterToggle
      isFetchingFacets={isFetchingFacets}
      emptyMessage="No hay pedidos registrados"
      data-testid="preparte-table"
      enableRowSelection={
        canUpdate
          ? (row) => row.original.status === 'pendiente' || row.original.status === 'reprogramado'
          : false
      }
      showRowSelection={canUpdate}
      onRowSelectionChange={setSelectedRows}
      clearSelectionTrigger={(clearSelectionTrigger ?? 0) + localClearSelectionTrigger}
      toolbarActions={
        <>
          {canUpdate && (
            <Button
              variant="outline"
              size="sm"
              disabled={selectedRows.length === 0}
              onClick={() => callbacks.onBulkStatus(selectedRows)}
            >
              <Edit className="mr-2 size-4" />
              Cambiar estado
              {selectedRows.length > 0 && (
                <span className="font-mono tabular-nums">({selectedRows.length})</span>
              )}
            </Button>
          )}
          {extraToolbarActions}
        </>
      }
      exportConfig={{
        fetchAllData: () => getAllPrepartesForExport(currentParams),
        options: {
          filename: `gestion-pedidos-${moment().format('YYYY-MM-DD')}`,
          title: 'Gestión de Pedidos',
          sheetName: 'Pedidos',
        },
        formatters: {
          requestDate: (value) => formatPreparteDate(typeof value === 'string' ? value : null),
          executionDate: (value, row) =>
            row.subject_to_availability && !row.executionDate
              ? 'Pendiente de fecha'
              : formatPreparteDate(typeof value === 'string' ? value : null),
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
  );
}
