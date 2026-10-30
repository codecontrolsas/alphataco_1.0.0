import { Skeleton } from '@/components/ui/skeleton';

/**
 * Marco del portal mientras se resuelve la sesión: misma geometría que `PortalAppShell` (menú lateral de 16rem desde
 * `md`, cabecera de 3.5rem) para que no salte nada al llegar los datos.
 */
export function PortalShellSkeleton() {
  return (
    <div className="bg-background flex min-h-dvh" aria-busy="true">
      <span className="sr-only" role="status">
        Cargando el portal
      </span>
      <div className="bg-sidebar hidden w-64 shrink-0 flex-col border-r md:flex">
        <div className="flex h-[4.25rem] items-center gap-2.5 border-b px-4">
          <Skeleton className="size-7 rounded-md" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <div className="space-y-2 p-3">
          {['70%', '82%', '76%', '55%'].map((width) => (
            <div key={width} className="flex h-9 items-center gap-2 px-2">
              <Skeleton className="size-4 rounded-md" />
              <Skeleton className="h-3.5" style={{ width }} />
            </div>
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center gap-3 border-b px-3 sm:px-4">
          <Skeleton className="size-9 rounded-md" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-28 md:hidden" />
          </div>
          <Skeleton className="size-9 rounded-full" />
          <Skeleton className="size-9 rounded-full" />
        </div>
        <div className="mx-auto w-full max-w-5xl space-y-4 px-4 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72 max-w-full" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
