'use client';

import {
  DataTable,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import type { LucideIcon } from 'lucide-react';
import { Building2, CheckCircle2, CircleOff, Clock, Truck, User, XCircle } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import {
  getAllChecklistAnswersForExport,
  getChecklistAnswersSingleFacet,
  type ChecklistAnswerListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, checklistResultLabels, getColumns } from '../columns';
import { normalizeResult } from '../utils';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Filtros visibles por defecto — máximo 3 (las preferencias guardadas tienen prioridad). */
const DEFAULT_VISIBLE_FILTERS = ['created_at', 'result', 'equipment_id'];
const ALL_FILTER_IDS = [
  'created_at',
  'result',
  'equipment_id',
  'user_id',
  'chofer',
  'fileNumber',
  'customer_id',
  'observations',
];

const EMPTY_FACET: FacetResult = { options: [], counts: new Map() };

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  data: ChecklistAnswerListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  templateId: string;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
}

// ============================================================================
// CLIENT COMPONENT
// ============================================================================

export function _ChecklistAnswersDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  templateId,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  // Columnas ocultas por defecto
  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((col) => [col, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    return Object.fromEntries(ALL_FILTER_IDS.map((id) => [id, DEFAULT_VISIBLE_FILTERS.includes(id)]));
  }, [initialFilterVisibility]);

  // ─── fetchFacet (lazy-load: se pide al abrir cada filtro, con cross-filter en el servidor) ───

  /** Resultado: opciones fijas (con iconos) y counts normalizados; "pendiente" viaja como `NULL_FILTER_VALUE`. */
  const fetchResultFacet = useCallback(
    async (params: DataTableSearchParams): Promise<FacetResult> => {
      const result = await getChecklistAnswersSingleFacet('result', params, templateId);
      if (!result) return EMPTY_FACET;
      return {
        options: [
          { value: 'passed', label: checklistResultLabels['passed'], icon: CheckCircle2 },
          { value: 'failed', label: checklistResultLabels['failed'], icon: XCircle },
          { value: NULL_FILTER_VALUE, label: checklistResultLabels['pending'], icon: Clock },
        ],
        counts: result.counts,
      };
    },
    [templateId]
  );

  /** FK con nombres resueltos por el servidor; todas las opciones comparten el icono del tipo de recurso. */
  const makeFkFetchFacet = useCallback(
    (columnId: string, icon: LucideIcon, nullLabel: string) => {
      return async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getChecklistAnswersSingleFacet(columnId, params, templateId);
        if (!result) return EMPTY_FACET;
        const options = (result.resolvedOptions ?? [])
          .map((o) => ({ value: o.id, label: o.name ?? '', icon }))
          .sort((a, b) => a.label.localeCompare(b.label));
        if (result.counts.has(NULL_FILTER_VALUE)) {
          options.push({ value: NULL_FILTER_VALUE, label: nullLabel, icon: CircleOff });
        }
        return { options, counts: result.counts };
      };
    },
    [templateId]
  );

  // ─── Filtros facetados ──────────────────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      { columnId: 'created_at', title: 'Fecha', type: 'dateRange' as const },
      { columnId: 'result', title: 'Resultado', fetchFacet: fetchResultFacet },
      { columnId: 'equipment_id', title: 'Equipo', fetchFacet: makeFkFetchFacet('equipment_id', Truck, 'Sin equipo') },
      { columnId: 'user_id', title: 'Usuario', fetchFacet: makeFkFetchFacet('user_id', User, 'Sin usuario') },
      { columnId: 'chofer', title: 'Chofer', fetchFacet: makeFkFetchFacet('chofer', User, 'Sin chofer') },
      {
        columnId: 'fileNumber',
        title: 'Legajo',
        type: 'text' as const,
        placeholder: 'Legajo exacto del chofer...',
      },
      {
        columnId: 'customer_id',
        title: 'Cliente',
        fetchFacet: makeFkFetchFacet('customer_id', Building2, 'Sin cliente'),
      },
      { columnId: 'observations', title: 'Observaciones', type: 'text' as const },
    ],
    [fetchResultFacet, makeFkFetchFacet]
  );

  // ─── Columnas ────────────────────────────────────────────────────────────────
  const columns = useMemo(() => getColumns(templateId), [templateId]);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      searchParams={searchParams}
      searchPlaceholder="Buscar respuestas..."
      facetedFilters={facetedFilters}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      tableId={tableId}
      paramNamespace={tableId}
      showFilterToggle={true}
      emptyMessage="No hay respuestas registradas para este checklist"
      data-testid="checklist-answers-table"
      exportConfig={{
        fetchAllData: async () => unwrapExportResult(await getAllChecklistAnswersForExport(searchParams, templateId)),
        options: {
          filename: 'respuestas-checklist',
          title: 'Respuestas de Checklist',
          sheetName: 'Respuestas',
        },
        formatters: {
          created_at: (val) => (val ? formatArgentinaDay(val as string | Date) : ''),
          result: (val) => {
            const normalized = normalizeResult(val as string | null);
            return checklistResultLabels[normalized] ?? String(val ?? '');
          },
          observations: (val) => String(val ?? ''),
          kilometraje: (val) => (val != null ? String(val) : ''),
          horometro: (val) => (val != null ? String(val) : ''),
          // El export lleva el nombre del cliente (como la celda), no el UUID.
          customer_id: (_val, row) => {
            const answerData = row.answer_data as Record<string, string> | null;
            return answerData?.customer_name ?? '';
          },
        },
      }}
    />
  );
}
