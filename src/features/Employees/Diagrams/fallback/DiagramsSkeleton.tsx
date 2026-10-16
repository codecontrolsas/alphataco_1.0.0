import { Skeleton } from '@/components/ui/skeleton';
import { DiagramCalendarSkeleton } from './DiagramCalendarSkeleton';

/** Fallback de toda la sección Diagramas: selector de vista y barra + grilla del calendario. */
export function DiagramsSkeleton() {
  return (
    <div className="space-y-4">
      {/* Selector de vista */}
      <Skeleton className="h-10 w-full sm:w-80" />
      <DiagramCalendarSkeleton />
    </div>
  );
}
