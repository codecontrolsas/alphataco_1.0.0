import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Esqueleto de las tarjetas de atención: misma grilla y altura que `InWorkshopMetrics`. */
export function InWorkshopMetricsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="bg-card flex flex-col gap-3 rounded-xl border p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-12" />
          <Skeleton className="h-4 w-32" />
        </div>
      ))}
    </div>
  );
}

/** Esqueleto de "En Taller": tarjetas y tabla con la forma real (filtros, encabezado y filas). */
export function MaintenanceOrdersSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Cargando órdenes en taller">
      <InWorkshopMetricsSkeleton />
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-9 w-full max-w-xs" />
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-32" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
