import { Skeleton } from '@/components/ui/skeleton';

/** Cabecera con la forma real: dos tarjetas de paso, la banda de atención, las métricas y la tabla. */
export function OperacionesPipelineSkeleton() {
  return (
    // Mismo pt-4 que PipelineLayout para que no salte el layout al hidratar
    <div className="space-y-6 pt-4" role="status" aria-busy="true" aria-label="Cargando Operaciones">
      {/* Tarjetas de paso (4 columnas en escritorio, 2 en móvil) */}
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 2 }, (_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-xl" />
        ))}
      </div>
      {/* Métricas */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[132px] rounded-xl" />
        ))}
      </div>
      {/* Tabla */}
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    </div>
  );
}
