'use client';

import { documentListStateLabels as documentStateLabels } from '@/features/Documentacion/shared/components/DocumentCells';
import { state as stateEnum } from '@/generated/prisma/enums';
import {
  DataTable,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { User } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import {
  getAllCompanyDocsForExport,
  getCompanyDocsPaginated,
  getCompanyDocsSingleFacet,
  type CompanyDocListItem,
} from '../actions.server';
import { buildBooleanFacetResult, buildEnumFacetResult, buildFkFacetResult } from '../lib/facet-results';
import { HIDDEN_COLUMNS_BY_DEFAULT, documentStateIcons, getCompanyDocsColumns } from './columns';

// ============================================================================
// TYPES
// ============================================================================

interface Props {
  data: CompanyDocListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  /** `true`: documentos mensuales (con columna y filtro de período); `false`: permanentes. */
  isMonthly: boolean;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Filtros visibles por defecto (3), según la pestaña. */
const DEFAULT_VISIBLE_FILTERS = {
  monthly: ['state', 'documentType', 'period'],
  permanent: ['state', 'documentType', 'mandatory'],
} as const;

const STATE_VALUES = Object.values(stateEnum);

// ============================================================================
// COMPONENT
// ============================================================================

export default function _CompanyDocsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  isMonthly,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  // ── Client-side navigation: params actuales de la tabla (para exportar con los filtros activos) ──
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);
  const handleStateChange = useCallback((params: DataTableSearchParams) => setCurrentParams(params), []);

  const tableQueryFn = useCallback(
    (params: DataTableSearchParams) => getCompanyDocsPaginated(params, isMonthly),
    [isMonthly]
  );

  // ── Columns ───────────────────────────────────────────────────────────
  const columns = useMemo(() => getCompanyDocsColumns(isMonthly), [isMonthly]);

  // ── Column visibility: defaults + preferencias guardadas ──────────────
  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((col) => [col, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  // ── Filter visibility: preferencias guardadas, o los 3 por defecto ────
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    const visible: readonly string[] = isMonthly ? DEFAULT_VISIBLE_FILTERS.monthly : DEFAULT_VISIBLE_FILTERS.permanent;
    const allFilterIds = [
      'documentType',
      'state',
      'mandatory',
      'uploadedBy',
      'created_at',
      ...(isMonthly ? ['period'] : []),
    ];
    return Object.fromEntries(allFilterIds.map((id) => [id, visible.includes(id)]));
  }, [initialFilterVisibility, isMonthly]);

  // ── fetchFacet factories (lazy-load al abrir cada filtro) ─────────────
  const makeEnumFetchFacet = useCallback(
    (columnId: string) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getCompanyDocsSingleFacet(columnId, isMonthly, params);
        return buildEnumFacetResult(STATE_VALUES, documentStateLabels, documentStateIcons, result.counts);
      },
    [isMonthly]
  );

  const makeFkFetchFacet = useCallback(
    (columnId: string, options?: Parameters<typeof buildFkFacetResult>[2]) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getCompanyDocsSingleFacet(columnId, isMonthly, params);
        return buildFkFacetResult(result.resolvedOptions, result.counts, options);
      },
    [isMonthly]
  );

  const makeBooleanFetchFacet = useCallback(
    (columnId: string) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getCompanyDocsSingleFacet(columnId, isMonthly, params);
        return buildBooleanFacetResult(result.counts);
      },
    [isMonthly]
  );

  // ── Faceted filters ───────────────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      { columnId: 'state', title: 'Estado', fetchFacet: makeEnumFetchFacet('state') },
      { columnId: 'documentType', title: 'Tipo de documento', fetchFacet: makeFkFetchFacet('documentType') },
      { columnId: 'mandatory', title: 'Mandatorio', fetchFacet: makeBooleanFetchFacet('mandatory') },
      { columnId: 'uploadedBy', title: 'Subido por', fetchFacet: makeFkFetchFacet('uploadedBy', { icon: User }) },
      // Período (texto libre — solo mensuales)
      ...(isMonthly
        ? [
            {
              columnId: 'period',
              title: 'Período',
              type: 'text' as const,
              placeholder: 'Buscar por período...',
            },
          ]
        : []),
      { columnId: 'created_at', title: 'Fecha de carga', type: 'dateRange' as const },
    ],
    [isMonthly, makeEnumFetchFacet, makeFkFetchFacet, makeBooleanFetchFacet]
  );

  // ── Export config (usa los params actuales para respetar los filtros) ─
  const exportConfig = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllCompanyDocsForExport(currentParams, isMonthly)),
      options: isMonthly
        ? {
            filename: 'documentos-empresa-mensuales',
            sheetName: 'Docs Mensuales',
            title: 'Documentos de Empresa — Mensuales',
          }
        : {
            filename: 'documentos-empresa-permanentes',
            sheetName: 'Docs Permanentes',
            title: 'Documentos de Empresa — Permanentes',
          },
      formatters: {
        state: (value: unknown) => documentStateLabels[value as string] ?? String(value ?? ''),
        mandatory: (_value: unknown, row: CompanyDocListItem) => (row.document_types?.mandatory ? 'Sí' : 'No'),
        // Timestamp: se muestra el día en hora argentina (no el del servidor ni el del navegador).
        created_at: (value: unknown) => (value ? formatArgentinaDay(value as string | Date) : '-'),
        validity: (_value: unknown, row: CompanyDocListItem) => {
          if (row.validity) return row.validity;
          if (!row.document_types?.explired) return 'No vence';
          return 'Pendiente';
        },
        uploadedBy: (_value: unknown, row: CompanyDocListItem) => row.profile?.fullname ?? 'Pendiente',
        documentType: (_value: unknown, row: CompanyDocListItem) => row.document_types?.name ?? '-',
        period: (value: unknown) => (value as string | null) ?? '-',
      } as Record<string, (value: unknown, row: CompanyDocListItem) => string>,
    }),
    [currentParams, isMonthly]
  );

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      searchParams={searchParams}
      queryFn={tableQueryFn}
      queryKey={['company-docs', isMonthly ? 'monthly' : 'permanent']}
      queryStaleTimeMs={5_000}
      onStateChange={handleStateChange}
      tableId={tableId}
      paramNamespace={tableId}
      facetedFilters={facetedFilters}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      exportConfig={exportConfig}
      showFilterToggle
      searchPlaceholder="Documento"
      showSearch
      mobileCards
      emptyMessage={isMonthly ? 'No se encontraron documentos mensuales' : 'No se encontraron documentos permanentes'}
      data-testid={isMonthly ? 'company-docs-mensuales-table' : 'company-docs-permanentes-table'}
    />
  );
}
