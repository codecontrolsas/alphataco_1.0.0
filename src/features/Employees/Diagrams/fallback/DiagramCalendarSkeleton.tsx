import { Skeleton } from '@/components/ui/skeleton';

/** Fallback del calendario mientras carga el componente: barra de herramientas y caja de la grilla. */
export function DiagramCalendarSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Cargando el calendario de diagramas">
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-full sm:w-80" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-9 w-24" />
      </div>
      <Skeleton className="h-80 w-full rounded-md" />
    </div>
  );
}
