'use client';

import { DocumentsDownloadDialog } from '@/features/Documentacion/lists-shared/DocumentsDownloadDialog';
import {
  commonDocumentExportFormatters,
  equipmentDocumentLabel,
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
  getAllMonthlyEquipmentDocumentsForExport,
  getMonthlyEquipmentDocumentsPaginated,
  getMonthlyEquipmentDocumentsSingleFacet,
  type MonthlyEquipmentDocumentListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, columns } from '../columns';

interface Props {
  data: MonthlyEquipmentDocumentListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
  equipmentId?: string;
}

const DEFAULT_VISIBLE_FILTER_IDS = ['state', 'vehicle', 'documentType', 'contractor'];

const ALL_FILTER_IDS = [
  'state',
  'vehicle',
  'documentType',
  'mandatory',
  'multiresource',
  'contractor',
  'period',
  'deny_reason',
  'created_at',
];

export function _MonthlyEquipmentDocumentsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  initialColumnVisibility,
  initialFilterVisibility,
  equipmentId,
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
    getMonthlyEquipmentDocumentsSingleFacet,
    equipmentId
  );

  const tableQueryFn = useCallback(
    (params: DataTableSearchParams) => getMonthlyEquipmentDocumentsPaginated(params, equipmentId),
    [equipmentId]
  );

  // Export sin paginar: la action devuelve el mensaje si se pasa del tope de filas.
  const fetchAllRows = useCallback(
    async () => unwrapExportResult(await getAllMonthlyEquipmentDocumentsForExport(currentParams, equipmentId)),
    [currentParams, equipmentId]
  );

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      { columnId: 'state', title: 'Estado', fetchFacet: makeStateFetchFacet() },
      // Equipo (texto libre — busca por dominio, serie o número interno)
      {
        columnId: 'vehicle',
        title: 'Equipo',
        type: 'text' as const,
        placeholder: 'Buscar por dominio, serie o N° interno...',
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
      // Afectación / Contractor (M:M a través de vehicles)
      { columnId: 'contractor', title: 'Afectado a', fetchFacet: makeFkFetchFacet('contractor', 'Sin afectar') },
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
      { columnId: 'created_at', title: 'Subido el', type: 'dateRange' as const },
    ],
    [makeStateFetchFacet, makeFkFetchFacet, makeBooleanFetchFacet]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      searchParams={searchParams}
      searchPlaceholder="Dominio o documento"
      showSearch
      mobileCards
      facetedFilters={facetedFilters}
      initialColumnVisibility={columnVisibility}
      initialFilterVisibility={filterVisibility}
      tableId={tableId}
      paramNamespace={tableId}
      showFilterToggle={true}
      emptyMessage="No hay documentos mensuales de equipos registrados"
      data-testid="monthly-equipment-documents-table"
      toolbarActions={
        <DocumentsDownloadDialog
          queryKey={['equipment-monthly-docs-download', equipmentId ?? '', currentParams]}
          fetchRows={fetchAllRows}
          getResourceLabel={equipmentDocumentLabel}
          getFileResourceName={equipmentDocumentLabel}
          zipFileName="documentos-mensuales-equipos.zip"
        />
      }
      // Client-side navigation: fetch instantáneo via React Query, sin router.push
      queryFn={tableQueryFn}
      queryKey={['monthly-equipment-documents', equipmentId ?? '']}
      queryStaleTimeMs={5_000}
      onStateChange={handleStateChange}
      exportConfig={{
        fetchAllData: fetchAllRows,
        options: {
          filename: 'documentos-mensuales-equipos',
          title: 'Listado de Documentos Mensuales de Equipos',
          sheetName: 'Documentos Mensuales',
        },
        formatters: {
          ...commonDocumentExportFormatters(),
          vehicle: (val) => String(val ?? ''),
          documentType: (val) => String(val ?? ''),
          contractor: (val) => String(val ?? ''),
          period: (val) => String(val ?? '-'),
        },
      }}
    />
  );
}
