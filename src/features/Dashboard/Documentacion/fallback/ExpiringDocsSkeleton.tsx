import { Skeleton } from '@/components/ui/skeleton';

/** Esqueleto de la tabla de vencimientos mientras carga la vista (filtros + filas). */
export function ExpiringDocsSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
