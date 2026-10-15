import { Skeleton } from '@/components/ui/skeleton';

/** Skeleton de la ficha de empresa: cabecera (logo, nombre, CUIT) y tres secciones con campos. */
export function CompanySkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="bg-card flex items-center gap-4 rounded-xl border p-5">
        <Skeleton className="size-14 shrink-0 rounded-full" />
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      {[3, 2, 4].map((fields, section) => (
        <div key={section} className="bg-card rounded-xl border">
          <div className="border-b px-5 py-3.5">
            <Skeleton className="h-5 w-32" />
          </div>
          <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
            {Array.from({ length: fields }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-40" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
