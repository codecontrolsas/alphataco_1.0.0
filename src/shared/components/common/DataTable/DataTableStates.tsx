'use client';

import { CircleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/shared/components/feedback/EmptyState';

import type { DataTableViewStateProps } from './types';

const SKELETON_ROW_COUNT = 10;

/** Anchos distintos por columna para que el skeleton no parezca una grilla de barras idénticas. */
const SKELETON_WIDTHS = ['w-3/4', 'w-1/2', 'w-2/3', 'w-5/6', 'w-2/5'];

/**
 * Cuerpo del estado vacío (sin `<tr>`): sirve igual dentro de un `<td colSpan>` de la tabla o de la lista de
 * tarjetas. Con filtros o búsqueda activos muestra "Sin resultados" con la acción de limpiar; sin filtros,
 * el `emptyMessage` de la tabla (no se inventa un "por qué" genérico: la condición real la conoce el consumidor).
 */
export function DataTableEmptyContent({
  hasActiveFilters,
  onClearFilters,
  emptyMessage = 'No se encontraron resultados.',
  emptyDescription,
}: Pick<DataTableViewStateProps, 'hasActiveFilters' | 'onClearFilters' | 'emptyMessage' | 'emptyDescription'>) {
  if (hasActiveFilters) {
    return (
      <EmptyState
        variant="filtered"
        size="default"
        title="Sin resultados para los filtros aplicados"
        description=""
        className="[&_p:empty]:hidden"
        action={
          onClearFilters ? (
            <Button type="button" variant="secondary" size="sm" onClick={onClearFilters}>
              Limpiar filtros
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <EmptyState
      variant="empty"
      size="default"
      title={emptyMessage}
      description={emptyDescription ?? ''}
      className="[&_p:empty]:hidden"
    />
  );
}

/** Fila de tabla con el estado vacío ocupando todas las columnas visibles. */
export function DataTableEmptyRow({
  colSpan,
  ...viewState
}: { colSpan: number } & Pick<
  DataTableViewStateProps,
  'hasActiveFilters' | 'onClearFilters' | 'emptyMessage' | 'emptyDescription'
>) {
  return (
    <tr data-slot="table-row" data-testid="table-empty-state">
      <td colSpan={colSpan} className="p-0">
        <DataTableEmptyContent {...viewState} />
      </td>
    </tr>
  );
}

/** Carga inicial: 10 filas de 36px con barras `animate-pulse`. Nunca se confunde con "sin resultados". */
export function DataTableSkeletonRows({
  columnCount,
  rowCount = SKELETON_ROW_COUNT,
}: {
  columnCount: number;
  rowCount?: number;
}) {
  return Array.from({ length: rowCount }, (_, rowIndex) => (
    <tr key={rowIndex} data-slot="table-row" aria-hidden="true" className="h-9 border-b border-border">
      {Array.from({ length: Math.max(columnCount, 1) }, (_, colIndex) => (
        <td key={colIndex} className="px-3 py-0 align-middle">
          <div
            className={cn(
              'h-3 animate-pulse bg-muted motion-reduce:animate-none',
              SKELETON_WIDTHS[(rowIndex + colIndex) % SKELETON_WIDTHS.length]
            )}
          />
        </td>
      ))}
    </tr>
  ));
}

/** Callout de error de la consulta. Si había datos, se siguen viendo debajo. Sin autocierre. */
export function DataTableErrorCallout({ onRetry, className }: { onRetry?: () => void; className?: string }) {
  return (
    <div
      role="alert"
      data-testid="table-error"
      className={cn(
        'flex flex-wrap items-center gap-3 border-b border-danger-border bg-danger-soft px-3 py-2 text-cell text-danger-text',
        className
      )}
    >
      <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
      <p className="min-w-0 flex-1">No se pudieron cargar los datos.</p>
      {onRetry ? (
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          Reintentar
        </Button>
      ) : null}
    </div>
  );
}

/** Barra indeterminada de 2px que se muestra durante un refetch (debajo del header sticky). */
export function DataTableRefetchBar({ className }: { className?: string }) {
  return (
    <div
      role="progressbar"
      aria-label="Actualizando"
      className={cn('pointer-events-none h-0.5 w-full overflow-hidden bg-transparent', className)}
    >
      <div className="h-full w-full animate-pulse bg-primary motion-reduce:animate-none" />
    </div>
  );
}
