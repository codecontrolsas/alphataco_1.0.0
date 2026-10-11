import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Carga de la tabla de cheques: buscador, filtros y filas. */
export function ChecksTableSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex gap-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="rounded-md border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-4 border-b p-3 last:border-b-0">
              {Array.from({ length: 7 }).map((__, j) => (
                <Skeleton key={j} className="h-4 flex-1" />
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
