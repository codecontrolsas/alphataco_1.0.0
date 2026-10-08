'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { buildEnumFacetResult, buildFkFacetResult } from '@/features/Mantenimiento/Gomeria/shared/facet-helpers';
import {
  tireRetreadLabels,
  tireStatusLabels,
  tireTreadTypeLabels,
} from '@/features/Mantenimiento/Gomeria/shared/tire-mappers';
import { TireRetreadLevel, TireStatus, TireTreadType } from '@/generated/prisma/enums';
import {
  DataTable,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { unwrapAction } from '@/features/Warehouses/lib/unwrap-action';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import { Layers, Plus } from 'lucide-react';
import moment from 'moment';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  deleteTire,
  getTireSingleFacet,
  getTiresForExport,
  getTiresPaginated,
  updateTireStatus,
  type TireListItem,
} from '../actions/actions.server';
import { TireBulkForm } from './TireBulkForm';
import { TireForm } from './TireForm';
import { TireReturnDialog } from './TireReturnDialog';
import { getColumns, getTireWarehouseLabel } from './columns';

// ============================================================================
// TYPES
// ============================================================================

interface TiresDataTableProps {
  data: TireListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

// ============================================================================
// DEFAULT VISIBLE FILTERS
// ============================================================================

const DEFAULT_VISIBLE_FILTERS = ['status', 'brand_id', 'tread_type'];

const ALL_FILTER_IDS = [
  'status',
  'brand_id',
  'tread_type',
  'is_new',
  'retread_level',
  'vehicle',
  'warehouse',
  'serial_number',
  'size',
  'created_at',
];

// ============================================================================
// COMPONENT
// ============================================================================

export default function _TiresDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: TiresDataTableProps) {
  // ─── Permissions ──────────────────────────────────────────────────────────
  const permissions = useMemo(
    () => ({
      hasPermission: (module: string, tab: string, action: string) =>
        permissionsMap[`${module}:${tab}:${action}`] === true,
    }),
    [permissionsMap]
  );

  const canCreate = permissions.hasPermission('mantenimiento', 'catalogo_cubiertas', 'create');
  const canViewPrices = permissions.hasPermission('almacenes', 'movimientos', 'view_prices');

  // ─── Query client ─────────────────────────────────────────────────────────
  const queryClient = useQueryClient();

  // ─── Dialog state ─────────────────────────────────────────────────────────
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [editingTire, setEditingTire] = useState<TireListItem | null>(null);
  const [deletingTire, setDeletingTire] = useState<TireListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ─── Client-side navigation ───────────────────────────────────────────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getTiresPaginated(params), []);

  // ─── Mark as found / repaired (vuelve a disponible; con stock afuera pide el depósito) ───
  const [returningTire, setReturningTire] = useState<TireListItem | null>(null);

  const markAvailableMutation = useMutation({
    mutationFn: async ({ tire, warehouseId }: { tire: TireListItem; warehouseId: string | null }) => {
      unwrapAction(await updateTireStatus(tire.id, 'AVAILABLE', warehouseId));
      return tire;
    },
    onSuccess: (tire) => {
      toast.success(`Cubierta ${tire.serial_number} marcada como disponible`);
      queryClient.invalidateQueries({ queryKey: ['tires-catalog'] });
      setReturningTire(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Error al actualizar estado');
    },
  });
  const { mutate: markAvailable } = markAvailableMutation;

  const handleMarkAvailable = useCallback(
    (tire: TireListItem) => {
      if (tire.material_unit?.status === 'OUT') {
        setReturningTire(tire);
        return;
      }
      markAvailable({ tire, warehouseId: null });
    },
    [markAvailable]
  );

  // ─── Columns ──────────────────────────────────────────────────────────────
  const columns = useMemo(
    () =>
      getColumns(
        permissions,
        (tire) => setEditingTire(tire),
        (tire) => setDeletingTire(tire),
        handleMarkAvailable,
        handleMarkAvailable,
        canViewPrices
      ),
    [permissions, handleMarkAvailable, canViewPrices]
  );

  // ─── Filter visibility ────────────────────────────────────────────────────
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    return Object.fromEntries(ALL_FILTER_IDS.map((id) => [id, DEFAULT_VISIBLE_FILTERS.includes(id)]));
  }, [initialFilterVisibility]);

  // ─── fetchFacet factories ─────────────────────────────────────────────────

  const makeEnumFetchFacet = useCallback(
    (
      columnId: string,
      enumValues: string[],
      labels: Record<string, string>,
      icons?: Record<string, LucideIcon | undefined>
    ) => {
      return async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getTireSingleFacet(columnId, params);
        if (!result) return { options: [], counts: new Map() };
        return buildEnumFacetResult(enumValues, labels, icons, result.counts);
      };
    },
    []
  );

  const makeFkFetchFacet = useCallback((columnId: string, nullLabel = 'Sin asignar') => {
    return async (params: DataTableSearchParams): Promise<FacetResult> => {
      const result = await getTireSingleFacet(columnId, params);
      if (!result) return { options: [], counts: new Map() };
      return buildFkFacetResult(result.resolvedOptions, result.counts, nullLabel);
    };
  }, []);

  // ─── Faceted filters ──────────────────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      // ── Status (enum) ──────────────────────────────────────────────────────
      {
        columnId: 'status',
        title: 'Estado',
        fetchFacet: makeEnumFetchFacet('status', Object.values(TireStatus), tireStatusLabels),
      },

      // ── Brand (FK UUID) ────────────────────────────────────────────────────
      {
        columnId: 'brand_id',
        title: 'Marca',
        fetchFacet: makeFkFetchFacet('brand_id'),
      },

      // ── Tread type (enum) ──────────────────────────────────────────────────
      {
        columnId: 'tread_type',
        title: 'Tipo de banda',
        fetchFacet: makeEnumFetchFacet('tread_type', Object.values(TireTreadType), tireTreadTypeLabels),
      },

      // ── Is new (boolean) ──────────────────────────────────────────────────
      {
        columnId: 'is_new',
        title: 'Condición',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getTireSingleFacet('is_new', params);
          if (!result) return { options: [], counts: new Map() };
          return {
            options: [
              { value: 'true', label: 'Nueva' },
              { value: 'false', label: 'Usada' },
            ],
            counts: result.counts,
          };
        },
      },

      // ── Retread level (enum nullable) ─────────────────────────────────────
      {
        columnId: 'retread_level',
        title: 'Precurado',
        fetchFacet: makeEnumFetchFacet('retread_level', Object.values(TireRetreadLevel), tireRetreadLabels),
      },

      // ── Vehicle (FK via positions) ────────────────────────────────────────
      {
        columnId: 'vehicle',
        title: 'Vehículo',
        fetchFacet: makeFkFetchFacet('vehicle', 'Sin asignar'),
      },

      // ── Warehouse (FK via stock unit) ─────────────────────────────────────
      {
        columnId: 'warehouse',
        title: 'Depósito',
        fetchFacet: makeFkFetchFacet('warehouse', 'Sin depósito'),
      },

      // ── Text filters ──────────────────────────────────────────────────────
      { columnId: 'serial_number', title: 'Número', type: 'text' as const, placeholder: 'Buscar por número...' },
      { columnId: 'size', title: 'Medida', type: 'text' as const, placeholder: 'Buscar por medida...' },

      // ── Date range filters ────────────────────────────────────────────────
      { columnId: 'created_at', title: 'Fecha de alta', type: 'dateRange' as const },
    ],
    [makeEnumFetchFacet, makeFkFetchFacet]
  );

  // ─── Toolbar actions ──────────────────────────────────────────────────────
  const toolbarActions = canCreate ? (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => setShowBulkForm(true)}>
        <Layers className="mr-2 size-4" />
        Alta masiva
      </Button>
      <Button variant="brand" size="sm" onClick={() => setShowCreateForm(true)}>
        <Plus className="mr-2 size-4" />
        Agregar cubierta
      </Button>
    </div>
  ) : undefined;

  // ─── Delete handler ───────────────────────────────────────────────────────
  async function handleDeleteConfirm() {
    if (!deletingTire) return;
    setIsDeleting(true);
    try {
      unwrapAction(await deleteTire(deletingTire.id));
      toast.success('Cubierta eliminada correctamente');
      queryClient.invalidateQueries({ queryKey: ['tires-catalog'] });
      setDeletingTire(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al eliminar la cubierta');
    } finally {
      setIsDeleting(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        totalRows={totalRows}
        searchParams={searchParams}
        tableId={tableId}
        paramNamespace={tableId}
        facetedFilters={facetedFilters}
        initialColumnVisibility={initialColumnVisibility}
        initialFilterVisibility={mergedFilterVisibility}
        toolbarActions={toolbarActions}
        showFilterToggle
        queryFn={tableQueryFn}
        queryKey={['tires-catalog']}
        onStateChange={handleStateChange}
        emptyMessage="No hay cubiertas registradas"
        searchPlaceholder="Buscar por número o medida..."
        exportConfig={{
          fetchAllData: () => getTiresForExport(currentParams),
          options: {
            filename: 'catalogo-cubiertas',
            sheetName: 'Cubiertas',
            title: 'Catálogo de Cubiertas',
          },
          formatters: {
            status: (value) => tireStatusLabels[value as string] ?? String(value),
            retread_level: (value) => (value ? tireRetreadLabels[value as string] ?? String(value) : '-'),
            tread_type: (_value, row) =>
              row.tire_type?.tread_type
                ? tireTreadTypeLabels[row.tire_type.tread_type] ?? row.tire_type.tread_type
                : '-',
            size: (_value, row) => row.tire_type?.size ?? '-',
            is_new: (value) => (value ? 'Nueva' : 'Usada'),
            tread_depth: (value) => (value != null ? `${value} mm` : '-'),
            created_at: (value) => (value ? moment(value as string | Date).format('DD/MM/YYYY') : '-'),
            warehouse: (_value, row) => getTireWarehouseLabel(row.material_unit),
            cost: (value) => (value != null ? formatMoney(value as string) : 'Sin costo'),
            vehicle: (_value, row) => {
              return row.vehicle_tire_positions?.[0]?.vehicle?.domain ?? 'Sin asignar';
            },
            brand_id: (_value, row) => row.brand?.name ?? '-',
          },
        }}
      />

      {/* ─── Create single tire form ─────────────────────────────────────── */}
      <TireForm open={showCreateForm} onOpenChange={setShowCreateForm} queryKey={['tires-catalog']} />

      {/* ─── Edit tire form (conditional mount to reset useForm defaults) ── */}
      {editingTire !== null && (
        <TireForm
          open
          onOpenChange={(open) => {
            if (!open) setEditingTire(null);
          }}
          tire={editingTire}
          queryKey={['tires-catalog']}
        />
      )}

      {/* ─── Bulk create form ────────────────────────────────────────────── */}
      <TireBulkForm open={showBulkForm} onOpenChange={setShowBulkForm} queryKey={['tires-catalog']} />

      {/* ─── Devolver al depósito (reparada / encontrada con stock afuera) ─ */}
      {returningTire !== null && (
        <TireReturnDialog
          serialNumber={returningTire.serial_number}
          isPending={markAvailableMutation.isPending}
          onConfirm={(warehouseId) => markAvailable({ tire: returningTire, warehouseId })}
          onCancel={() => setReturningTire(null)}
        />
      )}

      {/* ─── Delete confirmation dialog ──────────────────────────────────── */}
      <AlertDialog
        open={deletingTire !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingTire(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cubierta?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la cubierta <strong>{deletingTire?.serial_number}</strong>. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
