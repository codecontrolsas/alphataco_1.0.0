import { Skeleton } from '@/components/ui/skeleton';

/** Indicadores del inicio mientras cargan (misma grilla que `HomeStats`). */
export function HomeStatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-28 rounded-xl" />
      ))}
    </div>
  );
}

/** Un bloque del inicio (pendientes, vencimientos, completados) mientras carga. */
export function HomeBlockSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      <Skeleton className="h-5 w-44" />
      <div className="bg-card divide-y rounded-xl border">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="space-y-2 p-4">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
