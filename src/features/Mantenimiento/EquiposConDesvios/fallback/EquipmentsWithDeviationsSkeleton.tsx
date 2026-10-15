import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Tarjetas de métricas mientras se cuentan los equipos (misma grilla que `DeviationMetrics`). */
export function DeviationMetricsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-busy="true" aria-label="Calculando métricas">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-[124px] rounded-xl" />
      ))}
    </div>
  );
}

export function EquipmentsWithDeviationsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando equipos con desvíos">
      <DeviationMetricsSkeleton />
      <Card className="p-6">
        <CardHeader className="px-0 pt-0">
          <CardTitle>Equipos con Desvíos Pendientes</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="space-y-4">
            {/* Toolbar skeleton */}
            <div className="flex items-center gap-2">
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-10 w-32" />
            </div>
            {/* Table skeleton */}
            <div className="rounded-md border">
              <div className="bg-muted/50 border-b p-3">
                <div className="flex gap-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="border-b p-3">
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-8 w-24" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-8 w-32" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
