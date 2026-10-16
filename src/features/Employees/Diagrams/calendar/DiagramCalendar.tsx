'use client';

import { Button } from '@/components/ui/button';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useDiagramUrlFilters } from '../hooks/useDiagramUrlFilters';
import { CalendarFiltersSheet } from './components/CalendarFiltersSheet';
import { CalendarGrid } from './components/CalendarGrid';
import { CalendarGridSkeleton } from './components/CalendarGridSkeleton';
import { CalendarLegend } from './components/CalendarLegend';
import { CalendarToolbar } from './components/CalendarToolbar';
import { QuickEditSheet } from './components/QuickEditSheet';
import { useDiagramCalendarQuery } from './hooks/useDiagramCalendarQuery';
import { useDiagramFilterCatalog } from './hooks/useDiagramFilterCatalog';
import {
  countActiveListFilters,
  hasActiveFilters as hasAnyFilter,
  listCalendarDays,
  type ArrayFilterKey,
} from './utils/calendar-filters';
import { exportCalendarToExcel } from './utils/export-calendar-excel';

type EditTarget = { employeeId: string; dayKey: string };

/**
 * Calendario de diagramas (Empleados > Diagramas > Calendario): buscador, rango de fechas y filtros que aplican al
 * instante, grilla por empleado y día, y edición rápida de una casilla en un panel lateral.
 * Sin filtros ya se muestra la primera página de empleados (antes hacía falta apretar "Buscar").
 */
export default function DiagramCalendar() {
  const { filters, update, reset } = useDiagramUrlFilters();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [clearToken, setClearToken] = useState(0);

  // Mismas reglas que el servidor: crear = `new:create`, editar = `new:update`; `employees:update` habilita ambas.
  const { hasPermission } = usePermissions();
  const canEditEmployee = hasPermission('empleados', 'employees', 'update');
  const canCreate = hasPermission('empleados', 'new', 'create') || canEditEmployee;
  const canUpdate = hasPermission('empleados', 'new', 'update') || canEditEmployee;

  const activeListCount = countActiveListFilters(filters);
  const hasActiveFilters = hasAnyFilter(filters);

  const calendar = useDiagramCalendarQuery(filters);
  const { grid } = calendar;

  // Los catálogos se piden solo si hacen falta: panel abierto, edición de una casilla o chips de la URL.
  const catalog = useDiagramFilterCatalog(filtersOpen || editTarget !== null || activeListCount > 0);

  const today = argentinaDate();
  const days = useMemo(() => listCalendarDays(filters.from, filters.to, today), [filters.from, filters.to, today]);
  const legendTypes = useMemo(() => [...grid.typesById.values()], [grid.typesById]);

  const handleCellClick = useCallback((employeeId: string, dayKey: string) => {
    setEditTarget({ employeeId, dayKey });
  }, []);

  const handleListChange = (key: ArrayFilterKey, values: string[]) => update({ [key]: values });
  const handleRemoveValue = (key: ArrayFilterKey, id: string) =>
    update({ [key]: filters[key].filter((value) => value !== id) });

  const handleClearAll = () => {
    setClearToken((token) => token + 1);
    reset();
  };

  // El Excel lleva solo las filas que la grilla ya cargó (la paginación no cambia al exportar).
  const isPartial = grid.rows.length < grid.total;

  const exportMutation = useMutation({
    mutationFn: () => exportCalendarToExcel({ rows: grid.rows, days, typesById: grid.typesById, today }),
    onSuccess: () => {
      if (isPartial) {
        toast.warning(
          `Excel generado con los ${grid.rows.length} de ${grid.total} empleados cargados. Usá "Cargar más" para incluir al resto.`
        );
        return;
      }
      toast.success('Archivo Excel generado correctamente');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo generar el Excel'),
  });

  const editRow = editTarget ? grid.rowsById.get(editTarget.employeeId) ?? null : null;

  const renderBody = () => {
    if (calendar.isPending) return <CalendarGridSkeleton days={days} />;

    if (calendar.isError && !calendar.data) {
      return (
        <StateBlock
          variant="error"
          className="rounded-md border"
          title="No se pudo cargar el calendario"
          description={calendar.error instanceof Error ? calendar.error.message : undefined}
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => void calendar.refetch()}>
              Reintentar
            </Button>
          }
        />
      );
    }

    if (grid.rows.length === 0) {
      return (
        <StateBlock
          variant="empty"
          className="rounded-md border"
          title={
            hasActiveFilters ? 'Ningún empleado coincide con los filtros' : 'No hay empleados activos para mostrar'
          }
          action={
            hasActiveFilters ? (
              <Button type="button" variant="outline" size="sm" onClick={handleClearAll}>
                Limpiar filtros
              </Button>
            ) : undefined
          }
        />
      );
    }

    return (
      <div className="space-y-3">
        {calendar.isError && (
          <p role="status" className="bg-warn-subtle text-warn-subtle-foreground rounded-md px-3 py-2 text-sm">
            No se pudo actualizar el calendario: se muestran los últimos datos cargados.
          </p>
        )}
        <div
          className={calendar.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}
          aria-busy={calendar.isPlaceholderData}
        >
          <CalendarGrid
            rows={grid.rows}
            days={days}
            typesById={grid.typesById}
            canCreate={canCreate}
            canUpdate={canUpdate}
            onCellClick={handleCellClick}
          />
        </div>
        <CalendarLegend types={legendTypes} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-sm" aria-live="polite">
            Mostrando {grid.rows.length} de {grid.total} empleados
          </p>
          {calendar.hasNextPage && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void calendar.fetchNextPage()}
              disabled={calendar.isFetchingNextPage || calendar.isPlaceholderData}
            >
              {calendar.isFetchingNextPage ? 'Cargando…' : `Cargar más (${grid.rows.length} de ${grid.total})`}
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-w-0 space-y-4">
      <CalendarToolbar
        filters={filters}
        activeListCount={activeListCount}
        hasActiveFilters={hasActiveFilters}
        catalog={catalog.data}
        onSearchChange={(search) => update({ search })}
        onRangeChange={(from, to) => update({ from, to })}
        onRemoveValue={handleRemoveValue}
        onClearAll={handleClearAll}
        onOpenFilters={() => setFiltersOpen(true)}
        onExport={() => exportMutation.mutate()}
        isExporting={exportMutation.isPending}
        canExport={grid.rows.length > 0}
        exportLabel={isPartial ? `Exportar lo cargado (${grid.rows.length} de ${grid.total})` : 'Exportar a Excel'}
        clearToken={clearToken}
      />

      {renderBody()}

      <CalendarFiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        filters={filters}
        catalog={catalog.data}
        isLoading={catalog.isPending}
        isError={catalog.isError}
        onRetry={() => void catalog.refetch()}
        onChange={handleListChange}
        onClear={handleClearAll}
        hasActiveFilters={hasActiveFilters}
      />

      <QuickEditSheet
        key={editTarget ? `${editTarget.employeeId}:${editTarget.dayKey}` : 'closed'}
        row={editRow}
        dayKey={editTarget?.dayKey ?? null}
        onClose={() => setEditTarget(null)}
        diagramTypes={catalog.data?.diagramTypes}
        isLoadingTypes={catalog.isPending}
        isTypesError={catalog.isError}
        onRetryTypes={() => void catalog.refetch()}
      />
    </div>
  );
}
