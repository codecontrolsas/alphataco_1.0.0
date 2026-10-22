'use client';

import { buildBooleanFacetResult } from '@/features/Documentacion/DocumentosEmpresa/lib/facet-results';
import {
  documentListStateLabels,
  formatDocumentPeriod,
} from '@/features/Documentacion/shared/components/DocumentCells';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { buildEnumFacetResult, buildFkFacetResult } from '@/shared/components/common/DataTable/facet-results';
import {
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable/types';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import type { LucideIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import {
  getAllCompanyDocsForExport,
  getCompanyDocsPaginated,
  getCompanyDocsSingleFacet,
  type CompanyDocListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, documentStateIcons, getColumns } from './columns';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Valores del enum `state` (orden en que se ofrecen en el filtro). */
const STATE_VALUES = ['pendiente', 'rechazado', 'vencido', 'presentado', 'aprobado'] as const;

/** Filtros visibles por defecto (3). */
const DEFAULT_VISIBLE_FILTERS: readonly string[] = ['state', 'documentType', 'uploadedBy'];

const ALL_FILTER_IDS = ['state', 'documentType', 'docType', 'mandatory', 'uploadedBy', 'created_at', 'period'];

// ============================================================================
// TYPES
// ============================================================================

interface CompanyDocsDataTableProps {
  data: CompanyDocListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function _CompanyDocsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  initialColumnVisibility,
  initialFilterVisibility,
}: CompanyDocsDataTableProps) {
  // ── Client-side navigation: params actuales de la tabla (para exportar con los filtros activos) ──
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);
  const handleStateChange = useCallback((params: DataTableSearchParams) => setCurrentParams(params), []);
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getCompanyDocsPaginated(params), []);

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns = useMemo(() => getColumns(), []);

  // ── Column visibility ─────────────────────────────────────────────────────
  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((col) => [col, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  // ── Filter visibility: preferencias guardadas, o los 3 por defecto ────────
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    return Object.fromEntries(ALL_FILTER_IDS.map((id) => [id, DEFAULT_VISIBLE_FILTERS.includes(id)]));
  }, [initialFilterVisibility]);

  // ── fetchFacet factories (lazy-load al abrir cada filtro) ─────────────────
  const makeEnumFetchFacet = useCallback(
    (columnId: string) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getCompanyDocsSingleFacet(columnId, params);
        return buildEnumFacetResult(STATE_VALUES, documentListStateLabels, documentStateIcons, result.counts);
      },
    []
  );

  const makeFkFetchFacet = useCallback(
    (columnId: string, options?: { nullLabel?: string; icon?: LucideIcon }) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getCompanyDocsSingleFacet(columnId, params);
        return buildFkFacetResult(result.resolvedOptions, result.counts, options?.nullLabel, options?.icon);
      },
    []
  );

  const makeBooleanFetchFacet = useCallback(
    (columnId: string) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getCompanyDocsSingleFacet(columnId, params);
        return buildBooleanFacetResult(result.counts);
      },
    []
  );

  // ── Faceted filters config ────────────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      { columnId: 'state', title: 'Estado', fetchFacet: makeEnumFetchFacet('state') },
      { columnId: 'documentType', title: 'Documento', fetchFacet: makeFkFetchFacet('documentType') },
      // Mensual / Permanente: se filtra por el id del tipo, la etiqueta trae la periodicidad.
      { columnId: 'docType', title: 'Tipo', fetchFacet: makeFkFetchFacet('docType') },
      { columnId: 'mandatory', title: 'Mandatorio', fetchFacet: makeBooleanFetchFacet('mandatory') },
      {
        columnId: 'uploadedBy',
        title: 'Subido por',
        fetchFacet: makeFkFetchFacet('uploadedBy', { nullLabel: 'Sin cargar' }),
      },
      { columnId: 'created_at', title: 'Fecha de carga', type: 'dateRange' as const },
      {
        columnId: 'period',
        title: 'Período',
        type: 'text' as const,
        placeholder: 'Buscar por período...',
      },
    ],
    [makeEnumFetchFacet, makeFkFetchFacet, makeBooleanFetchFacet]
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      searchParams={searchParams}
      queryFn={tableQueryFn}
      queryKey={['company-docs-general']}
      queryStaleTimeMs={5_000}
      onStateChange={handleStateChange}
      tableId={tableId}
      paramNamespace={tableId}
      facetedFilters={facetedFilters}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      showFilterToggle
      searchPlaceholder="Buscar documentos..."
      emptyMessage="No se encontraron documentos"
      enableRowSelection
      showRowSelection
      exportConfig={{
        fetchAllData: async () => unwrapExportResult(await getAllCompanyDocsForExport(currentParams)),
        options: {
          filename: 'documentos-empresa',
          sheetName: 'Documentos',
          title: 'Documentos de Empresa',
        },
        formatters: {
          state: (value) => documentListStateLabels[value as string] ?? String(value ?? ''),
          created_at: (value) => (value ? formatArgentinaDay(value as string | Date) : '-'),
          documentType: (_value, row) => (row as CompanyDocListItem).document_types?.name ?? '-',
          docType: (_value, row) =>
            (row as CompanyDocListItem).document_types?.is_it_montlhy ? 'Mensual' : 'Permanente',
          mandatory: (_value, row) => ((row as CompanyDocListItem).document_types?.mandatory ? 'Sí' : 'No'),
          uploadedBy: (_value, row) => (row as CompanyDocListItem).profile?.fullname ?? '-',
          validity: (value, row) => {
            if ((row as CompanyDocListItem).isMissing) return '-';
            if (value) return String(value);
            return (row as CompanyDocListItem).document_types?.explired ? 'Sin vencimiento' : 'No vence';
          },
          period: (value) => formatDocumentPeriod(value as string | null) ?? '-',
        },
      }}
    />
  );
}
