import { Skeleton } from '@/components/ui/skeleton';

/** Esqueleto del tablero: cuatro columnas con tarjetas, con la misma forma que la pantalla real. */
export function WorkOrdersBoardSkeleton() {
  return (
    <div className="flex min-w-0 gap-3 overflow-hidden" role="status" aria-label="Cargando el tablero de órdenes">
      {Array.from({ length: 4 }, (_, column) => (
        <div key={column} className="w-full min-w-0 space-y-2 rounded-xl border p-3 md:w-80 md:shrink-0">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48 max-w-full" />
          {Array.from({ length: 3 }, (_, card) => (
            <Skeleton key={card} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}
