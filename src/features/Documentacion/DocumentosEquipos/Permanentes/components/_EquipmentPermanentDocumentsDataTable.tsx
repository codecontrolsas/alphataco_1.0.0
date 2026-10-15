'use client';

import { DocumentsDownloadDialog } from '@/features/Documentacion/lists-shared/DocumentsDownloadDialog';
import {
  commonDocumentExportFormatters,
  equipmentDocumentLabel,
  formatExportDay,
  formatExportDbDate,
} from '@/features/Documentacion/lists-shared/document-list-export';
import {
  useDocumentListFacets,
  useDocumentListTable,
} from '@/features/Documentacion/lists-shared/use-document-list-table';
import {
  DataTable,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
} from '@/shared/components/common/DataTable';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { contractTypeVehiclesLabels } from '@/shared/utils/mappers';
import { useCallback, useMemo } from 'react';
import { HIDDEN_COLUMNS_BY_DEFAULT, columns } from '../columns';
import { getEquipmentPermanentDocumentsSingleFacet } from '../facets.server';
import {
  getAllEquipmentPermanentDocumentsForExport,
  getEquipmentPermanentDocumentsPaginated,
  type EquipmentPermanentDocumentListItem,
} from '../queries.server';

interface Props {
  data: EquipmentPermanentDocumentListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
  equipmentId?: string;
}

const DEFAULT_VISIBLE_FILTER_IDS = ['state', 'vehicle', 'document_type', 'contractor'];

const ALL_FILTER_IDS = [
  'state',
  'vehicle',
  'document_type',
  'mandatory',
  'multiresource',
  'contractor',
  'validity',
  'created_at',
  'deny_reason',
  'serie',
  'policy_number',
  'vehicle_type',
  'vehicle_subtype',
  'vehicle_brand',
  'vehicle_year',
  'vehicle_owner',
  'vehicle_sector',
  'vehicle_chassis',
  'vehicle_engine',
  'vehicle_contract_type',
  'vehicle_contract_expiration',
];

export function _EquipmentPermanentDocumentsDataTable({
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
  const { makeEnumFetchFacet, makeStateFetchFacet, makeFkFetchFacet, makeBooleanFetchFacet } = useDocumentListFacets(
    getEquipmentPermanentDocumentsSingleFacet,
    equipmentId
  );

  const tableQueryFn = useCallback(
    (params: DataTableSearchParams) => getEquipmentPermanentDocumentsPaginated(params, equipmentId),
    [equipmentId]
  );

  // Export sin paginar: la action devuelve el mensaje si se pasa del tope de filas.
  const fetchAllRows = useCallback(
    async () => unwrapExportResult(await getAllEquipmentPermanentDocumentsForExport(currentParams, equipmentId)),
    [currentParams, equipmentId]
  );

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      { columnId: 'state', title: 'Estado', fetchFacet: makeStateFetchFacet() },

      // Dominio (texto libre — busca por dominio, serie o número interno)
      {
        columnId: 'vehicle',
        title: 'Dominio',
        type: 'text' as const,
        placeholder: 'Buscar por dominio, serie o N° interno...',
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
      // Afectado a (M:M contractor)
      { columnId: 'contractor', title: 'Afectado a', fetchFacet: makeFkFetchFacet('contractor', 'Sin afectar') },
      { columnId: 'validity', title: 'Vencimiento', type: 'dateRange' as const },
      { columnId: 'created_at', title: 'Subido el', type: 'dateRange' as const },
      {
        columnId: 'deny_reason',
        title: 'Motivo de rechazo',
        type: 'text' as const,
        placeholder: 'Buscar por motivo de rechazo...',
      },

      // Serie (vehicles.serie — texto libre)
      {
        columnId: 'serie',
        title: 'Serie',
        type: 'text' as const,
        placeholder: 'Buscar por serie del equipo...',
      },

      // N° de Póliza (documents_equipment.policy_number — texto libre)
      {
        columnId: 'policy_number',
        title: 'N° de Póliza',
        type: 'text' as const,
        placeholder: 'Buscar por N° de póliza...',
      },

      // Tipo del equipo (vehicles.type → type_vehicles_typeTotype)
      {
        columnId: 'vehicle_type',
        title: 'Tipo',
        fetchFacet: makeFkFetchFacet('vehicle_type', 'Sin tipo'),
      },

      // Subtipo del equipo (vehicles.subType → sub_type)
      {
        columnId: 'vehicle_subtype',
        title: 'Subtipo',
        fetchFacet: makeFkFetchFacet('vehicle_subtype', 'Sin subtipo'),
      },

      // Marca del equipo (vehicles.brand → brand_vehicles, Int)
      {
        columnId: 'vehicle_brand',
        title: 'Marca',
        fetchFacet: makeFkFetchFacet('vehicle_brand', 'Sin marca'),
      },

      // Año del equipo (vehicles.year — texto libre)
      {
        columnId: 'vehicle_year',
        title: 'Año',
        type: 'text' as const,
        placeholder: 'Buscar por año del equipo...',
      },

      // Propietario del equipo (vehicles.owner_id → equipment_owners)
      {
        columnId: 'vehicle_owner',
        title: 'Propietario',
        fetchFacet: makeFkFetchFacet('vehicle_owner', 'Sin propietario'),
      },

      // Sector del equipo (vehicles.sector → hierarchy)
      {
        columnId: 'vehicle_sector',
        title: 'Sector',
        fetchFacet: makeFkFetchFacet('vehicle_sector', 'Sin sector'),
      },

      // Chasis del equipo (vehicles.chassis — texto libre)
      {
        columnId: 'vehicle_chassis',
        title: 'Chasis',
        type: 'text' as const,
        placeholder: 'Buscar por chasis del equipo...',
      },

      // Motor del equipo (vehicles.engine — texto libre)
      {
        columnId: 'vehicle_engine',
        title: 'Motor',
        type: 'text' as const,
        placeholder: 'Buscar por motor del equipo...',
      },

      // Tipo de contrato (vehicles.type_of_contract — enum nullable)
      {
        columnId: 'vehicle_contract_type',
        title: 'Tipo de contrato',
        fetchFacet: makeEnumFetchFacet(
          'vehicle_contract_type',
          Object.keys(contractTypeVehiclesLabels),
          contractTypeVehiclesLabels
        ),
      },

      // Vencimiento de contrato (vehicles.contract_expiration_date — rango de fechas)
      {
        columnId: 'vehicle_contract_expiration',
        title: 'Venc. de contrato',
        type: 'dateRange' as const,
      },
    ],
    [makeEnumFetchFacet, makeStateFetchFacet, makeFkFetchFacet, makeBooleanFetchFacet]
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
      emptyMessage="No hay documentos permanentes de equipos registrados"
      data-testid="equipment-permanent-documents-table"
      toolbarActions={
        <DocumentsDownloadDialog
          queryKey={['equipment-permanent-docs-download', equipmentId ?? '', currentParams]}
          fetchRows={fetchAllRows}
          getResourceLabel={equipmentDocumentLabel}
          getFileResourceName={equipmentDocumentLabel}
          zipFileName="documentos-permanentes-equipos.zip"
        />
      }
      // Client-side navigation: fetch instantáneo via React Query, sin router.push
      queryFn={tableQueryFn}
      queryKey={['equipment-permanent-docs', equipmentId ?? 'all']}
      queryStaleTimeMs={5_000}
      onStateChange={handleStateChange}
      exportConfig={{
        fetchAllData: fetchAllRows,
        options: {
          filename: 'documentos-permanentes-equipos',
          title: 'Documentos Permanentes de Equipos',
          sheetName: 'Documentos',
        },
        formatters: {
          ...commonDocumentExportFormatters(),
          vehicle: (val) => String(val ?? ''),
          document_type: (val) => String(val ?? ''),
          contractor: (val) => String(val ?? ''),
          validity: formatExportDay,
          policy_number: (val) => String(val ?? ''),
          vehicle_type: (val) => String(val ?? ''),
          vehicle_subtype: (val) => String(val ?? ''),
          vehicle_brand: (val) => String(val ?? ''),
          vehicle_year: (val) => String(val ?? ''),
          vehicle_owner: (val) => String(val ?? ''),
          vehicle_sector: (val) => String(val ?? ''),
          vehicle_chassis: (val) => String(val ?? ''),
          vehicle_engine: (val) => String(val ?? ''),
          vehicle_contract_type: (val) => (val ? contractTypeVehiclesLabels[val as string] ?? String(val) : ''),
          vehicle_contract_expiration: formatExportDbDate,
        },
      }}
    />
  );
}
