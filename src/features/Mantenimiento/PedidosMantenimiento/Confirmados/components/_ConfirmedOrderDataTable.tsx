'use client';

import { ActivityHistoryModal } from '@/features/Mantenimiento/components/ActivityHistoryModal';
import {
  DataTable,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { conditionLabels } from '@/shared/utils/mappers';
import { CircleOff, Truck } from 'lucide-react';
import moment from 'moment';
import dynamic from 'next/dynamic';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { getResourceCondition, getResourceLabel, getResourceInternNumber } from '../../../shared/maintenance-resource';
import { useCallback, useMemo, useState } from 'react';
import {
  getAllConfirmedOrdersForExport,
  getConfirmedOrdersPaginated,
  getConfirmedOrdersSingleFacet,
  type ConfirmedOrderListItem,
} from '../actions.server';
import {
  CONDITION_ICONS,
  HIDDEN_COLUMNS_BY_DEFAULT,
  SOURCE_ICONS,
  SOURCE_LABELS,
  getConfirmedOrderColumns,
} from '../columns';

// Los diálogos se abren a demanda: no pesan en la carga inicial de la tabla.
const PedidoDetailDialog = dynamic(() =>
  import('../../components/PedidoDetailDialog').then((m) => m.PedidoDetailDialog)
);
const EntradaTallerDialog = dynamic(() =>
  import('../../components/EntradaTallerDialog').then((m) => m.EntradaTallerDialog)
);

// ============================================================================
// TYPES
// ============================================================================

interface Props {
  data: ConfirmedOrderListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  /** Clave de las preferencias guardadas de la tabla (`-v2`). */
  tableId: string;
  /** Prefijo de los parámetros de la URL: el mismo que usa la banda de atención para filtrar. */
  paramNamespace: string;
  canApproveWorkshopEntry: boolean;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_VISIBLE_FILTER_IDS = ['vehicle', 'condition', 'scheduled_date'];

// ============================================================================
// HELPERS — builders para reducir boilerplate en fetchFacet
// ============================================================================

/** Construye FacetResult para la columna vehicle: opciones resueltas + ícono fijo de recurso */
function buildVehicleFacetResult(
  resolvedOptions: Array<{ id: string; name: string | null }> | undefined,
  counts: Map<string, number>
): FacetResult {
  return {
    options: [
      ...(resolvedOptions?.map((o) => ({ value: o.id, label: o.name ?? '', icon: Truck })) ?? []),
      ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: 'Sin equipo', icon: CircleOff }] : []),
    ],
    counts,
  };
}

/** Construye FacetResult para condition: enum con ícono propio por valor */
function buildConditionFacetResult(counts: Map<string, number>): FacetResult {
  return {
    options: [
      ...Object.keys(conditionLabels).map((value) => ({
        value,
        label: conditionLabels[value] ?? value,
        icon: CONDITION_ICONS[value],
      })),
      ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: 'Sin condición', icon: CircleOff }] : []),
    ],
    counts,
  };
}

/** Construye FacetResult para source: enum con ícono propio por valor */
function buildSourceFacetResult(counts: Map<string, number>): FacetResult {
  return {
    options: [
      ...Object.keys(SOURCE_LABELS).map((value) => ({
        value,
        label: SOURCE_LABELS[value] ?? value,
        icon: SOURCE_ICONS[value],
      })),
      ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: 'Sin origen', icon: CircleOff }] : []),
    ],
    counts,
  };
}

// ============================================================================
// CLIENT COMPONENT
// ============================================================================

export function _ConfirmedOrderDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  paramNamespace,
  canApproveWorkshopEntry,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const [selectedOrder, setSelectedOrder] = useState<ConfirmedOrderListItem | null>(null);
  const [dialogType, setDialogType] = useState<'view' | 'workshop_entry' | null>(null);
  const [historyOrder, setHistoryOrder] = useState<ConfirmedOrderListItem | null>(null);

  // ─── Handlers de diálogos ────────────────────────────────────────────────
  const handleView = (order: ConfirmedOrderListItem) => {
    setSelectedOrder(order);
    setDialogType('view');
  };

  const handleApproveWorkshopEntry = (order: ConfirmedOrderListItem) => {
    setSelectedOrder(order);
    setDialogType('workshop_entry');
  };

  const handleCloseDialog = () => {
    setSelectedOrder(null);
    setDialogType(null);
  };

  const handleViewHistory = (order: ConfirmedOrderListItem) => {
    setHistoryOrder(order);
  };

  const handleCloseHistory = () => {
    setHistoryOrder(null);
  };

  // ─── Client-side navigation: estado reactivo para queries dependientes (export) ──
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  // queryFn para fetch client-side de datos de tabla (sin router.push, sin re-render de toda la página)
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getConfirmedOrdersPaginated(params), []);

  // ─── Columnas ────────────────────────────────────────────────────────────
  const columns = useMemo(
    () =>
      getConfirmedOrderColumns({
        onView: handleView,
        onApproveWorkshopEntry: handleApproveWorkshopEntry,
        onViewHistory: handleViewHistory,
        permissions: { canApproveWorkshopEntry },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canApproveWorkshopEntry]
  );

  // ─── Column visibility ───────────────────────────────────────────────────
  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((col) => [col, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  // ─── fetchFacet factories: cada filtro carga sus opciones+counts bajo demanda ────

  const fetchVehicleFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getConfirmedOrdersSingleFacet('vehicle', params);
    if (!result) return { options: [], counts: new Map() };
    return buildVehicleFacetResult(result.resolvedOptions, result.counts);
  }, []);

  const fetchConditionFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getConfirmedOrdersSingleFacet('condition', params);
    if (!result) return { options: [], counts: new Map() };
    return buildConditionFacetResult(result.counts);
  }, []);

  const fetchSourceFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getConfirmedOrdersSingleFacet('source', params);
    if (!result) return { options: [], counts: new Map() };
    return buildSourceFacetResult(result.counts);
  }, []);

  // ─── Filtros facetados (lazy-load — cada uno se carga al abrir su popover) ─
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      // Vehículo (FK UUID → vehicles)
      {
        columnId: 'vehicle',
        title: 'Equipo',
        fetchFacet: fetchVehicleFacet,
      },

      // Condición actual del equipo (enum condition_enum en vehicles)
      {
        columnId: 'condition',
        title: 'Condición',
        fetchFacet: fetchConditionFacet,
      },

      // Origen del pedido (facetado — campo source en maintenance_requests)
      {
        columnId: 'source',
        title: 'Origen',
        fetchFacet: fetchSourceFacet,
      },

      // Número de pedido (texto libre)
      {
        columnId: 'order_number',
        title: 'N° Orden',
        type: 'text' as const,
        placeholder: 'Buscar por N° de orden...',
      },

      // Descripción del pedido (texto libre)
      {
        columnId: 'description',
        title: 'Descripción',
        type: 'text' as const,
        placeholder: 'Buscar por descripción...',
      },

      // Fecha planificada (dateRange)
      {
        columnId: 'scheduled_date',
        title: 'Fecha Planificada',
        type: 'dateRange' as const,
      },

      // Fecha creación (dateRange) — oculto por defecto
      {
        columnId: 'created_at',
        title: 'Fecha Creación',
        type: 'dateRange' as const,
      },

      // Fecha aprobación (dateRange) — oculto por defecto
      {
        columnId: 'date_approved_at',
        title: 'Fecha Aprobación',
        type: 'dateRange' as const,
      },

      // Dominio (texto libre en vehicles)
      {
        columnId: 'domain',
        title: 'Dominio',
        type: 'text' as const,
        placeholder: 'Buscar por dominio...',
      },

      // Serie (texto libre en vehicles)
      {
        columnId: 'serie',
        title: 'Serie',
        type: 'text' as const,
        placeholder: 'Buscar por serie...',
      },

      // Número interno (texto libre en vehicles)
      {
        columnId: 'intern_number',
        title: 'N° Interno',
        type: 'text' as const,
        placeholder: 'Buscar por número interno...',
      },
    ],
    [fetchVehicleFacet, fetchConditionFacet, fetchSourceFacet]
  );

  // ─── Filter visibility ───────────────────────────────────────────────────
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTER_IDS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

  // ─── Export config ────────────────────────────────────────────────────────
  const exportConfig = useMemo(
    () => ({
      options: { filename: 'pedidos-confirmados', sheetName: 'Pedidos Confirmados' },
      // Usa currentParams (estado reactivo del client-side mode), NO searchParams (prop inicial de SSR),
      // para que la exportación respete los filtros activos en el momento del click.
      fetchAllData: async () => unwrapExportResult(await getAllConfirmedOrdersForExport(currentParams)),
      formatters: {
        vehicle: (_val: unknown, row: ConfirmedOrderListItem) => {
          const label = getResourceLabel(row);
          const internNumber = getResourceInternNumber(row);
          return internNumber ? `${label} (#${internNumber})` : label;
        },
        order_number: (val: unknown) => String(val ?? ''),
        description: (_val: unknown, row: ConfirmedOrderListItem) =>
          row.description ?? row.maintenance_requests?.description ?? '',
        date_approved_at: (val: unknown) => (val ? formatArgentinaDateTime(val as string) : ''),
        scheduled_date: (val: unknown) => (val ? moment.utc(val as string).format('DD/MM/YYYY') : ''),
        created_at: (val: unknown) => (val ? formatArgentinaDateTime(val as string) : ''),
        condition: (_val: unknown, row: ConfirmedOrderListItem) => {
          const condition = getResourceCondition(row);
          return condition ? conditionLabels[condition] ?? condition : '';
        },
        items: (_val: unknown, row: ConfirmedOrderListItem) => {
          const count = row.maintenance_order_items?.length ?? 0;
          return String(count);
        },
        source: (_val: unknown, row: ConfirmedOrderListItem) => {
          const src = row.source ?? row.maintenance_requests?.source;
          return src ? SOURCE_LABELS[src] ?? src : '';
        },
      },
    }),
    [currentParams]
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        totalRows={totalRows}
        searchParams={searchParams}
        paramNamespace={paramNamespace}
        tableId={tableId}
        mobileCards
        facetedFilters={facetedFilters}
        exportConfig={exportConfig}
        initialColumnVisibility={mergedColumnVisibility}
        initialFilterVisibility={mergedFilterVisibility}
        searchPlaceholder="Buscar por dominio, serie, N° interno o N° de orden…"
        emptyMessage="No hay pedidos confirmados"
        showFilterToggle={true}
        // Client-side navigation: fetch instantáneo vía React Query, sin router.push.
        // El primer elemento de queryKey ('maintenance-orders') coincide con el que
        // invalida `invalidateAllMaintenanceQueries` — así las acciones de fila
        // (aprobar entrada a taller) refrescan esta tabla tras su mutación.
        queryFn={tableQueryFn}
        queryKey={['maintenance-orders', 'confirmed-paginated']}
        onStateChange={handleStateChange}
      />

      {/* Diálogos de acción.

          DEUDA TECNICA sobre el `as never` de abajo: los dialogos piden
          `MaintenanceOrderData` (un `include` completo de la orden) pero esta tabla
          usa un `select` acotado. El cast silencia esa diferencia, asi que un campo
          que falte en CONFIRMED_ORDERS_SELECT no rompe el type-check: se ve vacio en
          pantalla. Al agregar un dato nuevo a estos dialogos, verificar A MANO que el
          select lo traiga. Se arregla tipando las props de los dialogos con lo que
          realmente consumen, en vez del tipo completo. */}
      {selectedOrder && dialogType === 'view' && (
        <PedidoDetailDialog order={selectedOrder as never} open={true} onClose={handleCloseDialog} />
      )}

      {selectedOrder && dialogType === 'workshop_entry' && (
        <EntradaTallerDialog order={selectedOrder as never} open={true} onClose={handleCloseDialog} />
      )}

      <ActivityHistoryModal
        open={!!historyOrder}
        onClose={handleCloseHistory}
        maintenanceOrderId={historyOrder?.id}
        maintenanceRequestId={historyOrder?.maintenance_requests?.id}
        title="Historial del Pedido"
      />
    </>
  );
}
