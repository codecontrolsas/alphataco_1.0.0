import { Skeleton } from '@/components/ui/skeleton';
import { KpiCardSkeleton } from '@/features/Dashboard/Principal/fallback/KpiCardsSkeleton';

/** Bandeja «Para atender» en carga: filas con las proporciones de las reales. */
export function AttentionInboxSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-2 @2xl:grid-cols-2" aria-hidden="true">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex min-h-14 items-center gap-3 rounded-lg border py-2.5 pr-3 pl-4">
          <Skeleton className="h-6 w-10" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-48 max-w-full" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Tarjetas de «Plata» en carga. */
export function CashPositionSkeleton() {
  return (
    <div className="grid gap-3 @xl:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <KpiCardSkeleton key={i} />
      ))}
    </div>
  );
}
