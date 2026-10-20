import { Skeleton } from '@/components/ui/skeleton';

export function TallerPipelineSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Cargando el circuito de Taller">
      {/* Barra de las 4 pestañas (PipelineSteps) */}
      <div className="border-border flex gap-1 border-b" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="mb-1 h-8 w-36" />
        ))}
      </div>
      {/* Tarjetas de métricas + tabla del paso inicial */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[132px] rounded-xl" />
        ))}
      </div>
      <div className="space-y-4" aria-hidden="true">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    </div>
  );
}
