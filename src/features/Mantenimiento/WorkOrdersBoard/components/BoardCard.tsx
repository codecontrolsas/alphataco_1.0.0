'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatArgentinaDay, formatDateOnlyAr } from '@/shared/lib/argentina-time';
import { MaintenanceStatusPill } from '../../shared/components/MaintenanceStatusPill';
import { ResourceCell } from '../../shared/components/ResourceCell';
import type { BoardCardData } from '../lib/types';

interface BoardCardProps {
  card: BoardCardData;
  onOpen: (orderId: string) => void;
}

function ageText(days: number | null): string | null {
  if (days === null) return null;
  if (days === 0) return 'hoy';
  return days === 1 ? '1 día' : `${days} días`;
}

/**
 * Tarjeta de una orden. Es un `<button>`: se llega con Tab, se abre con Enter o Espacio y muestra el foco. Solo
 * lectura: abre la ficha de la orden, donde siguen las transiciones y sus permisos. El estado va con ícono y texto.
 */
export function BoardCard({ card, onOpen }: BoardCardProps) {
  const age = ageText(card.ageDays);
  const date = card.date ? (card.dateKind === 'day' ? formatDateOnlyAr(card.date) : formatArgentinaDay(card.date)) : null;
  const title = card.orderNumber ?? 'Se asigna al ingresar';

  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={() => onOpen(card.id)}
        aria-label={`Abrir la orden ${title}, equipo ${card.resource.identifier}`}
        className={cn(
          'bg-card hover:bg-accent/40 flex w-full min-w-0 cursor-pointer flex-col gap-2 rounded-lg border p-3 text-left transition-colors',
          'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2'
        )}
      >
        <div className="flex min-w-0 items-start justify-between gap-2">
          <ResourceCell resource={card.resource} />
          {age ? (
            <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums" title={`${card.dateLabel} hace ${age}`}>
              {age}
            </span>
          ) : null}
        </div>
        <p className="min-w-0 truncate font-mono text-sm font-semibold" title={title}>
          {title}
        </p>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <MaintenanceStatusPill entity="order" status={card.status} size="sm" />
          {card.returned ? <Badge variant="warning">Devuelta</Badge> : null}
        </div>
        {date ? (
          <p className="text-muted-foreground min-w-0 truncate text-xs">
            {card.dateLabel}: {date}
          </p>
        ) : null}
        {card.sectors.length > 0 ? (
          <p className="text-muted-foreground min-w-0 truncate text-xs" title={card.sectors.join(', ')}>
            {card.sectors.join(' · ')}
          </p>
        ) : null}
      </button>
    </li>
  );
}
