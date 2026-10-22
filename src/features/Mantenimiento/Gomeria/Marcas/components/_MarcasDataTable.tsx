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
import { usePermissionChecker } from '@/features/Permissions/hooks/usePermissionChecker';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { buildEnumFacetResult } from '@/shared/components/common/DataTable/facet-results';
import {
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable/types';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Plus, X, type LucideIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { toggleTireBrandActive } from '../actions/actions.server';
import {
  getTireBrandSingleFacet,
  getTireBrandsForExport,
  getTireBrandsPaginated,
  type TireBrandListItem,
} from '../actions/brand-list.server';
import { MarcaForm } from './MarcaForm';
import { getColumns } from './columns';

// ============================================================================
// CONSTANTS
// ============================================================================

const TABLE_ID = 'tire-brands';
const QUERY_KEY = ['tire-brands-list'];
const DEFAULT_VISIBLE_FILTERS = ['is_active', 'name'];
const ALL_FILTER_IDS = ['is_active', 'name', 'created_at'];

// ============================================================================
// TYPES
// ============================================================================

interface MarcasDataTableProps {
  data: TireBrandListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function _MarcasDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: MarcasDataTableProps) {
  const queryClient = useQueryClient();

  // ─── Permissions ──────────────────────────────────────────────────────────
  const permissions = usePermissionChecker(permissionsMap);

  const canCreate = permissions.hasPermission('mantenimiento', 'marcas_cubiertas', 'create');

  // ─── Dialog state ─────────────────────────────────────────────────────────
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editTarget, setEditTarget] = useState<TireBrandListItem | null>(null);
  const [toggleTarget, setToggleTarget] = useState<TireBrandListItem | null>(null);
  const [isTogglePending, setIsTogglePending] = useState(false);

  // ─── Client-side navigation ───────────────────────────────────────────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getTireBrandsPaginated(params), []);

  // ─── Columns ──────────────────────────────────────────────────────────────
  const columns = useMemo(
    () =>
      getColumns(
        permissions,
        (brand) => setEditTarget(brand),
        (brand) => setToggleTarget(brand)
      ),
    [permissions]
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
        const result = await getTireBrandSingleFacet(columnId, params);
        if (!result) return { options: [], counts: new Map() };
        return buildEnumFacetResult(enumValues, labels, icons, result.counts);
      };
    },
    []
  );

  // ─── Faceted filters ──────────────────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      // ── is_active (boolean facet) ──────────────────────────────────────────
      {
        columnId: 'is_active',
        title: 'Estado',
        fetchFacet: makeEnumFetchFacet(
          'is_active',
          ['true', 'false'],
          {
            true: 'Activa',
            false: 'Inactiva',
          },
          { true: Check, false: X }
        ),
      },

      // ── name (text filter) ─────────────────────────────────────────────────
      {
        columnId: 'name',
        title: 'Nombre',
        type: 'text' as const,
        placeholder: 'Buscar por nombre...',
      },

      // ── created_at (date range filter) ─────────────────────────────────────
      {
        columnId: 'created_at',
        title: 'Creado',
        type: 'dateRange' as const,
      },
    ],
    [makeEnumFetchFacet]
  );

  // ─── Toolbar actions ──────────────────────────────────────────────────────
  const toolbarActions = canCreate ? (
    <Button variant="brand" size="sm" onClick={() => setShowCreateForm(true)}>
      <Plus className="mr-2 size-4" />
      Nueva Marca
    </Button>
  ) : undefined;

  // ─── Toggle handler ───────────────────────────────────────────────────────
  async function handleToggleConfirm() {
    if (!toggleTarget) return;
    setIsTogglePending(true);
    try {
      await toggleTireBrandActive(toggleTarget.id, !toggleTarget.is_active);
      toast.success(toggleTarget.is_active ? 'Marca desactivada correctamente' : 'Marca activada correctamente');
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['datatable-facet'] });
      setToggleTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al cambiar el estado');
    } finally {
      setIsTogglePending(false);
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
        paramNamespace={TABLE_ID}
        facetedFilters={facetedFilters}
        initialColumnVisibility={initialColumnVisibility}
        initialFilterVisibility={mergedFilterVisibility}
        toolbarActions={toolbarActions}
        showFilterToggle
        queryFn={tableQueryFn}
        queryKey={QUERY_KEY}
        onStateChange={handleStateChange}
        mobileCards
        emptyMessage="No hay marcas para mostrar. Si hay filtros aplicados, quitalos; si no, se muestran al crear la primera marca."
        searchPlaceholder="Buscar por nombre..."
        exportConfig={{
          fetchAllData: async () => unwrapExportResult(await getTireBrandsForExport(currentParams)),
          options: {
            filename: 'marcas-cubiertas',
            sheetName: 'Marcas',
            title: 'Marcas de Cubiertas',
          },
          formatters: {
            is_active: (value) => (value ? 'Activa' : 'Inactiva'),
            created_at: (value) => (value ? formatArgentinaDay(value as string | Date) : '-'),
            tire_count: (_value, row) => String((row._count as { tires: number })?.tires ?? 0),
          },
        }}
      />

      {/* ─── Create form ─────────────────────────────────────────────────── */}
      <MarcaForm open={showCreateForm} onOpenChange={setShowCreateForm} queryKey={QUERY_KEY} />

      {/* ─── Edit form ───────────────────────────────────────────────────── */}
      <MarcaForm
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        brand={editTarget ?? undefined}
        queryKey={QUERY_KEY}
      />

      {/* ─── Toggle active confirmation ──────────────────────────────────── */}
      <AlertDialog
        open={!!toggleTarget}
        onOpenChange={(open) => {
          if (!open) setToggleTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{toggleTarget?.is_active ? '¿Desactivar marca?' : '¿Activar marca?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {toggleTarget?.is_active ? (
                <>
                  Se desactivará la marca <strong>{toggleTarget?.name}</strong>. Las cubiertas existentes no se verán
                  afectadas, pero la marca no estará disponible para nuevas cubiertas.
                </>
              ) : (
                <>
                  Se activará la marca <strong>{toggleTarget?.name}</strong> y estará disponible para asignar a
                  cubiertas.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isTogglePending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggleConfirm} disabled={isTogglePending}>
              {isTogglePending ? 'Procesando...' : toggleTarget?.is_active ? 'Desactivar' : 'Activar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
