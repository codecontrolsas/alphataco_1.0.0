import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { KpiCardSkeleton } from '@/features/Dashboard/Principal/fallback/KpiCardsSkeleton';

/** Las seis tarjetas de resumen en carga. */
export function SummaryCardsSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      <Skeleton className="h-4 w-64" />
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <KpiCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/** Tarjeta con un gráfico en carga. */
export function ChartCardSkeleton({ height = 250 }: { height?: number }) {
  return (
    <Card aria-hidden="true">
      <CardHeader className="space-y-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </CardHeader>
      <CardContent>
        <Skeleton className="w-full rounded-lg" style={{ height }} />
      </CardContent>
    </Card>
  );
}

/** Tarjeta con una tabla en carga. */
export function TableCardSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Card aria-hidden="true">
      <CardHeader className="space-y-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-9 w-full" />
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

/** Los dos gráficos de distribución, uno al lado del otro. */
export function DistributionSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <ChartCardSkeleton height={300} />
      <ChartCardSkeleton height={300} />
    </div>
  );
}

/** Esqueleto de la pestaña completa mientras se resuelven el permiso y la empresa. */
export function RrhhTabSkeleton() {
  return (
    <div className="space-y-8">
      <SummaryCardsSkeleton />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <ChartCardSkeleton />
        <ChartCardSkeleton />
      </div>
    </div>
  );
}
