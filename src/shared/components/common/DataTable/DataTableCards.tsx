'use client';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/shared/components/feedback/EmptyState';

import { DataTableCard } from './DataTableCard';
import { DataTableEmptyContent, DataTableErrorCallout } from './DataTableStates';
import type { DataTableCardsProps } from './types';

const SKELETON_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => `skeleton-card-${id}`);

function DataTableCardsSkeleton() {
  return (
    <ul role="list" aria-hidden="true" className="divide-border divide-y">
      {SKELETON_KEYS.map((key) => (
        <li key={key} className="flex flex-col gap-2 px-4 py-3">
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-5 w-16" />
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <Skeleton className="h-3.5 w-4/5" />
            <Skeleton className="h-3.5 w-3/5" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Lista de tarjetas del modo mobile (§3.4-3.5). Se muestra solo en contenedores angostos
 * (`@3xl/table:hidden`) y va en el DOM después de la tabla.
 */
export function DataTableCards<TData>({
  table,
  layout,
  rowClassName,
  onOpenDetail,
  isInitialLoading,
  isRefetching,
  isError,
  onRetry,
  hasActiveFilters,
  onClearFilters,
  emptyMessage,
  emptyDescription,
}: DataTableCardsProps<TData>) {
  const rows = table.getRowModel().rows;
  const selectable = layout.select !== null;

  let body: React.ReactNode;
  if (isInitialLoading) {
    body = <DataTableCardsSkeleton />;
  } else if (isError && rows.length === 0) {
    body = (
      <EmptyState
        variant="error"
        size="compact"
        title="No se pudieron cargar los datos"
        description="Ocurrió un problema al cargar la lista."
        action={
          onRetry ? (
            <Button type="button" variant="secondary" onClick={onRetry}>
              Reintentar
            </Button>
          ) : undefined
        }
      />
    );
  } else if (rows.length === 0) {
    body = (
      <DataTableEmptyContent
        hasActiveFilters={hasActiveFilters}
        onClearFilters={onClearFilters}
        emptyMessage={emptyMessage}
        emptyDescription={emptyDescription}
      />
    );
  } else {
    body = (
      <>
        {/* Con error y filas previas, los datos siguen visibles debajo del aviso (igual que en la grilla). */}
        {isError ? <DataTableErrorCallout onRetry={onRetry} /> : null}
        <ul role="list" className="divide-border divide-y">
          {rows.map((row) => (
            <DataTableCard
              key={row.id}
              row={row}
              layout={layout}
              isSelected={row.getIsSelected()}
              selectable={selectable}
              extraClassName={rowClassName?.(row.original)}
              onOpenDetail={onOpenDetail}
            />
          ))}
        </ul>
      </>
    );
  }

  return (
    <div
      data-slot="data-table-cards"
      aria-busy={isRefetching || undefined}
      className={cn('@3xl/table:hidden', isRefetching && 'opacity-60 transition-opacity')}
    >
      {body}
    </div>
  );
}
