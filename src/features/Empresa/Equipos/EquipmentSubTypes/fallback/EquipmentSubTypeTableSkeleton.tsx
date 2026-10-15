import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton de la tabla de Subtipos de unidad mientras carga el Server Component.
 * Tabla a ancho completo con su barra de herramientas (el formulario vive en un panel lateral).
 */
export function EquipmentSubTypeTableSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-9 w-56" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-9 w-48" />
      </div>
    </div>
  );
}
