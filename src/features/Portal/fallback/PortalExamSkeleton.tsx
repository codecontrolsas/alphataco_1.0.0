import { Skeleton } from '@/components/ui/skeleton';

/** Examen mientras carga: barra de progreso, pregunta y opciones. */
export function PortalExamSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-6" aria-busy="true">
      <span className="sr-only" role="status">
        Cargando el examen
      </span>
      <div className="space-y-2 border-b pb-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-2 w-full rounded-full" />
      </div>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-7 w-4/5" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-14 w-full rounded-xl" />
      ))}
    </div>
  );
}
