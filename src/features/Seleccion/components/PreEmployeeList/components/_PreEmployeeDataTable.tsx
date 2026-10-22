'use client';

import { STATUS_LABELS, type PreEmployeeStatus } from '@/features/Seleccion/lib/state-machine';
import { pre_employee_status_enum } from '@/generated/prisma/enums';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import {
  createFacetFilters,
  dateRangeFilter,
  enumFilterOptions,
  textFilter,
} from '@/shared/components/common/DataTable/facet-filters';
import type { DataTableExportConfig, DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { useCallback, useMemo } from 'react';
import {
  getAllPreEmployeesForExport,
  getPreEmployeeSingleFacet,
  getPreEmployeesPaginated,
  type PreEmployeeListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns, statusIcons } from '../columns';

// ============================================================================
// TYPES
// ============================================================================

interface PreEmployeeDataTableProps {
  data: PreEmployeeListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  /** Cantidad de documentos obligatorios (el Y de la columna Documentos) */
  requiredDocs: number;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

/** Filtros visibles por defecto: solo los 3 mas comunes. */
const DEFAULT_VISIBLE_FILTERS = ['status', 'hierarchy', 'company_positions'];

// ============================================================================
// COMPONENT
// ============================================================================

export function _PreEmployeeDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  requiredDocs,
  initialColumnVisibility,
  initialFilterVisibility,
}: PreEmployeeDataTableProps) {
  // queryFn para fetch client-side de datos de tabla
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getPreEmployeesPaginated(params), []);

  // Columns
  const columns = useMemo(() => getColumns(requiredDocs), [requiredDocs]);

  // ─── Filtros facetados con lazy-load ───────────────────────────────────────
  const facetedFilters = useMemo(() => {
    const facet = createFacetFilters(getPreEmployeeSingleFacet);
    return [
      facet.fixed(
        'status',
        'Estado',
        enumFilterOptions(Object.values(pre_employee_status_enum), STATUS_LABELS, statusIcons)
      ),
      facet.lookup('hierarchy', 'Sector propuesto', undefined, { label: 'Sin asignar' }),
      facet.lookup('company_positions', 'Puesto propuesto', undefined, { label: 'Sin asignar' }),
      textFilter('pre_file_number', 'N° Candidato', 'Buscar por N° de candidato...'),
      textFilter('fullName', 'Nombre', 'Buscar por nombre...'),
      textFilter('document_number', 'DNI', 'Buscar por DNI...'),
      textFilter('cuil', 'CUIL', 'Buscar por CUIL...'),
      textFilter('phone', 'Telefono', 'Buscar por telefono...'),
      textFilter('email', 'Email', 'Buscar por email...'),
      textFilter('rejection_reason', 'Motivo de rechazo', 'Buscar por motivo de rechazo...'),
      dateRangeFilter('created_at', 'Creado'),
      dateRangeFilter('reviewed_at', 'Revisado'),
    ];
  }, []);

  const { currentParams, tableProps } = useServerTableView({
    searchParams,
    tableId,
    hiddenColumnsByDefault: HIDDEN_COLUMNS_BY_DEFAULT,
    defaultVisibleFilters: DEFAULT_VISIBLE_FILTERS,
    facetedFilters,
    initialColumnVisibility,
    savedFilterVisibility: initialFilterVisibility,
  });

  // ─── Exportacion a Excel ────────────────────────────────────────────────
  const exportConfig: DataTableExportConfig<PreEmployeeListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllPreEmployeesForExport(currentParams)),
      options: {
        filename: 'candidatos',
        title: 'Listado de Candidatos',
        sheetName: 'Candidatos',
      },
      formatters: {
        status: (value) => STATUS_LABELS[value as PreEmployeeStatus] || String(value),
        created_at: (value) => (value ? formatArgentinaDay(value as string | Date) : '-'),
        reviewed_at: (value) => (value ? formatArgentinaDay(value as string | Date) : '-'),
      },
    }),
    [currentParams]
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      {...tableProps}
      showSearch
      mobileCards
      // Client-side navigation: fetch instantaneo via React Query, sin router.push
      queryFn={tableQueryFn}
      queryKey={['pre-employees-paginated']}
      enableRowSelection
      showRowSelection
      searchPlaceholder="Buscar por nombre, CUIL o N° de candidato"
      emptyMessage="No hay candidatos cargados"
      exportConfig={exportConfig}
      data-testid="pre-employees-table"
    />
  );
}
