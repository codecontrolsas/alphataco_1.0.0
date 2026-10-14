import { Skeleton } from '@/components/ui/skeleton';

/** Esqueleto de la cabecera del parte: volver, identidad, franja de datos y leyenda. */
export function DailyReportHeaderSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-24" />
      <div className="bg-card flex items-center gap-4 rounded-xl border p-5">
        <Skeleton className="size-14 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-5 w-40" />
        </div>
      </div>
      <div className="bg-card grid grid-cols-2 divide-x divide-y rounded-xl border md:grid-cols-4 md:divide-y-0">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="space-y-2 px-5 py-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-7 w-10" />
          </div>
        ))}
      </div>
      <Skeleton className="h-11 w-full rounded-xl" />
    </div>
  );
}
