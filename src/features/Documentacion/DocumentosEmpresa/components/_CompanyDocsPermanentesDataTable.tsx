'use client';

import { state as stateEnum } from '@/generated/prisma/enums';
import {
  DataTable,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
} from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { documentStateLabels } from '@/shared/utils/mappers';
import { useQuery } from '@tanstack/react-query';
import { Check, CircleOff, User, X } from 'lucide-react';
import moment from 'moment';
import { useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { getAllCompanyDocsForExport, getCompanyDocsFacets, type CompanyDocListItem } from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, documentStateIcons, getCompanyDocsColumns } from './columns';

// ============================================================================
// TYPES
// ============================================================================

interface Props {
  data: CompanyDocListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

// ============================================================================
// DEFAULT VISIBLE FILTERS
// ============================================================================

const DEFAULT_VISIBLE_FILTERS = ['state', 'documentType', 'mandatory'];

// ============================================================================
// COMPONENT
// ============================================================================

export default function _CompanyDocsPermanentesDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  // ── Leer params actuales de URL (para facets y export con filtros activos) ─
  const urlSearchParams = useSearchParams();

  // Extraer params de esta tabla desde URL (con prefijo del namespace)
  const tableUrlParams = useMemo<DataTableSearchParams>(() => {
    const prefix = `${tableId}__`;
    const params: DataTableSearchParams = {};
    urlSearchParams.forEach((value, key) => {
      if (key.startsWith(prefix)) {
        params[key.slice(prefix.length)] = value;
      }
    });
    return params;
  }, [urlSearchParams, tableId]);

  // Params para facets (solo filtros, sin page/sort)
  const facetParams = useMemo(() => {
    const {
      page: _page,
      pageSize: _pageSize,
      sort: _sort,
      sortBy: _sortBy,
      sortOrder: _sortOrder,
      ...rest
    } = tableUrlParams;
    return rest;
  }, [tableUrlParams]);

  // Params para export (todos los params activos de esta tabla)
  const exportParams = useMemo(() => tableUrlParams, [tableUrlParams]);

  // ── Facets con cross-filtering ─────────────────────────────────────────
  const { data: facets, isFetching: isFetchingFacets } = useQuery({
    queryKey: ['company-docs-permanentes-facets', facetParams],
    queryFn: () => getCompanyDocsFacets(false, facetParams),
    staleTime: 5 * 60 * 1000,
  });

  // ── Columns ───────────────────────────────────────────────────────────
  const columns = useMemo(() => getCompanyDocsColumns(false), []);

  // ── Initial column visibility ─────────────────────────────────────────
  const mergedColumnVisibility = useMemo(() => {
    const defaults: Record<string, boolean> = {};
    for (const col of HIDDEN_COLUMNS_BY_DEFAULT) {
      defaults[col] = false;
    }
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  // ── Filter visibility: prefer saved preferences, fallback to defaults ──
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    const allFilterIds = ['documentType', 'state', 'mandatory', 'uploadedBy', 'created_at'];
    return Object.fromEntries(allFilterIds.map((id) => [id, DEFAULT_VISIBLE_FILTERS.includes(id)]));
  }, [initialFilterVisibility]);

  // ── Faceted filters ───────────────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      // Estado (enum state)
      {
        columnId: 'state',
        title: 'Estado',
        options: [
          ...Object.values(stateEnum).map((value) => ({
            value,
            label: documentStateLabels[value] ?? value,
            icon: documentStateIcons[value],
          })),
          ...(facets?.state?.has(NULL_FILTER_VALUE)
            ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff }]
            : []),
        ],
        externalCounts: facets?.state,
      },

      // Tipo de documento (FK → document_types)
      {
        columnId: 'documentType',
        title: 'Tipo de documento',
        options: [
          ...(facets?.docTypeOptions?.map((dt) => ({ value: dt.id, label: dt.name ?? '' })) ?? []),
          ...(facets?.documentType?.has(NULL_FILTER_VALUE)
            ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff }]
            : []),
        ],
        externalCounts: facets?.documentType,
      },

      // Mandatorio (boolean)
      {
        columnId: 'mandatory',
        title: 'Mandatorio',
        options: [
          { value: 'true', label: 'Sí', icon: Check },
          { value: 'false', label: 'No', icon: X },
        ],
        externalCounts: facets?.mandatory,
      },

      // Subido por (FK → profile via user_id)
      {
        columnId: 'uploadedBy',
        title: 'Subido por',
        options: [
          ...(facets?.profileOptions?.map((p) => ({
            value: p.id,
            label: p.fullname ?? p.id,
            icon: User,
          })) ?? []),
          ...(facets?.uploadedBy?.has(NULL_FILTER_VALUE)
            ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff }]
            : []),
        ],
        externalCounts: facets?.uploadedBy,
      },

      // Fecha de carga (dateRange)
      {
        columnId: 'created_at',
        title: 'Fecha de carga',
        type: 'dateRange' as const,
      },
    ],
    [facets]
  );

  // ── Export config (usa los params actuales de URL para respetar filtros) ──
  const fetchAllDataForExport = useCallback(() => getAllCompanyDocsForExport(exportParams, false), [exportParams]);

  const exportConfig = useMemo(
    () => ({
      fetchAllData: fetchAllDataForExport,
      options: {
        filename: 'documentos-empresa-permanentes',
        sheetName: 'Docs Permanentes',
        title: 'Documentos de Empresa — Permanentes',
      },
      formatters: {
        state: (value: unknown) => documentStateLabels[value as string] ?? String(value ?? ''),
        mandatory: (_value: unknown, row: CompanyDocListItem) => (row.document_types?.mandatory ? 'Sí' : 'No'),
        created_at: (value: unknown) => (value ? moment(value as string | Date).format('DD/MM/YYYY') : '-'),
        validity: (_value: unknown, row: CompanyDocListItem) => {
          if (row.validity) return row.validity;
          if (!row.document_types?.explired) return 'No vence';
          return 'Pendiente';
        },
        uploadedBy: (_value: unknown, row: CompanyDocListItem) => row.profile?.fullname ?? 'Pendiente',
        documentType: (_value: unknown, row: CompanyDocListItem) => row.document_types?.name ?? '-',
      } as Record<string, (value: unknown, row: CompanyDocListItem) => string>,
    }),
    [fetchAllDataForExport]
  );

  // ── Render ────────────────────────────────────────────────────────────
  return (
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
      isFetchingFacets={isFetchingFacets}
      exportConfig={exportConfig}
      showFilterToggle
      searchPlaceholder="Documento"
      showSearch
      mobileCards
      emptyMessage="No se encontraron documentos permanentes"
      data-testid="company-docs-permanentes-table"
    />
  );
}
