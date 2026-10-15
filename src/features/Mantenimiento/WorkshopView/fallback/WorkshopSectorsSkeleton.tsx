import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkshopSectorTasksSkeleton } from '../WorkshopSectorTasksTable/fallback/WorkshopSectorTasksSkeleton';

/** Misma forma que la Vista Taller: grilla de tarjetas de sector y la tarjeta de la tabla de OT. */
export function WorkshopSectorsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando la Vista Taller">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[148px] rounded-xl" />
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </CardHeader>
        <CardContent>
          <WorkshopSectorTasksSkeleton />
        </CardContent>
      </Card>
    </div>
  );
}
