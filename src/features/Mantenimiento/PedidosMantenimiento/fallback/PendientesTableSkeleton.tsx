import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Tarjetas de métricas mientras se cuentan los pedidos (misma grilla que `PendingOrderMetrics`). */
export function PendingOrderMetricsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-[132px] rounded-xl" />
      ))}
    </div>
  );
}

/** Cuerpo de tabla: barra de herramientas y filas. */
function TableBodySkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function PendientesTableSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Cargando los pedidos por programar">
      <PendingOrderMetricsSkeleton />
      <Card>
        <CardHeader>
          <CardTitle>Pedidos por programar</CardTitle>
          <CardDescription>Asigná la fecha de recepción en taller o rechazá el pedido.</CardDescription>
        </CardHeader>
        <CardContent>
          <TableBodySkeleton />
        </CardContent>
      </Card>
    </div>
  );
}

export function ConfirmadosTableSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Cargando los pedidos por ingresar">
      <Card>
        <CardHeader>
          <CardTitle>Por ingresar</CardTitle>
          <CardDescription>Registrá el ingreso del equipo al taller. Al ingresar se pide el kilometraje.</CardDescription>
        </CardHeader>
        <CardContent>
          <TableBodySkeleton />
        </CardContent>
      </Card>
    </div>
  );
}
