import { Skeleton } from '@/components/ui/skeleton';

/** Esqueleto de las tarjetas por estado: misma grilla y altura que `DocumentStateMetrics`. */
export function DocumentStateMetricsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="bg-card flex flex-col gap-3 rounded-xl border p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-12" />
          <Skeleton className="h-4 w-32" />
        </div>
      ))}
    </div>
  );
}
