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
import { Check, Tag, X } from 'lucide-react';
import { useCallback, useMemo, type ReactNode } from 'react';
import { PURCHASES_QUERY_KEYS } from '../../../lib/query-keys';
import {
  getAllSuppliersForExport,
  getSupplierSingleFacet,
  getSuppliersPaginated,
  type SupplierListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns, supplierDocumentStateIcons } from '../columns';
import { SUPPLIER_DOCUMENT_STATES, SUPPLIER_DOCUMENT_STATE_LABELS } from '../labels';

interface Props {
  data: SupplierListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  /** Banda de atención sobre la tabla (la arma el Server Component con su propio Suspense). */
  topSlot?: ReactNode;
  initialColumnVisibility?: Record<string, boolean>;
  /** Preferencia guardada de filtros visibles: esta tabla hoy no la aplica (ver REVISION-CODIGO.md). */
  initialFilterVisibility?: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['vat_condition', 'categories', 'documents'];

const facets = createFacetFilters(getSupplierSingleFacet);

const DOCUMENT_OPTIONS = SUPPLIER_DOCUMENT_STATES.map((value) => ({
  value,
  label: SUPPLIER_DOCUMENT_STATE_LABELS[value],
  icon: supplierDocumentStateIcons[value],
}));

const ACTIVE_OPTIONS = [
  { value: 'true', label: 'Activo', icon: Check },
  { value: 'false', label: 'Inactivo', icon: X },
];

export function _SuppliersDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  topSlot,
  initialColumnVisibility,
}: Props) {
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getSuppliersPaginated(params), []);

  const columns = useMemo(() => getColumns(), []);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      facets.lookup('vat_condition', 'Condición de IVA'),
      facets.lookup('categories', 'Rubros', Tag, { label: 'Sin rubro' }),
      facets.fixed('documents', 'Documentos', DOCUMENT_OPTIONS),
      facets.fixed('is_active', 'Estado', ACTIVE_OPTIONS),
      { columnId: 'created_at', title: 'Fecha de alta', type: 'dateRange' as const },
      {
        columnId: 'name',
        title: 'Razón social',
        type: 'text' as const,
        placeholder: 'Razón social o nombre de fantasía...',
      },
      { columnId: 'cuit', title: 'CUIT', type: 'text' as const, placeholder: 'CUIT con o sin guiones...' },
      {
        columnId: 'contact',
        title: 'Contacto principal',
        type: 'text' as const,
        placeholder: 'Nombre, mail o teléfono...',
      },
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
  });

  const exportConfig: DataTableExportConfig<SupplierListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllSuppliersForExport(currentParams)),
      options: { filename: 'proveedores', title: 'Proveedores', sheetName: 'Proveedores' },
      formatters: {
        created_at: (value) => (value ? formatArgentinaDay(value as string | Date) : ''),
      },
    }),
    [currentParams]
  );

  return (
    <div className="space-y-4">
      {topSlot}
      <DataTable
        columns={columns}
        data={data}
        totalRows={totalRows}
        {...tableProps}
        queryFn={tableQueryFn}
        queryKey={[...PURCHASES_QUERY_KEYS.suppliers]}
        searchPlaceholder="Buscar por razón social, fantasía o CUIT"
        emptyMessage="No hay proveedores"
        exportConfig={exportConfig}
        data-testid="suppliers-table"
      />
    </div>
  );
}
