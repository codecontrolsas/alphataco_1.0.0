'use client';

import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

interface Totals {
  /** Secciones con pendientes (lo mismo que cuenta el contador del widget). */
  sections: number;
  /** Casos en total (suma de las filas). */
  cases: number;
  danger: number;
  warn: number;
  info: number;
}

/**
 * «Para atender» como acordeón (#802): cerrado muestra los totales (casos, secciones y cuántos están vencidos, esperan
 * una decisión o siguen en curso); abierto, la lista. Botón con `aria-expanded`/`aria-controls`, se maneja con
 * teclado (Enter/Espacio) y el foco queda visible.
 */
export function AttentionInboxAccordion({ totals, children }: { totals: Totals; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const parts = [
    totals.danger > 0 ? { tone: 'danger', text: `${totals.danger.toLocaleString('es-AR')} vencidos` } : null,
    totals.warn > 0 ? { tone: 'warn', text: `${totals.warn.toLocaleString('es-AR')} esperan una decisión` } : null,
    totals.info > 0 ? { tone: 'info', text: `${totals.info.toLocaleString('es-AR')} en curso` } : null,
  ].filter((part): part is { tone: 'danger' | 'warn' | 'info'; text: string } => part !== null);

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className="hover:bg-accent focus-visible:ring-ring flex min-h-14 w-full items-center gap-3 rounded-lg border px-4 py-3 text-left outline-none focus-visible:ring-2"
      >
        <span className="font-mono text-2xl leading-none font-semibold tabular-nums">
          {totals.cases.toLocaleString('es-AR')}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">
            {totals.cases === 1 ? 'caso pendiente' : 'casos pendientes'} en {totals.sections}{' '}
            {totals.sections === 1 ? 'sección' : 'secciones'}
          </span>
          <span className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            {parts.map((part) => (
              <span key={part.tone} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-2 rounded-full',
                    part.tone === 'danger' && 'bg-danger',
                    part.tone === 'warn' && 'bg-warn',
                    part.tone === 'info' && 'bg-info'
                  )}
                />
                {part.text}
              </span>
            ))}
          </span>
        </span>
        <span className="text-muted-foreground hidden text-xs sm:inline">{open ? 'Ocultar' : 'Ver detalle'}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'text-muted-foreground size-4 shrink-0 transition-transform motion-reduce:transition-none',
            open && 'rotate-180'
          )}
        />
      </button>
      <div id={panelId} hidden={!open}>
        {children}
      </div>
    </div>
  );
}
