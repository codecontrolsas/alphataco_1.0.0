import { Skeleton } from '@/components/ui/skeleton';

/** Misma estructura que la página del manual (header · índice · contenido) para que nada salte al cargar. */
export function ManualSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando el manual" className="bg-muted/40 min-h-dvh">
      <div className="bg-background border-border/60 h-14 border-b">
        <div className="flex h-full items-center gap-3 px-3 sm:px-4">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="h-5 w-36" />
          <Skeleton className="ms-auto h-8 w-32" />
        </div>
      </div>
      <div className="lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="bg-background hidden space-y-2 border-e px-3 py-5 lg:block lg:h-[calc(100dvh-3.5rem)]">
          {Array.from({ length: 12 }, (_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
        <div className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          <div className="mx-auto max-w-6xl space-y-6">
            <div className="bg-card space-y-4 rounded-xl border p-6 sm:p-8">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-4 w-full max-w-prose" />
              <Skeleton className="h-12 w-full max-w-2xl" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-28 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
