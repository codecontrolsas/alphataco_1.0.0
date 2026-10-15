'use client';

import { cn } from '@/lib/utils';

interface WorkdaysProgressProps {
  worked: number;
  possible: number;
  // Opcional: contexto (ej: nombre del filtro activo) que se muestra como caption.
  context?: string;
  className?: string;
}

/**
 * Barra de progreso fina que muestra la utilizacion de la flota:
 * dias trabajados (numerador) sobre dias posibles (denominador = vehiculos * dias del rango).
 *
 * El tinte del fill comunica nivel de utilizacion:
 *   < 30%: rose   (subutilizada)
 *   30-70%: amber (parcial)
 *   > 70%: emerald (alta)
 */
export function WorkdaysProgress({ worked, possible, context, className }: WorkdaysProgressProps) {
  const pct = possible > 0 ? Math.min(100, Math.round((worked / possible) * 100)) : 0;
  const noData = possible === 0;

  const fillClass = pct < 30 ? 'bg-[var(--dash-danger)]' : pct < 70 ? 'bg-[var(--dash-warn)]' : 'bg-[var(--dash-ok)]';
  const textClass =
    pct < 30 ? 'text-[var(--dash-danger)]' : pct < 70 ? 'text-[var(--dash-warn)]' : 'text-[var(--dash-ok)]';

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-muted-foreground">
          Días trabajados {context && <span className="text-muted-foreground/70">· {context}</span>}
        </span>
        <span className="tabular-nums text-muted-foreground">
          {noData ? (
            <span className="text-muted-foreground/60">— sin datos del rango</span>
          ) : (
            <>
              <span className="font-semibold text-foreground">{worked.toLocaleString('es-AR')}</span>
              <span className="mx-1 text-muted-foreground/60">/</span>
              <span>{possible.toLocaleString('es-AR')}</span>
              <span className={cn('ml-2 font-semibold', textClass)}>{pct}%</span>
            </>
          )}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-300', fillClass)}
          style={{ width: `${pct}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}
