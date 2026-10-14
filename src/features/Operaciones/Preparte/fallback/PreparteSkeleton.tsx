import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Esqueleto de las tarjetas de estado: misma grilla y altura que `PreparteMetrics`. */
export function PreparteMetricsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 2xl:grid-cols-7">
      {Array.from({ length: 7 }).map((_, index) => (
        <div key={index} className="bg-card flex flex-col gap-3 rounded-xl border p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-12" />
          <Skeleton className="h-4 w-32" />
        </div>
      ))}
    </div>
  );
}

/** Esqueleto de la tabla de pedidos: barra de búsqueda y acciones, encabezado, filas y paginación. */
export function PreparteTableSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-9 w-full sm:w-72" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-32" />
          </div>
        </div>
        <div className="space-y-3 rounded-md border p-3 max-md:border-0 max-md:p-0">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full max-md:h-28 max-md:rounded-xl" />
          ))}
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-48" />
        </div>
      </CardContent>
    </Card>
  );
}

/** Esqueleto de la sección de pedidos completa (tarjetas + tabla). */
export function PreparteSkeleton() {
  return (
    <div className="space-y-6">
      <PreparteMetricsSkeleton />
      <PreparteTableSkeleton />
    </div>
  );
}
