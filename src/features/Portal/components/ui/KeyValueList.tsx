import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export interface KeyValueRow {
  label: string;
  value: ReactNode;
  /** Números y códigos (legajo, fechas): monoespaciado y de ancho fijo. */
  mono?: boolean;
}

/** Datos de solo lectura como lista de definición: etiqueta arriba en el celular, en dos columnas desde `sm`. */
export function KeyValueList({
  rows,
  stacked = false,
  className,
}: {
  rows: KeyValueRow[];
  /** Siempre etiqueta arriba (columnas angostas). */
  stacked?: boolean;
  className?: string;
}) {
  return (
    <dl className={cn('divide-y', className)}>
      {rows.map((row) => (
        <div
          key={row.label}
          className={cn('grid gap-1 py-3 first:pt-0 last:pb-0', !stacked && 'sm:grid-cols-[12rem_1fr] sm:gap-4')}
        >
          <dt className="text-muted-foreground text-sm">{row.label}</dt>
          <dd className={cn('min-w-0 break-words', row.mono && 'font-mono tabular-nums')}>
            {row.value === null || row.value === undefined || row.value === '' ? (
              <span className="text-muted-foreground">Sin dato</span>
            ) : (
              row.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
