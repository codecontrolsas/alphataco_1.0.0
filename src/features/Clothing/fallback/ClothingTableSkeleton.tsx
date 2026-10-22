import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Carga de las tablas de ropa (entregas, reportes, marcas, artículos): título, filtros y filas. */
export function ClothingTableSkeleton({ rows = 6, withAction = false }: { rows?: number; withAction?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          {withAction && <Skeleton className="h-8 w-32" />}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Toolbar skeleton */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
          </div>
          {/* Table rows skeleton */}
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
          {/* Pagination skeleton */}
          <div className="flex items-center justify-between pt-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-48" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
