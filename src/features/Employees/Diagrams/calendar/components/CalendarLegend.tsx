import type { DiagramCalendarType } from '../../actions/diagram-search-actions';
import { getContrastTextColor } from '../../lib/color-contrast';

/** Referencias de las novedades que aparecen en la grilla cargada: sigla con el color de la novedad y su nombre. */
export function CalendarLegend({ types }: { types: DiagramCalendarType[] }) {
  if (types.length === 0) return null;

  const sorted = [...types].sort((a, b) => a.short_description.localeCompare(b.short_description));

  return (
    <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-2 text-xs" aria-label="Referencias">
      {sorted.map((type) => (
        <li key={type.id} className="flex items-center gap-2">
          <span
            className="inline-flex h-5 min-w-6 items-center justify-center rounded px-1 font-medium"
            style={{ background: type.color, color: getContrastTextColor(type.color) }}
          >
            {type.short_description}
          </span>
          {type.name ?? type.short_description}
        </li>
      ))}
    </ul>
  );
}
