'use client';

import {
  DataTable,
  type DataTableExportConfig,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { CircleOff } from 'lucide-react';
import moment from 'moment';
import { useCallback, useMemo, useState } from 'react';
import { TRACKING_TYPE_LABELS } from '../../../../lib/labels';
import { WAREHOUSE_QUERY_KEYS } from '../../../../lib/query-keys';
import { MATERIAL_TRACKING_TYPES, type MaterialTrackingTypeValue } from '../../../../schemas/stock-movement';
import {
  getAllMaterialsForExport,
  getMaterialSingleFacet,
  getMaterialsPaginated,
  type MaterialListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, boolIcons, getColumns, trackingIcons } from '../columns';

interface Props {
  data: MaterialListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['category', 'tracking_type', 'is_active'];
const ALL_FILTER_IDS = [
  'category',
  'unit',
  'tracking_type',
  'requires_approval',
  'is_active',
  'code',
  'name',
  'description',
  'min_stock',
  'created_at',
];

const EMPTY_FACET: FacetResult = { options: [], counts: new Map() };

export function _MaterialsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);
  const handleStateChange = useCallback((params: DataTableSearchParams) => setCurrentParams(params), []);
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getMaterialsPaginated(params), []);

  const canUpdate = permissionsMap['almacenes:materiales:update'] === true;
  const canDelete = permissionsMap['almacenes:materiales:delete'] === true;
  const columns = useMemo(() => getColumns({ canUpdate, canDelete }), [canUpdate, canDelete]);

  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((c) => [c, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) return initialFilterVisibility;
    return Object.fromEntries(ALL_FILTER_IDS.map((id) => [id, DEFAULT_VISIBLE_FILTERS.includes(id)]));
  }, [initialFilterVisibility]);

  // ── fetchFacet factories ────────────────────────────────────────────────
  const makeBoolFetchFacet = useCallback(
    (columnId: string, trueLabel: string, falseLabel: string) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getMaterialSingleFacet(columnId, params);
        if (!result) return EMPTY_FACET;
        return {
          options: [
            { value: 'true', label: trueLabel, icon: boolIcons.true },
            { value: 'false', label: falseLabel, icon: boolIcons.false },
          ],
          counts: result.counts,
        };
      },
    []
  );

  const makeFkFetchFacet = useCallback(
    (columnId: string) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getMaterialSingleFacet(columnId, params);
        if (!result) return EMPTY_FACET;
        return {
          options: [
            ...(result.resolvedOptions?.map((o) => ({ value: o.id, label: o.name ?? '' })) ?? []),
            ...(result.counts.has(NULL_FILTER_VALUE)
              ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff }]
              : []),
          ],
          counts: result.counts,
        };
      },
    []
  );

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      { columnId: 'category', title: 'Categoría', fetchFacet: makeFkFetchFacet('category') },
      { columnId: 'unit', title: 'Unidad', fetchFacet: makeFkFetchFacet('unit') },
      {
        columnId: 'tracking_type',
        title: 'Tipo de control',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getMaterialSingleFacet('tracking_type', params);
          if (!result) return EMPTY_FACET;
          return {
            options: MATERIAL_TRACKING_TYPES.map((value) => ({
              value,
              label: TRACKING_TYPE_LABELS[value],
              icon: trackingIcons[value],
            })),
            counts: result.counts,
          };
        },
      },
      {
        columnId: 'requires_approval',
        title: 'Requiere aprobación',
        fetchFacet: makeBoolFetchFacet('requires_approval', 'Sí', 'No'),
      },
      { columnId: 'is_active', title: 'Estado', fetchFacet: makeBoolFetchFacet('is_active', 'Activo', 'Inactivo') },
      { columnId: 'code', title: 'Código', type: 'text' as const, placeholder: 'Buscar por código...' },
      { columnId: 'name', title: 'Nombre', type: 'text' as const, placeholder: 'Buscar por nombre...' },
      {
        columnId: 'description',
        title: 'Descripción',
        type: 'text' as const,
        placeholder: 'Buscar por descripción...',
      },
      // Numerico: el servidor busca el valor exacto (contains no aplica a Decimal)
      { columnId: 'min_stock', title: 'Stock mínimo', type: 'text' as const, placeholder: 'Valor exacto...' },
      { columnId: 'created_at', title: 'Creado', type: 'dateRange' as const },
    ],
    [makeFkFetchFacet, makeBoolFetchFacet]
  );

  const exportConfig: DataTableExportConfig<MaterialListItem> = useMemo(
    () => ({
      fetchAllData: () => getAllMaterialsForExport(currentParams),
      options: { filename: 'materiales', title: 'Listado de Materiales', sheetName: 'Materiales' },
      formatters: {
        description: (value) => (value ? String(value) : ''),
        tracking_type: (value) => TRACKING_TYPE_LABELS[value as MaterialTrackingTypeValue] ?? String(value),
        requires_approval: (value) => (value ? 'Sí' : 'No'),
        min_stock: (value) => (value == null ? '' : String(value)),
        is_active: (value) => (value ? 'Activo' : 'Inactivo'),
        created_at: (value) => (value ? moment(value as string | Date).format('DD/MM/YYYY') : ''),
      },
    }),
    [currentParams]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      searchParams={searchParams}
      tableId={tableId}
      paramNamespace={tableId}
      facetedFilters={facetedFilters}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      showFilterToggle
      queryFn={tableQueryFn}
      queryKey={[...WAREHOUSE_QUERY_KEYS.materials]}
      onStateChange={handleStateChange}
      searchPlaceholder="Buscar por código, nombre o descripción"
      emptyMessage="No hay materiales cargados"
      exportConfig={exportConfig}
      data-testid="warehouse-materials-table"
    />
  );
}
