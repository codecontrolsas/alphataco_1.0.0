'use client';

import { DataTable } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type {
  DataTableFacetedFilterConfig,
  DataTableFilterOption,
  DataTableSearchParams,
  FacetResult,
} from '@/shared/components/common/DataTable/types';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { AlertTriangle, Check, CheckCircle2, CircleOff, Stethoscope, X, XCircle } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { OPEN_WORK_ORDER_STATUSES } from '../workshop-view-filters';
import {
  getAllWorkshopSectorWorkOrdersForExport,
  getWorkshopSectorWorkOrdersPaginated,
  getWorkshopSectorWorkOrdersSingleFacet,
  type WorkshopSectorWorkOrderListItem,
} from './actions.server';
import {
  HIDDEN_COLUMNS_BY_DEFAULT,
  IS_CRITICAL_LABELS,
  IS_DIAGNOSTICO_LABELS,
  IS_REJECTED_LABELS,
  MO_STATUS_CONFIG,
  WO_STATUS_CONFIG,
  getWorkshopSectorWorkOrdersColumns,
  getWorkshopSectorWorkOrdersExportFormatters,
} from './columns';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_VISIBLE_FILTERS = ['wo_status', 'repair_type', 'is_critical'];

/** Columnas virtuales que sólo existen para colgarles un filtro (Estado OT y Crítica son columnas visibles) */
const FILTER_ONLY_COLUMNS = ['mo_status', 'repair_type', 'is_rejected', 'is_diagnostico'];

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  sectorId: string;
  data: WorkshopSectorWorkOrderListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  /** Clave de las preferencias guardadas (lleva el sufijo `-v2`). */
  tableId: string;
  /** Prefijo de los parámetros de la URL: NO lleva el sufijo, así los links existentes siguen funcionando. */
  paramNamespace: string;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

// ============================================================================
// HELPERS — builders para FacetResult
// ============================================================================

/** Construye FacetResult para enums: opciones estáticas + counts del servidor */
function buildEnumFacetResult(options: DataTableFilterOption[], counts: Map<string, number>): FacetResult {
  return { options, counts };
}

/** Construye FacetResult para FK/relaciones: opciones resueltas del servidor + counts */
function buildFkFacetResult(
  resolvedOptions: Array<{ id: string; name: string | null }> | undefined,
  counts: Map<string, number>,
  nullLabel = 'Sin asignar'
): FacetResult {
  return {
    options: [
      ...(resolvedOptions?.map((option) => ({ value: option.id, label: option.name ?? '' })) ?? []),
      ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: nullLabel, icon: CircleOff }] : []),
    ],
    counts,
  };
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Tabla de ÓRDENES DE TRABAJO de un sector de taller (ticket 678).
 *
 * Una fila = una OT = una unidad. La cantidad de tareas va en su propia columna
 * y el detalle se abre con el botón "Ver" de la columna de acciones.
 */
export function _WorkshopSectorTasksDataTable({
  sectorId,
  data,
  totalRows,
  searchParams,
  tableId,
  paramNamespace,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  // ── State para client-side navigation (export con filtros activos) ─────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  // ── Query fn estable para client-side navigation mode ─────────────────────
  const tableQueryFn = useCallback(
    (params: DataTableSearchParams) => getWorkshopSectorWorkOrdersPaginated(sectorId, params),
    [sectorId]
  );

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns = useMemo(() => getWorkshopSectorWorkOrdersColumns(), []);

  // ── fetchFacet factories: lazy-load por columna ────────────────────────────

  /** Filtros enum: opciones estáticas con iconos + counts del servidor */
  const makeEnumFetchFacet = useCallback(
    (columnId: string, staticOptions: DataTableFilterOption[]) => {
      return async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getWorkshopSectorWorkOrdersSingleFacet(columnId, sectorId, params);
        if (!result) return { options: staticOptions, counts: new Map() };
        return buildEnumFacetResult(staticOptions, result.counts);
      };
    },
    [sectorId]
  );

  /** Filtros FK: opciones resueltas por el servidor + counts */
  const makeFkFetchFacet = useCallback(
    (columnId: string, nullLabel = 'Sin asignar') => {
      return async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getWorkshopSectorWorkOrdersSingleFacet(columnId, sectorId, params);
        if (!result) return { options: [], counts: new Map() };
        return buildFkFacetResult(result.resolvedOptions, result.counts, nullLabel);
      };
    },
    [sectorId]
  );

  // Estado OT: sólo los estados abiertos — la Vista Taller nunca muestra OT
  // cerradas, así que ofrecerlas sería ofrecer filtros que siempre dan cero.
  const woStatusStaticOptions = useMemo<DataTableFilterOption[]>(
    () =>
      OPEN_WORK_ORDER_STATUSES.map((value) => ({
        value,
        label: WO_STATUS_CONFIG[value]?.label ?? value,
        icon: WO_STATUS_CONFIG[value]?.icon,
      })),
    []
  );

  const moStatusStaticOptions = useMemo<DataTableFilterOption[]>(
    () =>
      Object.entries(MO_STATUS_CONFIG).map(([value, cfg]) => ({
        value,
        label: cfg.label,
        icon: cfg.icon,
      })),
    []
  );

  const isCriticalStaticOptions = useMemo<DataTableFilterOption[]>(
    () => [
      { value: 'true', label: IS_CRITICAL_LABELS['true'], icon: AlertTriangle },
      { value: 'false', label: IS_CRITICAL_LABELS['false'], icon: Check },
    ],
    []
  );

  const isRejectedStaticOptions = useMemo<DataTableFilterOption[]>(
    () => [
      { value: 'true', label: IS_REJECTED_LABELS['true'], icon: XCircle },
      { value: 'false', label: IS_REJECTED_LABELS['false'], icon: CheckCircle2 },
    ],
    []
  );

  const isDiagnosticoStaticOptions = useMemo<DataTableFilterOption[]>(
    () => [
      { value: 'true', label: IS_DIAGNOSTICO_LABELS['true'], icon: Stethoscope },
      { value: 'false', label: IS_DIAGNOSTICO_LABELS['false'], icon: X },
    ],
    []
  );

  // ── Faceted Filters con lazy-load ──────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      {
        columnId: 'wo_status',
        title: 'Estado OT',
        fetchFacet: makeEnumFetchFacet('wo_status', woStatusStaticOptions),
      },
      {
        columnId: 'vehicle',
        title: 'Equipo',
        fetchFacet: makeFkFetchFacet('vehicle', 'Sin equipo'),
      },
      {
        columnId: 'repair_type',
        title: 'Tipo de Reparación',
        fetchFacet: makeFkFetchFacet('repair_type', 'Sin tipo'),
      },
      {
        columnId: 'mo_status',
        title: 'Estado OM',
        fetchFacet: makeEnumFetchFacet('mo_status', moStatusStaticOptions),
      },
      {
        columnId: 'is_critical',
        title: 'Crítica',
        fetchFacet: makeEnumFetchFacet('is_critical', isCriticalStaticOptions),
      },
      {
        columnId: 'is_rejected',
        title: 'Rechazada',
        fetchFacet: makeEnumFetchFacet('is_rejected', isRejectedStaticOptions),
      },
      {
        columnId: 'is_diagnostico',
        title: 'Diagnóstico',
        fetchFacet: makeEnumFetchFacet('is_diagnostico', isDiagnosticoStaticOptions),
      },
      {
        columnId: 'planned_start_date',
        title: 'Inicio Plan.',
        type: 'dateRange' as const,
      },
      {
        columnId: 'planned_end_date',
        title: 'Fin Plan.',
        type: 'dateRange' as const,
      },
      {
        columnId: 'started_at',
        title: 'Iniciada el',
        type: 'dateRange' as const,
      },
      {
        columnId: 'created_at',
        title: 'Creada el',
        type: 'dateRange' as const,
      },
      {
        columnId: 'work_order',
        title: 'N° OT',
        type: 'text' as const,
        placeholder: 'Buscar por N° OT...',
      },
      {
        columnId: 'maintenance_order',
        title: 'N° OM',
        type: 'text' as const,
        placeholder: 'Buscar por N° OM...',
      },
    ],
    [
      makeEnumFetchFacet,
      makeFkFetchFacet,
      woStatusStaticOptions,
      moStatusStaticOptions,
      isCriticalStaticOptions,
      isRejectedStaticOptions,
      isDiagnosticoStaticOptions,
    ]
  );

  // ── Filter visibility ─────────────────────────────────────────────────────
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

  // ── Column visibility ─────────────────────────────────────────────────────
  const mergedColumnVisibility = useMemo(
    () => ({
      ...Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((c) => [c, false])),
      // Columnas virtuales de filtro: siempre ocultas
      ...Object.fromEntries(FILTER_ONLY_COLUMNS.map((c) => [c, false])),
      // Las preferencias guardadas tienen prioridad sobre los defaults
      ...(initialColumnVisibility ?? {}),
    }),
    [initialColumnVisibility]
  );

  // ── Export config ─────────────────────────────────────────────────────────
  const exportFormatters = useMemo(() => getWorkshopSectorWorkOrdersExportFormatters(), []);

  const exportConfig = useMemo(
    () => ({
      options: {
        filename: `ot-sector-${sectorId.slice(0, 8)}`,
        sheetName: 'Órdenes de trabajo',
      },
      fetchAllData: async () => unwrapExportResult(await getAllWorkshopSectorWorkOrdersForExport(sectorId, currentParams)),
      formatters: exportFormatters,
    }),
    [sectorId, currentParams, exportFormatters]
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      searchParams={searchParams}
      queryFn={tableQueryFn}
      queryKey={['workshop-sector-work-orders', sectorId]}
      onStateChange={handleStateChange}
      tableId={tableId}
      paramNamespace={paramNamespace}
      mobileCards
      searchPlaceholder="Buscar por N° OT, N° OM o descripción de la tarea..."
      emptyMessage="No hay órdenes de trabajo abiertas en este sector. Si esperabas ver alguna, revisá los filtros activos."
      showFilterToggle={true}
      facetedFilters={facetedFilters}
      exportConfig={exportConfig}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      data-testid={`workshop-sector-work-orders-table-${sectorId}`}
    />
  );
}
