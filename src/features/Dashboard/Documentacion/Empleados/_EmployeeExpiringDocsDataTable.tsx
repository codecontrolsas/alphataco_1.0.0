'use client';

import { ExpiringDocsDataTable } from '@/features/Dashboard/Documentacion/components/ExpiringDocsDataTable';
import { expiringDocFilters } from '@/features/Dashboard/Documentacion/components/expiring-doc-columns';
import { createFacetFilters, textFilter } from '@/shared/components/common/DataTable/facet-filters';
import type { DataTableFacetedFilterConfig, DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import type { EmployeeExpiringDocListItem } from '../lib/expiring-docs-types';
import {
  getAllEmployeeExpiringDocsForExport,
  getEmployeeExpiringDocsPaginated,
  getEmployeeExpiringDocsSingleFacet,
} from './actions.server';
import { columns } from './columns';

interface Props {
  data: EmployeeExpiringDocListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTER_IDS = ['state', 'document_type', 'validity'];

const facets = createFacetFilters(getEmployeeExpiringDocsSingleFacet);

const FACETED_FILTERS: DataTableFacetedFilterConfig[] = [
  ...expiringDocFilters(facets),
  textFilter('fileNumber', 'Legajo', 'Buscar por legajo...'),
];

const EXPORT_OPTIONS = {
  filename: 'documentos-empleados-por-vencer',
  title: 'Documentos de Empleados por Vencer',
};

export function _EmployeeExpiringDocsDataTable(props: Props) {
  return (
    <ExpiringDocsDataTable
      {...props}
      columns={columns}
      facetedFilters={FACETED_FILTERS}
      defaultVisibleFilters={DEFAULT_VISIBLE_FILTER_IDS}
      fetchPage={getEmployeeExpiringDocsPaginated}
      fetchExport={getAllEmployeeExpiringDocsForExport}
      queryKey="dashboard-employee-expiring-docs"
      exportOptions={EXPORT_OPTIONS}
      searchPlaceholder="Buscar por empleado o tipo de documento..."
      emptyMessage="No hay documentos de empleados por vencer"
      testId="employee-expiring-docs-table"
    />
  );
}
