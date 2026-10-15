import { Skeleton } from '@/components/ui/skeleton';

/** Forma real de Gomería: barra de pestañas, métricas, buscador y tabla. */
export function GomeriaSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Cargando Gomería">
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-28 shrink-0" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[96px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-[400px] w-full rounded-md" />
    </div>
  );
}
