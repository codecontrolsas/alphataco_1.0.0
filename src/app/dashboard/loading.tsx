import { Skeleton } from '@/components/ui/skeleton';
import { PageHeaderSkeleton } from '@/shared/components/layout/PageHeaderSkeleton';

// Filas del panel de tabla (constante de módulo: no se recrea en cada render).
const ROWS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * Carga de toda ruta `/dashboard/**` sin loading propio: reproduce la página más común
 * (encabezado + panel de tabla con header de 32px y filas de 36px).
 */
export default function Loading() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Cargando…</span>
      <PageHeaderSkeleton />
      <div className="border border-border bg-card">
        <div className="flex h-12 items-center gap-2 border-b border-border px-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="ml-auto h-8 w-24" />
        </div>
        <div className="h-8 bg-muted" />
        {ROWS.map((row) => (
          <div key={row} className="flex h-9 items-center gap-4 border-b border-border px-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
