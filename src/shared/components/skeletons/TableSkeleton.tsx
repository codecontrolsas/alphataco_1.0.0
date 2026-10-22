import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface TableSkeletonProps {
  columnCount?: number;
  rowCount?: number;
  showCheckbox?: boolean;
  showAvatar?: boolean;
  filterCount?: number;
  /** Envuelve la tabla en una `Card` (como las listas que van dentro de una pestaña). */
  inCard?: boolean;
}

export function TableSkeleton({
  columnCount = 6,
  rowCount = 8,
  showCheckbox = false,
  showAvatar = false,
  filterCount = 2,
  inCard = false,
}: TableSkeletonProps) {
  const content = (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          <Skeleton className="h-9 w-64" />
          {Array.from({ length: filterCount }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24" />
          ))}
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <div className="border-b p-3">
          <div className="flex gap-4">
            {showCheckbox && <Skeleton className="h-5 w-5" />}
            {Array.from({ length: columnCount }).map((_, i) => (
              <Skeleton key={i} className="h-5 flex-1" />
            ))}
          </div>
        </div>
        <div className="divide-y">
          {Array.from({ length: rowCount }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-3">
              {showCheckbox && <Skeleton className="h-4 w-4" />}
              {showAvatar && <Skeleton className="h-8 w-8 rounded-full" />}
              {Array.from({ length: columnCount }).map((_, j) => (
                <Skeleton key={j} className="h-4 flex-1" />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-20" />
        </div>
      </div>
    </div>
  );

  if (!inCard) return content;
  return (
    <Card>
      <CardContent className="pt-6">{content}</CardContent>
    </Card>
  );
}
