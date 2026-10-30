import { Skeleton } from '@/components/ui/skeleton';

/** Detalle (documento, capacitación, material, resultado) mientras carga: migas, título y dos bloques. */
export function PortalDetailSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only" role="status">
        {label}
      </span>
      <div className="space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-8 w-4/5 max-w-lg" />
        <Skeleton className="h-4 w-3/5 max-w-md" />
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-56 w-full rounded-xl" />
    </div>
  );
}
