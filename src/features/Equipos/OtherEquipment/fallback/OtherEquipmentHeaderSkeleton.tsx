import { Skeleton } from '@/components/ui/skeleton';

/** Esqueleto de la cabecera de la ficha: identidad, acciones y franja de datos de uso. */
export function OtherEquipmentHeaderSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <Skeleton className="h-8 w-24" />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-5">
          <Skeleton className="size-20 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-72" />
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-6 w-40 rounded-full" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-9" />
        </div>
      </div>
      <div className="bg-card grid grid-cols-2 divide-x divide-y rounded-xl border md:grid-cols-4 md:divide-y-0">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 px-5 py-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
