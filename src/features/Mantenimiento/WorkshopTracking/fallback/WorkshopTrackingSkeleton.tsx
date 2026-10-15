import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Tarjetas de métricas mientras se cuentan los pedidos (misma grilla que `TrackingMetrics`). */
export function TrackingMetricsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-[132px] rounded-xl" />
      ))}
    </div>
  );
}

export function WorkshopTrackingSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Cargando el seguimiento en taller">
      <TrackingMetricsSkeleton />
      <Card>
        <CardHeader className="bg-surface dark:bg-muted/50 border-b-2">
          <CardTitle>Seguimiento en Taller</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-64 w-full" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
