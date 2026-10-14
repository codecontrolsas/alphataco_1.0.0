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
import { buildEnumFacetResult } from '@/features/Mantenimiento/Gomeria/shared/facet-helpers';
import { tireTreadTypeLabels } from '@/features/Mantenimiento/Gomeria/shared/tire-mappers';
import { TireTreadType } from '@/generated/prisma/enums';
import {
  DataTable,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { toggleTireTypeActive } from '../actions/actions.server';
import {
  getTireTypeSingleFacet,
  getTireTypesForExport,
  getTireTypesPaginated,
  type TireTypeListItem,
} from '../actions/type-list.server';
import { TipoForm } from './TipoForm';
import { getColumns } from './columns';

// ============================================================================
// CONSTANTS
// ============================================================================

const TABLE_ID = 'tire-types';
const QUERY_KEY = ['tire-types-list'];
const DEFAULT_VISIBLE_FILTERS = ['tread_type', 'is_active', 'name'];
const ALL_FILTER_IDS = ['tread_type', 'is_active', 'name', 'size', 'created_at'];

// ============================================================================
// TYPES
// ============================================================================

interface TiposDataTableProps {
  data: TireTypeListItem[];
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

export default function _TiposDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: TiposDataTableProps) {
  const queryClient = useQueryClient();

  // ─── Permissions ──────────────────────────────────────────────────────────
  const permissions = useMemo(
    () => ({
      hasPermission: (module: string, tab: string, action: string) =>
        permissionsMap[`${module}:${tab}:${action}`] === true,
    }),
    [permissionsMap]
  );

  const canCreate = permissions.hasPermission('mantenimiento', 'tipos_cubiertas', 'create');

  // ─── Dialog state ─────────────────────────────────────────────────────────
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editTarget, setEditTarget] = useState<TireTypeListItem | null>(null);
  const [toggleTarget, setToggleTarget] = useState<TireTypeListItem | null>(null);
  const [isTogglePending, setIsTogglePending] = useState(false);

  // ─── Client-side navigation ───────────────────────────────────────────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getTireTypesPaginated(params), []);

  // ─── Columns ──────────────────────────────────────────────────────────────
  const columns = useMemo(
    () =>
      getColumns(
        permissions,
        (tireType) => setEditTarget(tireType),
        (tireType) => setToggleTarget(tireType)
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
  const makeEnumFetchFacet = useCallback((columnId: string, enumValues: string[], labels: Record<string, string>) => {
    return async (params: DataTableSearchParams): Promise<FacetResult> => {
      const result = await getTireTypeSingleFacet(columnId, params);
      if (!result) return { options: [], counts: new Map() };
      return buildEnumFacetResult(enumValues, labels, undefined, result.counts);
    };
  }, []);

  // ─── Faceted filters ──────────────────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      // ── tread_type (enum facet) ────────────────────────────────────────────
      {
        columnId: 'tread_type',
        title: 'Tipo de banda',
        fetchFacet: makeEnumFetchFacet('tread_type', Object.values(TireTreadType), tireTreadTypeLabels),
      },

      // ── is_active (boolean facet) ──────────────────────────────────────────
      {
        columnId: 'is_active',
        title: 'Estado',
        fetchFacet: makeEnumFetchFacet('is_active', ['true', 'false'], {
          true: 'Activo',
          false: 'Inactivo',
        }),
      },

      // ── name (text filter) ─────────────────────────────────────────────────
      {
        columnId: 'name',
        title: 'Nombre',
        type: 'text' as const,
        placeholder: 'Buscar por nombre...',
      },

      // ── size (text filter) ─────────────────────────────────────────────────
      {
        columnId: 'size',
        title: 'Medida',
        type: 'text' as const,
        placeholder: 'Buscar por medida...',
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
      Nuevo Tipo
    </Button>
  ) : undefined;

  // ─── Toggle handler ───────────────────────────────────────────────────────
  async function handleToggleConfirm() {
    if (!toggleTarget) return;
    setIsTogglePending(true);
    try {
      await toggleTireTypeActive(toggleTarget.id, !toggleTarget.is_active);
      toast.success(
        toggleTarget.is_active
          ? 'Tipo de cubierta desactivado correctamente'
          : 'Tipo de cubierta activado correctamente'
      );
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
        emptyMessage="No hay tipos registrados"
        searchPlaceholder="Buscar por nombre o medida..."
        exportConfig={{
          fetchAllData: async () => unwrapExportResult(await getTireTypesForExport(currentParams)),
          options: {
            filename: 'tipos-cubiertas',
            sheetName: 'Tipos',
            title: 'Tipos de Cubiertas',
          },
          formatters: {
            tread_type: (value) => tireTreadTypeLabels[value as string] ?? String(value),
            is_active: (value) => (value ? 'Activo' : 'Inactivo'),
            created_at: (value) => (value ? formatArgentinaDay(value as string | Date) : '-'),
            tire_count: (_value, row) => String((row._count as { tires: number })?.tires ?? 0),
          },
        }}
      />

      {/* ─── Create form ─────────────────────────────────────────────────── */}
      <TipoForm open={showCreateForm} onOpenChange={setShowCreateForm} queryKey={QUERY_KEY} />

      {/* ─── Edit form ───────────────────────────────────────────────────── */}
      <TipoForm
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        tireType={editTarget ?? undefined}
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
            <AlertDialogTitle>
              {toggleTarget?.is_active ? '¿Desactivar tipo de cubierta?' : '¿Activar tipo de cubierta?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleTarget?.is_active ? (
                <>
                  Se desactivará el tipo de cubierta <strong>{toggleTarget?.name}</strong>. Las cubiertas existentes no
                  se verán afectadas, pero este tipo no estará disponible para nuevas cubiertas.
                </>
              ) : (
                <>
                  Se activará el tipo de cubierta <strong>{toggleTarget?.name}</strong> y estará disponible para asignar
                  a cubiertas.
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
