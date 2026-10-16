import { Skeleton } from '@/components/ui/skeleton';

/** Estructura de "Origen del comprobante": título y los cuatro eslabones. */
export function InvoiceOriginSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4" aria-busy="true">
      <span className="sr-only">Cargando el origen del comprobante…</span>
      <Skeleton className="h-5 w-48" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
