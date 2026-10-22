'use client';

import { usePermissionChecker } from '@/features/Permissions/hooks/usePermissionChecker';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import {
  createFacetFilters,
  dateRangeFilter,
  enumFilterOptions,
  textFilter,
} from '@/shared/components/common/DataTable/facet-filters';
import type {
  DataTableExportConfig,
  DataTableFacetedFilterConfig,
  DataTableSearchParams,
} from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { formSourceLabels } from '@/shared/utils/mappers';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import {
  getAllFormsForExport,
  getFormsPaginated,
  getFormsSingleFacet,
  getFormsUnionCoverage,
  type FormListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, formSourceIcons, getColumns } from '../columns';

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  data: FormListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['is_active', 'source', 'created_at'];

const SOURCES = ['checklist_template', 'custom_form'] as const;

const facets = createFacetFilters(getFormsSingleFacet);

const facetedFilters: DataTableFacetedFilterConfig[] = [
  facets.fixed(
    'is_active',
    'Estado',
    [
      { value: 'true', label: 'Activo', icon: CheckCircle2 },
      { value: 'false', label: 'Inactivo', icon: XCircle },
    ],
    { label: 'Sin asignar' }
  ),
  facets.fixed('source', 'Tipo', enumFilterOptions(SOURCES, formSourceLabels, formSourceIcons)),
  textFilter('name', 'Nombre', 'Filtrar por nombre...'),
  textFilter('description', 'Descripción', 'Filtrar por descripción...'),
  textFilter('code', 'Código', 'Filtrar por código...'),
  dateRangeFilter('created_at', 'Fecha de creación'),
];

// ============================================================================
// CLIENT COMPONENT
// ============================================================================

export function _FormsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const permissions = usePermissionChecker(permissionsMap);

  const { currentParams, tableProps } = useServerTableView({
    searchParams,
    tableId,
    hiddenColumnsByDefault: HIDDEN_COLUMNS_BY_DEFAULT,
    defaultVisibleFilters: DEFAULT_VISIBLE_FILTERS,
    facetedFilters,
    initialColumnVisibility,
    savedFilterVisibility: initialFilterVisibility,
  });
  // Client-side mode: filtros, orden y paginación sin re-renderizar la página
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getFormsPaginated(params), []);

  // La unión de las dos fuentes se arma en memoria con tope por fuente: si los filtros dejan más filas que
  // el tope, se avisa con el conteo real en vez de truncar en silencio.
  const { data: coverage } = useQuery({
    queryKey: ['forms-list', 'coverage', currentParams],
    queryFn: () => getFormsUnionCoverage(currentParams),
    staleTime: 30 * 1000,
  });
  const isTruncated = coverage != null && coverage.shown < coverage.total;

  const columns = useMemo(() => getColumns(permissions), [permissions]);

  const exportConfig: DataTableExportConfig<FormListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllFormsForExport(currentParams)),
      options: {
        filename: 'formularios',
        title: 'Listado de Formularios',
        sheetName: 'Formularios',
      },
      formatters: {
        is_active: (val) => (val == null ? 'Sin asignar' : val ? 'Activo' : 'Inactivo'),
        source: (val) => formSourceLabels[val as string] ?? String(val ?? ''),
        created_at: (val) => (val ? formatArgentinaDay(val as string | Date) : ''),
        total_responses: (val) => String(val ?? 0),
        code: (val) => String(val ?? ''),
        description: (val) => String(val ?? ''),
      },
    }),
    [currentParams]
  );

  return (
    <div className="space-y-3">
      <p
        role="status"
        className={
          isTruncated
            ? 'text-warn-subtle-foreground bg-warn-subtle border-warn/35 rounded-lg border px-3 py-2 text-sm'
            : 'sr-only'
        }
      >
        {isTruncated && coverage
          ? `Se listan los ${coverage.shown.toLocaleString('es-AR')} formularios más recientes de ${coverage.total.toLocaleString('es-AR')}. La búsqueda y los filtros acotan el resto.`
          : ''}
      </p>
      <DataTable
        columns={columns}
        data={data}
        totalRows={totalRows}
        {...tableProps}
        queryFn={tableQueryFn}
        queryKey={['forms-list']}
        searchPlaceholder="Buscar formularios por nombre, descripción o código..."
        emptyMessage="No hay formularios registrados"
        data-testid="forms-table"
        exportConfig={exportConfig}
      />
    </div>
  );
}
