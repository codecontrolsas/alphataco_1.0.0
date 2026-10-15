import { Skeleton } from '@/components/ui/skeleton';

/** Una tarjeta de KPI en carga, con las proporciones de `MetricCard`. */
export function KpiCardSkeleton() {
  return (
    <div className="bg-card flex flex-col justify-between gap-3 rounded-xl border p-5" aria-hidden="true">
      <Skeleton className="h-4 w-24" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  );
}

export function KpiCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <KpiCardSkeleton key={i} />
      ))}
    </div>
  );
}
