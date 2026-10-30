import { Skeleton } from '@/components/ui/skeleton';

/** Lista de documentos o capacitaciones (`DataList`) mientras carga. */
export function PortalListSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true">
      <span className="sr-only" role="status">
        {label}
      </span>
      <Skeleton className="h-5 w-40" />
      <div className="bg-card divide-y rounded-xl border">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex min-h-16 items-center gap-3 p-4">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
            <Skeleton className="hidden h-6 w-24 rounded-full sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
