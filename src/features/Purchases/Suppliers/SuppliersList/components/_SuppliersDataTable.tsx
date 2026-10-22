'use client';

import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { type DataTableExportConfig, type DataTableFacetedFilterConfig, type DataTableSearchParams, type FacetResult } from '@/shared/components/common/DataTable/types';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { Check, CircleOff, Tag, X } from 'lucide-react';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { PURCHASES_QUERY_KEYS } from '../../../lib/query-keys';
import {
  getAllSuppliersForExport,
  getSupplierSingleFacet,
  getSuppliersPaginated,
  type SupplierListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns, supplierDocumentStateIcons } from '../columns';
import { SUPPLIER_DOCUMENT_STATE_LABELS, SUPPLIER_DOCUMENT_STATES } from '../labels';

interface Props {
  data: SupplierListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  /** Banda de atención sobre la tabla (la arma el Server Component con su propio Suspense). */
  topSlot?: ReactNode;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['vat_condition', 'categories', 'documents'];

const EMPTY_FACET: FacetResult = { options: [], counts: new Map() };

export function _SuppliersDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  topSlot,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);
  const handleStateChange = useCallback((params: DataTableSearchParams) => setCurrentParams(params), []);
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getSuppliersPaginated(params), []);

  const columns = useMemo(() => getColumns(), []);

  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((c) => [c, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      {
        columnId: 'vat_condition',
        title: 'Condición de IVA',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getSupplierSingleFacet('vat_condition', params);
          if (!result) return EMPTY_FACET;
          return {
            options: (result.resolvedOptions ?? []).map((o) => ({ value: o.id, label: o.name ?? '' })),
            counts: result.counts,
          };
        },
      },
      {
        columnId: 'categories',
        title: 'Rubros',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getSupplierSingleFacet('categories', params);
          if (!result) return EMPTY_FACET;
          return {
            options: [
              ...(result.resolvedOptions ?? []).map((o) => ({ value: o.id, label: o.name ?? '', icon: Tag })),
              ...(result.counts.has(NULL_FILTER_VALUE)
                ? [{ value: NULL_FILTER_VALUE, label: 'Sin rubro', icon: CircleOff }]
                : []),
            ],
            counts: result.counts,
          };
        },
      },
      {
        columnId: 'documents',
        title: 'Documentos',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getSupplierSingleFacet('documents', params);
          if (!result) return EMPTY_FACET;
          return {
            options: SUPPLIER_DOCUMENT_STATES.map((value) => ({
              value,
              label: SUPPLIER_DOCUMENT_STATE_LABELS[value],
              icon: supplierDocumentStateIcons[value],
            })),
            counts: result.counts,
          };
        },
      },
      {
        columnId: 'is_active',
        title: 'Estado',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getSupplierSingleFacet('is_active', params);
          if (!result) return EMPTY_FACET;
          return {
            options: [
              { value: 'true', label: 'Activo', icon: Check },
              { value: 'false', label: 'Inactivo', icon: X },
            ],
            counts: result.counts,
          };
        },
      },
      { columnId: 'created_at', title: 'Fecha de alta', type: 'dateRange' as const },
      { columnId: 'name', title: 'Razón social', type: 'text' as const, placeholder: 'Razón social o nombre de fantasía...' },
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

  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) return initialFilterVisibility;
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

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
      searchParams={searchParams}
      tableId={tableId}
      paramNamespace={tableId}
      facetedFilters={facetedFilters}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      showFilterToggle
      queryFn={tableQueryFn}
      queryKey={[...PURCHASES_QUERY_KEYS.suppliers]}
      onStateChange={handleStateChange}
      searchPlaceholder="Buscar por razón social, fantasía o CUIT"
      emptyMessage="No hay proveedores"
      exportConfig={exportConfig}
      data-testid="suppliers-table"
      />
    </div>
  );
}
