'use client';

import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { createFacetFilters } from '@/shared/components/common/DataTable/facet-filters';
import {
  type DataTableExportConfig,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
} from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { useCallback, useMemo } from 'react';
import { TRACKING_TYPE_LABELS } from '../../../../lib/labels';
import { WAREHOUSE_QUERY_KEYS } from '../../../../lib/query-keys';
import { STOCK_LEVEL_UI } from '../../../../lib/status-presentation';
import { MATERIAL_TRACKING_TYPES, type MaterialTrackingTypeValue } from '../../../../schemas/stock-movement';
import {
  getAllMaterialsForExport,
  getMaterialSingleFacet,
  getMaterialsPaginated,
  type MaterialListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, boolIcons, getColumns, stockLevelByBelowMin, trackingIcons } from '../columns';

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

const facets = createFacetFilters(getMaterialSingleFacet);

const boolOptions = (trueLabel: string, falseLabel: string) => [
  { value: 'true', label: trueLabel, icon: boolIcons.true },
  { value: 'false', label: falseLabel, icon: boolIcons.false },
];

export function _MaterialsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getMaterialsPaginated(params), []);

  const canUpdate = permissionsMap['almacenes:materiales:update'] === true;
  const canDelete = permissionsMap['almacenes:materiales:delete'] === true;
  const columns = useMemo(() => getColumns({ canUpdate, canDelete }), [canUpdate, canDelete]);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      facets.lookup('category', 'Categoría', undefined, { label: 'Sin asignar' }),
      facets.lookup('unit', 'Unidad', undefined, { label: 'Sin asignar' }),
      facets.fixed(
        'tracking_type',
        'Tipo de control',
        MATERIAL_TRACKING_TYPES.map((value) => ({
          value,
          label: TRACKING_TYPE_LABELS[value],
          icon: trackingIcons[value],
        }))
      ),
      facets.fixed('requires_approval', 'Requiere aprobación', boolOptions('Sí', 'No')),
      facets.fixed('below_min', 'Nivel de stock', [
        // Mismos textos e íconos que el badge de la celda (agotados incluidos en "Bajo mínimo")
        { value: 'true', label: stockLevelByBelowMin.true.label, icon: stockLevelByBelowMin.true.icon },
        { value: 'false', label: stockLevelByBelowMin.false.label, icon: stockLevelByBelowMin.false.icon },
      ]),
      facets.fixed('is_active', 'Estado', boolOptions('Activo', 'Inactivo')),
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
    []
  );

  const { currentParams, tableProps } = useServerTableView({
    searchParams,
    tableId,
    hiddenColumnsByDefault: HIDDEN_COLUMNS_BY_DEFAULT,
    defaultVisibleFilters: DEFAULT_VISIBLE_FILTERS,
    facetedFilters,
    initialColumnVisibility,
    savedFilterVisibility: initialFilterVisibility,
  });

  const exportConfig: DataTableExportConfig<MaterialListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllMaterialsForExport(currentParams)),
      options: { filename: 'materiales', title: 'Listado de Materiales', sheetName: 'Materiales' },
      formatters: {
        description: (value) => (value ? String(value) : ''),
        tracking_type: (value) => TRACKING_TYPE_LABELS[value as MaterialTrackingTypeValue] ?? String(value),
        requires_approval: (value) => (value ? 'Sí' : 'No'),
        min_stock: (value) => (value == null ? '' : String(value)),
        below_min: (value) => STOCK_LEVEL_UI[value as keyof typeof STOCK_LEVEL_UI]?.label ?? '',
        is_active: (value) => (value ? 'Activo' : 'Inactivo'),
        created_at: (value) => (value ? formatArgentinaDay(value as string | Date) : ''),
      },
    }),
    [currentParams]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      {...tableProps}
      queryFn={tableQueryFn}
      queryKey={[...WAREHOUSE_QUERY_KEYS.materials]}
      searchPlaceholder="Buscar por código, nombre o descripción"
      emptyMessage="No hay materiales cargados"
      exportConfig={exportConfig}
      data-testid="warehouse-materials-table"
    />
  );
}
