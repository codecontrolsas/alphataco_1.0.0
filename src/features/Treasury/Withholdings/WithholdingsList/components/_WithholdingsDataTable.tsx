'use client';

import { formatMoney } from '@/features/Warehouses/lib/format';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { EMPTY_FACET } from '@/shared/components/common/DataTable/facet-filters';
import {
  type DataTableExportConfig,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable/types';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { Users } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { TREASURY_QUERY_KEYS } from '../../../lib/query-keys';
import { CUSTOMER_WITHHOLDING_TAX_LABELS } from '../../../schemas/receipts';
import {
  getAllWithholdingsForExport,
  getWithholdingSingleFacet,
  getWithholdingsPaginated,
  type WithholdingListItem,
} from '../actions.server';
import {
  HIDDEN_COLUMNS_BY_DEFAULT,
  certificateIcons,
  formatValueDate,
  getColumns,
  withholdingTaxIcons,
} from '../columns';
import { CERTIFICATE_FILTER_LABELS, type CertificateFilterValue } from '../constants';
import { WithholdingTotals } from './WithholdingTotals';

interface Props {
  data: WithholdingListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  canAttach: boolean;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['certificate_date', 'tax', 'customer'];

const TAX_VALUES = Object.keys(CUSTOMER_WITHHOLDING_TAX_LABELS) as WithholdingListItem['tax'][];
const CERTIFICATE_VALUES = Object.keys(CERTIFICATE_FILTER_LABELS) as CertificateFilterValue[];

export function _WithholdingsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  canAttach,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);
  const handleStateChange = useCallback((params: DataTableSearchParams) => setCurrentParams(params), []);
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getWithholdingsPaginated(params), []);

  const columns = useMemo(() => getColumns({ canAttach }), [canAttach]);

  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((c) => [c, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      { columnId: 'certificate_date', title: 'Fecha del certificado', type: 'dateRange' as const },
      {
        columnId: 'tax',
        title: 'Impuesto',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getWithholdingSingleFacet('tax', params);
          if (!result) return EMPTY_FACET;
          return {
            options: TAX_VALUES.map((value) => ({
              value,
              label: CUSTOMER_WITHHOLDING_TAX_LABELS[value],
              icon: withholdingTaxIcons[value],
            })),
            counts: result.counts,
          };
        },
      },
      {
        columnId: 'customer',
        title: 'Cliente',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getWithholdingSingleFacet('customer', params);
          if (!result) return EMPTY_FACET;
          return {
            options: (result.resolvedOptions ?? []).map((o) => ({ value: o.id, label: o.name ?? '', icon: Users })),
            counts: result.counts,
          };
        },
      },
      {
        columnId: 'certificate',
        title: 'Certificado',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getWithholdingSingleFacet('certificate', params);
          if (!result) return EMPTY_FACET;
          return {
            options: CERTIFICATE_VALUES.map((value) => ({
              value,
              label: CERTIFICATE_FILTER_LABELS[value],
              icon: certificateIcons[value],
            })),
            counts: result.counts,
          };
        },
      },
      {
        columnId: 'jurisdiction',
        title: 'Jurisdicción',
        type: 'text' as const,
        placeholder: 'Buscar en la jurisdicción...',
      },
      { columnId: 'certificate_number', title: 'Número', type: 'text' as const, placeholder: 'Número de certificado' },
      { columnId: 'cuit', title: 'CUIT', type: 'text' as const, placeholder: 'CUIT o parte de él' },
      { columnId: 'receipt', title: 'Recibo', type: 'text' as const, placeholder: 'Número, ej: RE-000001' },
      { columnId: 'amount', title: 'Importe', type: 'text' as const, placeholder: 'Importe exacto, ej: 1234,56' },
    ],
    []
  );

  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) return initialFilterVisibility;
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

  const exportConfig: DataTableExportConfig<WithholdingListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllWithholdingsForExport(currentParams)),
      options: { filename: 'retenciones-sufridas', title: 'Retenciones sufridas', sheetName: 'Retenciones' },
      formatters: {
        certificate_date: (value) => formatValueDate(value as string),
        amount: (value) => formatMoney(String(value)),
        // URL absoluta del certificado (el link relativo no sirve fuera de la app); vacío si no tiene
        certificate: (value) => {
          const url = typeof value === 'string' ? value : '';
          if (!url) return '';
          return url.startsWith('/') ? `${window.location.origin}${url}` : url;
        },
      },
    }),
    [currentParams]
  );

  return (
    <>
      <WithholdingTotals params={currentParams} />
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
        queryKey={[...TREASURY_QUERY_KEYS.withholdings]}
        onStateChange={handleStateChange}
        searchPlaceholder="Buscar por cliente, certificado, jurisdicción o recibo"
        emptyMessage="No hay retenciones sufridas en el período"
        exportConfig={exportConfig}
        data-testid="treasury-withholdings-table"
      />
    </>
  );
}
