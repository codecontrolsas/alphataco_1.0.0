import { Skeleton } from '@/components/ui/skeleton';

export function DailyReportMetricsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-card flex flex-col gap-3 rounded-xl border p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-14" />
          <Skeleton className="h-4 w-36" />
        </div>
      ))}
    </div>
  );
}
