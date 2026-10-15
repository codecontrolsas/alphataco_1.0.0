import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Tarjetas de métricas mientras se cuentan las solicitudes (misma grilla que `RequestMetrics`). */
export function RequestMetricsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-[132px] rounded-xl" />
      ))}
    </div>
  );
}

export function SolicitudesTableSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Cargando las solicitudes por validar">
      <RequestMetricsSkeleton />
      <Card>
        <CardHeader>
          <CardTitle>Solicitudes por validar</CardTitle>
          <CardDescription>Se aprueban o rechazan ítem por ítem. Lo aprobado pasa al taller como pedido.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-64 w-full" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
