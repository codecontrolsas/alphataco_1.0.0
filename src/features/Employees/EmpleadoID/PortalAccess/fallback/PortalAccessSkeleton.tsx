import { Skeleton } from '@/components/ui/skeleton';

export function PortalAccessSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando el acceso al portal">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-6 w-24" />
      </div>
      <Skeleton className="h-40 w-full max-w-xl" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
