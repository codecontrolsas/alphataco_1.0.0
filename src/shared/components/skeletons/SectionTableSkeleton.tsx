import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Carga de una sección de un módulo con tabla: título, acción principal, filtros y filas. */
export function SectionTableSkeleton({ filterCount = 3 }: { filterCount?: number }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-36" />
      </div>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex gap-2">
            <Skeleton className="h-9 w-64" />
            {Array.from({ length: filterCount - 1 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-24" />
            ))}
          </div>
          <div className="rounded-md border">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex gap-4 border-b p-3 last:border-b-0">
                {Array.from({ length: 6 }).map((__, j) => (
                  <Skeleton key={j} className="h-4 flex-1" />
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
