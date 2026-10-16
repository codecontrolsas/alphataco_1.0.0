import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { CalendarDay } from '../utils/calendar-filters';

interface CalendarGridSkeletonProps {
  days: CalendarDay[];
  rows?: number;
}

/** Misma estructura que la grilla real (columna fija, encabezado de días) con casillas de relleno. */
export function CalendarGridSkeleton({ days, rows = 8 }: CalendarGridSkeletonProps) {
  return (
    <div
      className="max-h-[70vh] min-w-0 overflow-auto rounded-md border"
      role="status"
      aria-busy="true"
      aria-label="Cargando el calendario de diagramas"
    >
      <table className="border-separate border-spacing-0 text-xs" aria-hidden="true">
        <thead>
          <tr>
            <th className="bg-background sticky top-0 left-0 z-30 w-44 min-w-44 border-r border-b p-2 text-left font-semibold sm:w-56 sm:min-w-56">
              Empleado
            </th>
            {days.map((day) => (
              <th
                key={day.key}
                className={cn(
                  'sticky top-0 z-20 min-w-12 border-b px-0 py-1 text-center font-normal',
                  day.isToday ? 'bg-brand-subtle' : 'bg-background',
                  day.isWeekend && 'text-muted-foreground'
                )}
              >
                <span className="block">{day.letter}</span>
                <span className="block tabular-nums">{day.label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, rowIndex) => (
            <tr key={rowIndex}>
              <th className="bg-background sticky left-0 z-10 w-44 min-w-44 border-r border-b p-2 sm:w-56 sm:min-w-56">
                <Skeleton className="h-3.5" style={{ width: `${55 + ((rowIndex * 17) % 40)}%` }} />
              </th>
              {days.map((day) => (
                <td key={day.key} className="border-b p-0.5">
                  <Skeleton className="mx-auto h-9 w-12 rounded" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
