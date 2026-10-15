import { cn } from '@/lib/utils';
import { AlertTriangle, Ban, Check, ChevronRight, Loader2, type LucideIcon } from 'lucide-react';
import { Fragment } from 'react';
import type { SectorRouteState, SectorRouteStep } from '../../lib/sector-route';

export type { SectorRouteStep };

const STATE_LABELS: Record<SectorRouteState, string> = {
  done: 'completado',
  running: 'en curso',
  stuck: 'trabado, requiere acción',
  pending: 'pendiente',
  rejected: 'rechazado',
};

const STATE_STYLES: Record<SectorRouteState, string> = {
  done: 'bg-ok-subtle text-ok-subtle-foreground',
  running: 'bg-brand-subtle text-brand-subtle-foreground ring-1 ring-brand/45 ring-inset',
  stuck: 'bg-warn-subtle text-warn-subtle-foreground',
  pending: 'bg-muted text-muted-foreground',
  rejected: 'bg-danger-subtle text-danger-subtle-foreground',
};

const STATE_ICONS: Record<SectorRouteState, LucideIcon | null> = {
  done: Check,
  running: Loader2,
  stuck: AlertTriangle,
  pending: null,
  rejected: Ban,
};

interface SectorRouteProps {
  sectors: SectorRouteStep[];
  /** Texto cuando todavía no hay recorrido. Por defecto "Sin OTs generadas"; "Sin programar" para pedidos sin fecha. */
  emptyLabel?: string;
  /** `warn` pide acción (faltan OTs); `muted` es un estado normal del circuito (aún sin programar). */
  emptyTone?: 'warn' | 'muted';
}

/** Recorrido de la orden por los sectores en orden de ejecución, con el estado de cada uno. */
export function SectorRoute({ sectors, emptyLabel = 'Sin OTs generadas', emptyTone = 'warn' }: SectorRouteProps) {
  if (sectors.length === 0) {
    return (
      <span
        className={cn(
          'inline-flex h-6 items-center rounded-md px-2 text-[12.5px] font-medium whitespace-nowrap',
          emptyTone === 'warn' ? 'bg-warn-subtle text-warn-subtle-foreground' : 'bg-muted text-muted-foreground'
        )}
      >
        {emptyLabel}
      </span>
    );
  }

  return (
    <ol className="flex flex-wrap items-center gap-1" aria-label="Recorrido por sectores">
      {sectors.map((sector, index) => {
        const Icon = STATE_ICONS[sector.state];
        return (
          <Fragment key={sector.id}>
            {index > 0 ? (
              <li aria-hidden="true" className="text-muted-foreground flex">
                <ChevronRight className="size-3.5" />
              </li>
            ) : null}
            <li
              title={`${sector.name}: ${STATE_LABELS[sector.state]}`}
              className={cn(
                'inline-flex h-6 max-w-40 items-center gap-1 rounded-md px-2 text-[12.5px] font-medium',
                STATE_STYLES[sector.state]
              )}
            >
              {Icon ? <Icon className="size-3 shrink-0" aria-hidden="true" /> : null}
              <span className="truncate">{sector.name}</span>
              <span className="sr-only">: {STATE_LABELS[sector.state]}</span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
