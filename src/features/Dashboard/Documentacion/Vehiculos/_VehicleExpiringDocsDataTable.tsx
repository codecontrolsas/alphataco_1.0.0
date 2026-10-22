'use client';

import { ExpiringDocsDataTable } from '@/features/Dashboard/Documentacion/components/ExpiringDocsDataTable';
import { expiringDocFilters } from '@/features/Dashboard/Documentacion/components/expiring-doc-columns';
import { createFacetFilters, textFilter } from '@/shared/components/common/DataTable/facet-filters';
import type { DataTableFacetedFilterConfig, DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import type { VehicleExpiringDocListItem } from '../lib/expiring-docs-types';
import {
  getAllVehicleExpiringDocsForExport,
  getVehicleExpiringDocsPaginated,
  getVehicleExpiringDocsSingleFacet,
} from './actions.server';
import { columns } from './columns';

interface Props {
  data: VehicleExpiringDocListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTER_IDS = ['state', 'document_type', 'validity', 'vehicle'];

const facets = createFacetFilters(getVehicleExpiringDocsSingleFacet);

const FACETED_FILTERS: DataTableFacetedFilterConfig[] = [
  ...expiringDocFilters(facets),
  facets.lookup('sub_type', 'Subtipo', undefined, { label: 'Sin asignar' }),
  facets.lookup('owner', 'Propietario', undefined, { label: 'Propio / Sin asignar' }),
  textFilter('vehicle', 'Dominio', 'Buscar por dominio...'),
];

const EXPORT_OPTIONS = {
  filename: 'documentos-equipos-por-vencer',
  title: 'Documentos de Equipos por Vencer',
};

export function _VehicleExpiringDocsDataTable(props: Props) {
  return (
    <ExpiringDocsDataTable
      {...props}
      columns={columns}
      facetedFilters={FACETED_FILTERS}
      defaultVisibleFilters={DEFAULT_VISIBLE_FILTER_IDS}
      fetchPage={getVehicleExpiringDocsPaginated}
      fetchExport={getAllVehicleExpiringDocsForExport}
      queryKey="dashboard-vehicle-expiring-docs"
      exportOptions={EXPORT_OPTIONS}
      searchPlaceholder="Buscar por equipo o tipo de documento..."
      emptyMessage="No hay documentos de equipos por vencer"
      testId="vehicle-expiring-docs-table"
    />
  );
}
