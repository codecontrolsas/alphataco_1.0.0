import { Skeleton } from '@/components/ui/skeleton';

/** Esqueleto de Mi bandeja: título y bloques con la misma forma que la pantalla real. */
export function InboxSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Cargando Mi bandeja">
      <Skeleton className="h-56 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}
