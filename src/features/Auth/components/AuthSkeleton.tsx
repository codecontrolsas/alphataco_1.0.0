import { Skeleton } from '@/components/ui/skeleton';

/**
 * Fallback común de las pantallas de acceso (`loading.tsx` de login y recuperación): respeta la
 * estructura de `AuthShell` para que no salte el diseño al llegar el contenido.
 */
export function AuthSkeleton({ fields = 2 }: { fields?: number }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[5fr_6fr]">
      <div className="flex min-h-dvh flex-col px-6 py-6 sm:px-12 sm:py-8">
        <Skeleton className="h-8 w-40" />
        <div className="flex flex-1 items-center">
          <div className="mx-auto w-full max-w-sm space-y-6 py-12">
            <div className="space-y-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-5 w-3/4" />
            </div>
            <div className="space-y-5 pt-2">
              {Array.from({ length: fields }).map((_, index) => (
                <div key={index} className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
              <Skeleton className="h-11 w-full" />
            </div>
          </div>
        </div>
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="bg-muted hidden lg:block" />
    </div>
  );
}
