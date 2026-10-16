'use client';

import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { memo } from 'react';
import type { DiagramCalendarRow, DiagramCalendarType } from '../../actions/diagram-search-actions';
import { DiagramCell } from '../../components/DiagramCell';
import { formatEmployeeLabel, formatEmployeeName, type CalendarDay } from '../utils/calendar-filters';

/** Fondo opaco de la columna fija para que las casillas no se vean por debajo al desplazar. */
const STICKY_BACKGROUND = 'bg-background';

interface CalendarGridProps {
  rows: DiagramCalendarRow[];
  days: CalendarDay[];
  typesById: Map<string, DiagramCalendarType>;
  canCreate: boolean;
  canUpdate: boolean;
  onCellClick: (employeeId: string, dayKey: string) => void;
}

/**
 * Grilla de novedades por empleado y día. Scrollea dentro de su caja (encabezado y columna de empleado fijos),
 * nunca la página. Las casillas son botones solo si el usuario puede crear (casilla vacía) o editar (con novedad).
 */
export function CalendarGrid({ rows, days, typesById, canCreate, canUpdate, onCellClick }: CalendarGridProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="max-h-[70vh] min-w-0 overflow-auto rounded-md border">
        <table className="border-separate border-spacing-0 text-xs" aria-label="Novedad de cada empleado por día">
          <thead>
            <tr>
              <th
                scope="col"
                className={cn(
                  'sticky top-0 left-0 z-30 w-44 min-w-44 border-r border-b p-2 text-left font-semibold sm:w-56 sm:min-w-56',
                  STICKY_BACKGROUND
                )}
              >
                Empleado
              </th>
              {days.map((day) => (
                <th
                  key={day.key}
                  scope="col"
                  aria-label={day.fullLabel}
                  aria-current={day.isToday ? 'date' : undefined}
                  className={cn(
                    'sticky top-0 z-20 min-w-12 border-b px-0 py-1 text-center font-normal',
                    day.isToday ? 'bg-brand-subtle text-brand-subtle-foreground' : STICKY_BACKGROUND,
                    day.isWeekend && !day.isToday && 'text-muted-foreground'
                  )}
                >
                  <span className="block">{day.letter}</span>
                  <span className={cn('block tabular-nums', !day.isWeekend && 'font-semibold')}>{day.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <CalendarRow
                key={row.id}
                row={row}
                days={days}
                typesById={typesById}
                canCreate={canCreate}
                canUpdate={canUpdate}
                onCellClick={onCellClick}
              />
            ))}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  );
}

interface CalendarRowProps extends Omit<CalendarGridProps, 'rows'> {
  row: DiagramCalendarRow;
}

/** Fila memoizada: un refetch que no cambió al empleado no vuelve a dibujar sus casillas. */
const CalendarRow = memo(function CalendarRow({
  row,
  days,
  typesById,
  canCreate,
  canUpdate,
  onCellClick,
}: CalendarRowProps) {
  const label = formatEmployeeLabel(row);

  return (
    <tr>
      <th
        scope="row"
        className={cn(
          'sticky left-0 z-10 w-44 min-w-44 max-w-44 border-r border-b p-2 text-left font-normal sm:w-56 sm:min-w-56 sm:max-w-56',
          STICKY_BACKGROUND
        )}
      >
        {/* El recorte va en un bloque interno: en una tabla con layout automático la celda crece con su texto. */}
        <span className="block truncate" title={label}>
          <span className="text-muted-foreground tabular-nums">[{row.file}]</span>{' '}
          <span className="font-medium">{formatEmployeeName(row)}</span>
        </span>
      </th>
      {days.map((day) => {
        const entry = row.days[day.key];
        const type = entry ? typesById.get(entry.typeId) ?? null : null;
        const canEdit = entry ? canUpdate : canCreate;

        return (
          <td
            key={day.key}
            className={cn(
              'border-b p-0.5 text-center',
              day.isToday ? 'bg-brand-subtle/40' : day.isWeekend && 'bg-muted/40'
            )}
          >
            <DiagramCell
              diagramType={type}
              date={day.key}
              size="md"
              comment={entry?.comments}
              ariaPrefix={label}
              focusable={canEdit}
              onClick={canEdit ? () => onCellClick(row.id, day.key) : undefined}
            />
          </td>
        );
      })}
    </tr>
  );
});
