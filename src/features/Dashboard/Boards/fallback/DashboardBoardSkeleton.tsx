import { Skeleton } from '@/components/ui/skeleton';
import { KpiCardsSkeleton } from '@/features/Dashboard/Principal/fallback/KpiCardsSkeleton';
import { SectionSkeleton } from '@/features/Dashboard/Principal/fallback/SectionSkeleton';

/** Esqueleto del Dashboard mientras se resuelven los tableros y permisos (forma del tablero «Resumen»). */
export function DashboardBoardSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Cargando el Dashboard">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-10 w-full sm:w-80" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="size-10" />
        </div>
      </div>
      <KpiCardsSkeleton />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionSkeleton />
        <SectionSkeleton />
        <SectionSkeleton />
        <SectionSkeleton />
      </div>
    </div>
  );
}
