import { Skeleton } from '@/components/ui/skeleton';

/** Cabecera con la forma real: las pestañas, la banda de atención, las métricas y la tabla. */
export function OperacionesPipelineSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Cargando Operaciones">
      {/* Barra de las 2 pestañas (PipelineSteps) */}
      <div className="border-border flex gap-1 border-b">
        {Array.from({ length: 2 }, (_, i) => (
          <Skeleton key={i} className="mb-1 h-8 w-36" />
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
