'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { WorkshopSectorWithCount } from '../../WorkshopView/actions.server';

/** Tope de segmentos de la barra de cupos; con más cupos se redondea para que quepan en la tarjeta. */
const MAX_SEGMENTS = 16;

interface SectorCapacityCardProps {
  sector: WorkshopSectorWithCount;
  /** Si el sector es el que filtra la tabla de abajo. */
  pressed: boolean;
  onSelect: () => void;
}

/** Tarjeta de un sector del taller: cupos ocupados y OTs abiertas por estado. Sirve de filtro. */
export function SectorCapacityCard({ sector, pressed, onSelect }: SectorCapacityCardProps) {
  const { maxCapacity, occupiedSlots } = sector;
  const hasCapacity = maxCapacity != null && maxCapacity > 0;
  const isFull = hasCapacity && (sector.availableSlots === 0 || sector.isOverCapacity);

  const segments = hasCapacity ? Math.min(maxCapacity, MAX_SEGMENTS) : 0;
  const filled = hasCapacity ? Math.min(Math.round((occupiedSlots / maxCapacity) * segments), segments) : 0;

  const counts = [
    { label: 'pendientes', value: sector.statusCounts.pending ?? 0 },
    { label: 'en progreso', value: sector.statusCounts.in_progress ?? 0 },
    { label: 'pausadas', value: sector.statusCounts.paused ?? 0 },
  ];

  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onSelect}
      className={cn(
        'bg-card flex min-w-0 flex-col gap-3 rounded-xl border p-4 text-left transition-colors max-md:p-3',
        'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
        pressed ? 'border-brand ring-brand/20 ring-[3px]' : 'hover:border-brand/45'
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate font-semibold">{sector.name}</span>
          {sector.workshopName ? (
            <span className="text-muted-foreground block truncate text-xs">{sector.workshopName}</span>
          ) : null}
        </span>
        {!hasCapacity ? (
          <Badge variant="secondary">Sin cupo configurado</Badge>
        ) : isFull ? (
          <Badge variant="destructive">Completo</Badge>
        ) : (
          <Badge variant="success">
            {sector.availableSlots} {sector.availableSlots === 1 ? 'libre' : 'libres'}
          </Badge>
        )}
      </span>

      {hasCapacity ? (
        <span
          role="img"
          aria-label={`${occupiedSlots} de ${maxCapacity} cupos ocupados`}
          title={isFull ? 'Sector completo: no hay lugar para más unidades' : 'Hay cupos libres'}
          className="flex gap-[3px]"
        >
          {Array.from({ length: segments }, (_, index) => (
            <span
              key={index}
              aria-hidden="true"
              className={cn(
                'h-2 flex-1 rounded-[2px]',
                index < filled ? (isFull ? 'bg-danger' : 'bg-brand') : 'bg-muted'
              )}
            />
          ))}
        </span>
      ) : null}

      <span className="text-muted-foreground grid grid-cols-3 gap-1.5 text-xs [overflow-wrap:anywhere] max-md:text-[11.5px]">
        {counts.map((count) => (
          <span key={count.label}>
            <span className="text-foreground block font-mono text-lg font-semibold tabular-nums">{count.value}</span>
            {count.label}
          </span>
        ))}
      </span>
    </button>
  );
}
