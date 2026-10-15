import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export interface ChartSummaryColumn {
  key: string;
  header: string;
  /** Alinea números a la derecha. */
  numeric?: boolean;
}

export interface ChartSummaryProps {
  /** Nombre del gráfico (se usa en el resumen de la tabla alternativa). */
  title: string;
  /** Lectura textual del gráfico: qué muestra y su conclusión principal. */
  summary: string;
  columns: ChartSummaryColumn[];
  rows: Array<Record<string, ReactNode>>;
  className?: string;
}

/**
 * Alternativa textual de un gráfico: párrafo de resumen visible para lectores de pantalla y una tabla
 * con los datos en un `<details>` nativo (teclado y foco sin JS). El gráfico en sí va con
 * `aria-hidden` o `role="img"` + `aria-label` según el caso.
 */
export function ChartSummary({ title, summary, columns, rows, className }: ChartSummaryProps) {
  return (
    <div className={cn('min-w-0 text-sm', className)}>
      <p className="sr-only">{summary}</p>
      <details className="group min-w-0 rounded-md border bg-card text-card-foreground">
        <summary className="cursor-pointer select-none rounded-md px-3 py-2 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Ver datos de «{title}» en tabla
        </summary>
        <div className="min-w-0 max-w-full overflow-x-auto px-3 pb-3">
          <p className="py-2 text-xs text-muted-foreground">{summary}</p>
          <table className="w-full text-xs tabular-nums">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="border-b">
                {columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={cn('py-1 pr-3 font-medium', column.numeric ? 'text-right' : 'text-left')}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-b last:border-0">
                  {columns.map((column) => (
                    <td key={column.key} className={cn('py-1 pr-3', column.numeric && 'text-right')}>
                      {row[column.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
