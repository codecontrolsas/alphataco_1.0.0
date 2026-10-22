import { argentinaDate } from '@/shared/lib/argentina-time';
import { AlertTriangle } from 'lucide-react';
import type { DailyReportDetailRow } from '../types';

/**
 * Color de fondo de una línea según su origen. La fecha del parte (`YYYY-MM-DD`) se compara con
 * el DÍA argentino de `created_at`: una línea creada ese mismo día no cuenta como agregada después.
 */
export function getRowClassName(row: DailyReportDetailRow, reportDate: string): string {
  if (row.last_comercial_edit_at) return 'bg-brand-subtle/60';
  if (row.created_at && argentinaDate(new Date(row.created_at)) > reportDate) return 'bg-warn-subtle/60';
  return '';
}

/** Leyenda de colores de fila (muestra + texto: el color solo no comunica). */
export function RowColorLegend() {
  return (
    <ul className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" aria-label="Referencias de colores">
      <li className="flex items-center gap-1.5">
        <span className="bg-brand-subtle border-border size-3 rounded-sm border" aria-hidden="true" />
        Editada por Comercial
      </li>
      <li className="flex items-center gap-1.5">
        <span className="bg-warn-subtle border-border size-3 rounded-sm border" aria-hidden="true" />
        Agregada después de la fecha del parte
      </li>
      <li className="flex items-center gap-1.5">
        <AlertTriangle className="size-3.5" aria-hidden="true" />
        Con desvíos de personal o equipos
      </li>
    </ul>
  );
}
