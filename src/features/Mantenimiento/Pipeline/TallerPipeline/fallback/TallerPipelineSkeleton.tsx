import { Skeleton } from '@/components/ui/skeleton';

export function TallerPipelineSkeleton() {
  return (
    // Mismo pt-4 que PipelineLayout para que no salte el layout al hidratar
    <div className="pt-4 space-y-6" role="status" aria-busy="true" aria-label="Cargando el circuito de Taller">
      {/* Tarjetas de los 4 pasos: misma grilla que PipelineSteps (2 columnas hasta xl, 4 en línea) */}
      <div className="grid grid-cols-2 gap-2 max-md:gap-1.5 xl:auto-cols-fr xl:grid-flow-col xl:grid-cols-none" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px] rounded-xl max-md:h-[84px]" />
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
