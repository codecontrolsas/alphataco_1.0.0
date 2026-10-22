'use client';

import { DocumentsDownloadDialog } from '@/features/Documentacion/lists-shared/DocumentsDownloadDialog';
import {
  commonDocumentExportFormatters,
  formatExportDay,
} from '@/features/Documentacion/lists-shared/document-list-export';
import {
  useDocumentListFacets,
  useDocumentListTable,
} from '@/features/Documentacion/lists-shared/use-document-list-table';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { type DataTableFacetedFilterConfig, type DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { useCallback, useMemo } from 'react';
import {
  getAllEmployeePermanentDocumentsForExport,
  getEmployeePermanentDocumentsPaginated,
  getEmployeePermanentDocumentsSingleFacet,
  type EmployeePermanentDocumentListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, columns } from '../columns';

interface Props {
  data: EmployeePermanentDocumentListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
  /** Si se provee, filtra documentos de un empleado específico */
  employeeId?: string;
}

const DEFAULT_VISIBLE_FILTER_IDS = ['state', 'employee', 'fileNumber', 'document_type'];

const ALL_FILTER_IDS = [
  'state',
  'employee',
  'fileNumber',
  'document_type',
  'mandatory',
  'multiresource',
  'validity',
  'created_at',
  'deny_reason',
];

export function _EmployeePermanentDocumentsDataTable({
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
    getEmployeePermanentDocumentsSingleFacet,
    employeeId
  );

  // queryFn para fetch client-side de datos de tabla
  const tableQueryFn = useCallback(
    (params: DataTableSearchParams) => getEmployeePermanentDocumentsPaginated(params, employeeId),
    [employeeId]
  );

  // Export sin paginar: la action devuelve el mensaje si se pasa del tope de filas.
  const fetchAllRows = useCallback(
    async () => unwrapExportResult(await getAllEmployeePermanentDocumentsForExport(currentParams, employeeId)),
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
        columnId: 'document_type',
        title: 'Tipo de documento',
        fetchFacet: makeFkFetchFacet('document_type', 'Sin tipo'),
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
      { columnId: 'validity', title: 'Vencimiento', type: 'dateRange' as const },
      { columnId: 'created_at', title: 'Subido el', type: 'dateRange' as const },
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
      queryFn={tableQueryFn}
      queryKey={['employee-permanent-docs', employeeId ?? '']}
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
      emptyMessage="No hay documentos permanentes de empleados registrados"
      data-testid="employee-permanent-documents-table"
      toolbarActions={
        <DocumentsDownloadDialog
          queryKey={['employee-permanent-docs-download', employeeId ?? '', currentParams]}
          fetchRows={fetchAllRows}
          getResourceLabel={(row) =>
            row.employees ? `${row.employees.lastname} ${row.employees.firstname}` : 'Empleado'
          }
          getFileResourceName={(row) =>
            row.employees ? `${row.employees.lastname}_${row.employees.firstname}` : 'Empleado'
          }
          zipFileName="documentos-permanentes.zip"
        />
      }
      exportConfig={{
        fetchAllData: fetchAllRows,
        options: {
          filename: 'documentos-permanentes-empleados',
          title: 'Documentos Permanentes de Empleados',
          sheetName: 'Documentos',
        },
        formatters: {
          ...commonDocumentExportFormatters(),
          employee: (val) => String(val ?? ''),
          fileNumber: (val) => String(val ?? ''),
          document_type: (val) => String(val ?? ''),
          validity: formatExportDay,
        },
      }}
    />
  );
}
