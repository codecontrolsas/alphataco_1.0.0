import { Skeleton } from '@/components/ui/skeleton';

interface AuthFormSkeletonProps {
  /** Cantidad de campos (label + input) del formulario. */
  fields: number;
}

/** Skeleton de los formularios de auth, con la misma geometría que el form sobre `AuthShell`. */
export function AuthFormSkeleton({ fields }: AuthFormSkeletonProps) {
  return (
    <div role="status" className="flex flex-col gap-8">
      <span className="sr-only">Cargando…</span>
      <div className="space-y-2">
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="space-y-6">
        {Array.from({ length: fields }, (_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}
