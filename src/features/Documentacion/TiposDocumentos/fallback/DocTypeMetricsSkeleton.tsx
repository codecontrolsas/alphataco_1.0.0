import { Skeleton } from '@/components/ui/skeleton';

/** Esqueleto de las tarjetas de tipos de documento: misma grilla y altura que `DocTypeMetricsSection`. */
export function DocTypeMetricsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
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
