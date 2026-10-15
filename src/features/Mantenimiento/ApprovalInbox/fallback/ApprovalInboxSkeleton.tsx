import { Skeleton } from '@/components/ui/skeleton';

/** Esqueleto de la bandeja: las cuatro métricas y los bloques, con la misma forma que la pantalla real. */
export function ApprovalInboxSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Cargando la bandeja de aprobaciones">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-32 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-56 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
