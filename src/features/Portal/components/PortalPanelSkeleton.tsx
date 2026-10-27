import { Skeleton } from '@/components/ui/skeleton';

export function PortalPanelSkeleton() {
  return (
    <div className="bg-background flex min-h-dvh flex-col" aria-busy="true" aria-label="Cargando el portal">
      <div className="border-b">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center gap-3 px-4">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 pt-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    </div>
  );
}
