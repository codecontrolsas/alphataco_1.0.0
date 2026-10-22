'use client';

import { DocumentsDownloadDialog } from '@/features/Documentacion/lists-shared/DocumentsDownloadDialog';
import { commonDocumentExportFormatters } from '@/features/Documentacion/lists-shared/document-list-export';
import {
  useDocumentListFacets,
  useDocumentListTable,
} from '@/features/Documentacion/lists-shared/use-document-list-table';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { type DataTableFacetedFilterConfig, type DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { useCallback, useMemo } from 'react';
import {
  getAllMonthlyEmployeeDocumentsForExport,
  getMonthlyEmployeeDocumentsPaginated,
  getMonthlyEmployeeDocumentsSingleFacet,
  type MonthlyEmployeeDocumentListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, columns } from '../columns';

interface Props {
  data: MonthlyEmployeeDocumentListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
  employeeId?: string;
}

const DEFAULT_VISIBLE_FILTER_IDS = ['state', 'employee', 'fileNumber', 'documentType'];

const ALL_FILTER_IDS = [
  'state',
  'employee',
  'fileNumber',
  'documentType',
  'mandatory',
  'multiresource',
  'contractor',
  'created_at',
  'period',
  'deny_reason',
];

export function _MonthlyEmployeeDocumentsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  initialColumnVisibility,
  initialFilterVisibility,
  employeeId,
}: Props) {
  // Parámetros vigentes (para exportar con los filtros activos) y visibilidad de columnas/filtros.
  const { currentParams, handleStateChange, columnVisibility, filterVisibility } = useDocumentListTable({
    searchParams,
    initialColumnVisibility,
    initialFilterVisibility,
    hiddenColumnsByDefault: HIDDEN_COLUMNS_BY_DEFAULT,
    allFilterIds: ALL_FILTER_IDS,
    defaultVisibleFilterIds: DEFAULT_VISIBLE_FILTER_IDS,
  });
  const { makeStateFetchFacet, makeFkFetchFacet, makeBooleanFetchFacet } = useDocumentListFacets(
    getMonthlyEmployeeDocumentsSingleFacet,
    employeeId
  );

  const tableQueryFn = useCallback(
    (params: DataTableSearchParams) => getMonthlyEmployeeDocumentsPaginated(params, employeeId),
    [employeeId]
  );

  // Export sin paginar: la action devuelve el mensaje si se pasa del tope de filas.
  const fetchAllRows = useCallback(
    async () => unwrapExportResult(await getAllMonthlyEmployeeDocumentsForExport(currentParams, employeeId)),
    [currentParams, employeeId]
  );

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      { columnId: 'state', title: 'Estado', fetchFacet: makeStateFetchFacet() },
      {
        columnId: 'employee',
        title: 'Empleado',
        type: 'text' as const,
        placeholder: 'Buscar por nombre o apellido...',
      },
      // Legajo (coincidencia exacta — filtro separado del empleado)
      {
        columnId: 'fileNumber',
        title: 'Legajo',
        type: 'text' as const,
        placeholder: 'Ingrese el legajo completo...',
      },
      {
        columnId: 'documentType',
        title: 'Tipo de Documento',
        fetchFacet: makeFkFetchFacet('documentType', 'Sin tipo'),
      },
      {
        columnId: 'mandatory',
        title: 'Mandatorio',
        fetchFacet: makeBooleanFetchFacet('mandatory', 'Mandatorio', 'No Mandatorio'),
      },
      {
        columnId: 'multiresource',
        title: 'Multirecurso',
        fetchFacet: makeBooleanFetchFacet('multiresource', 'Multirecurso', 'No Multirecurso'),
      },
      // Afectación / Contractor (M:M)
      { columnId: 'contractor', title: 'Afectado a', fetchFacet: makeFkFetchFacet('contractor', 'Sin afectar') },
      { columnId: 'created_at', title: 'Subido el', type: 'dateRange' as const },
      {
        columnId: 'period',
        title: 'Período',
        type: 'text' as const,
        placeholder: 'Buscar por período...',
      },
      {
        columnId: 'deny_reason',
        title: 'Motivo de rechazo',
        type: 'text' as const,
        placeholder: 'Buscar por motivo...',
      },
    ],
    [makeStateFetchFacet, makeFkFetchFacet, makeBooleanFetchFacet]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      searchParams={searchParams}
      // Client-side navigation: fetch instantáneo via React Query, sin router.push
      queryFn={tableQueryFn}
      queryKey={['monthly-employee-documents', employeeId ?? '']}
      queryStaleTimeMs={5_000}
      onStateChange={handleStateChange}
      searchPlaceholder="Legajo, empleado o documento"
      showSearch
      mobileCards
      facetedFilters={facetedFilters}
      initialColumnVisibility={columnVisibility}
      initialFilterVisibility={filterVisibility}
      tableId={tableId}
      paramNamespace={tableId}
      showFilterToggle={true}
      emptyMessage="No hay documentos mensuales de empleados registrados"
      data-testid="monthly-employee-documents-table"
      toolbarActions={
        <DocumentsDownloadDialog
          queryKey={['employee-monthly-docs-download', employeeId ?? '', currentParams]}
          fetchRows={fetchAllRows}
          getResourceLabel={(row) =>
            row.employees ? `${row.employees.lastname} ${row.employees.firstname}` : 'Empleado'
          }
          getFileResourceName={(row) =>
            row.employees ? `${row.employees.lastname}_${row.employees.firstname}` : 'Empleado'
          }
          zipFileName="documentos-mensuales.zip"
        />
      }
      exportConfig={{
        fetchAllData: fetchAllRows,
        options: {
          filename: 'documentos-mensuales-empleados',
          title: 'Listado de Documentos Mensuales de Empleados',
          sheetName: 'Documentos Mensuales',
        },
        formatters: {
          ...commonDocumentExportFormatters(),
          employee: (val) => String(val ?? ''),
          fileNumber: (val) => String(val ?? ''),
          documentType: (val) => String(val ?? ''),
          contractor: (val) => String(val ?? ''),
          period: (val) => String(val ?? '-'),
        },
      }}
    />
  );
}
