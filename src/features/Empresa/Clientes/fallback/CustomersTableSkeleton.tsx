import { Skeleton } from '@/components/ui/skeleton';

/** Esqueleto de una tabla con barra de herramientas y filas: el listado de clientes y las tablas de la ficha. */
export function CustomersTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Cargando tabla">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-40" />
      </div>
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
      <div className="flex items-center justify-between pt-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-48" />
      </div>
    </div>
  );
}
