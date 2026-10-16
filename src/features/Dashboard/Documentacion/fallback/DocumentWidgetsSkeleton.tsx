import { Skeleton } from '@/components/ui/skeleton';

/** Esqueleto del widget "Estado documental": dos donuts con su leyenda. */
export function ComplianceWidgetSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-2" aria-hidden="true">
      {[0, 1].map((panel) => (
        <div key={panel} className="space-y-3">
          <Skeleton className="h-4 w-20" />
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <Skeleton className="size-32 shrink-0 rounded-full" />
            <div className="w-full space-y-2">
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Esqueleto de la línea de vencimientos: resumen, tira de 31 días y detalle. */
export function TimelineWidgetSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}

/** Esqueleto de las barras por semana: cinco filas con su barra. */
export function WeeksWidgetSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="grid grid-cols-[5.5rem_1fr] items-center gap-3 sm:grid-cols-[8rem_1fr]">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-5 w-full" />
        </div>
      ))}
    </div>
  );
}
