import { Skeleton } from '@/components/ui/skeleton';

interface TableSkeletonProps {
  columnCount?: number;
  rowCount?: number;
  showCheckbox?: boolean;
  showAvatar?: boolean;
  filterCount?: number;
}

/**
 * Esqueleto con la geometría del DataTable nuevo: toolbar de 48px, header de 32px, filas de 36px,
 * pie de 44px, borde de 1px y sin radio.
 */
export function TableSkeleton({
  columnCount = 6,
  rowCount = 8,
  showCheckbox = false,
  showAvatar = false,
  filterCount = 2,
}: TableSkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className="w-full min-w-0 overflow-hidden border border-border bg-card in-data-[slot=card-content]:border-0 in-data-[slot=panel-body]:border-0"
    >
      {/* Toolbar */}
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-8 w-64 max-w-full" />
          {Array.from({ length: filterCount }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24" />
          ))}
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>

      {/* Header */}
      <div className="flex h-8 items-center gap-4 border-b border-border-strong bg-muted px-3">
        {showCheckbox && <Skeleton className="size-4" />}
        {Array.from({ length: columnCount }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>

      {/* Filas */}
      <div className="divide-y divide-border">
        {Array.from({ length: rowCount }).map((_, i) => (
          <div key={i} className="flex h-9 items-center gap-4 px-3">
            {showCheckbox && <Skeleton className="size-4" />}
            {showAvatar && <Skeleton className="size-6 rounded-full" />}
            {Array.from({ length: columnCount }).map((_, j) => (
              <Skeleton key={j} className="h-3 flex-1" />
            ))}
          </div>
        ))}
      </div>

      {/* Pie */}
      <div className="flex min-h-11 items-center justify-between gap-3 border-t border-border bg-panel-2 px-3">
        <Skeleton className="h-4 w-28" />
        <div className="flex gap-2">
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-7 w-32" />
        </div>
      </div>
    </div>
  );
}
