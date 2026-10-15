import { Skeleton } from '@/components/ui/skeleton';

export function MensureUnitsTableSkeleton() {
  return (
    <div
      className="bg-card border-border/60 min-w-0 space-y-4 rounded-xl border p-3 sm:p-4"
      aria-busy="true"
      aria-label="Cargando unidades de medida"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Skeleton className="h-9 w-56 max-w-full" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="overflow-hidden rounded-md border">
        <div className="flex gap-4 border-b p-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-5 flex-1" />
          ))}
        </div>
        <div className="divide-y">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-3">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="h-4 flex-1" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
