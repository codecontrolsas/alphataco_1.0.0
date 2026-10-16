import { Skeleton } from '@/components/ui/skeleton';
import { CatalogTableSurface } from '@/shared/components/common/CatalogFormSheet';

const SKELETON_COLUMNS = 7;
const SKELETON_ROWS = 10;

/** Mismo marco que la vista (superficie + totales + barra + tabla + paginación) para que no salte al cargar. */
export function DiagramReportsSkeleton() {
  return (
    <CatalogTableSurface>
      <div className="space-y-4" aria-busy="true" aria-label="Cargando reportes de diagramas">
        {/* Totales por novedad */}
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-32 rounded-md" />
          ))}
        </div>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-full sm:w-[250px]" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="ml-auto h-9 w-44" />
        </div>
        {/* Table */}
        <div className="rounded-md border">
          <div className="border-b px-4 py-3">
            <div className="grid grid-cols-7 gap-4">
              {Array.from({ length: SKELETON_COLUMNS }).map((_, i) => (
                <Skeleton key={i} className="h-4" />
              ))}
            </div>
          </div>
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <div key={i} className="border-b px-4 py-3 last:border-0">
              <div className="grid grid-cols-7 items-center gap-4">
                {Array.from({ length: SKELETON_COLUMNS }).map((_, j) => (
                  <Skeleton key={j} className={j === 3 ? 'h-7 w-24' : 'h-4'} />
                ))}
              </div>
            </div>
          ))}
        </div>
        {/* Pagination */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
          </div>
        </div>
      </div>
    </CatalogTableSurface>
  );
}
