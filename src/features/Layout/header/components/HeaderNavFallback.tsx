import { SidebarTrigger } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';

/** Fallback del Suspense de `HeaderNavAsync`: misma estructura y altura, sin layout shift. */
export function HeaderNavFallback() {
  return (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-2 md:flex-none">
        <SidebarTrigger aria-label="Mostrar u ocultar el menú" className="size-10 shrink-0" />
        <Skeleton className="hidden size-8 shrink-0 rounded-md md:block" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="flex justify-end md:justify-center">
        <Skeleton className="size-10 rounded-md md:hidden" />
        <Skeleton className="hidden h-9 w-full max-w-sm rounded-md md:block" />
      </div>
    </>
  );
}
