'use client';

import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';
import {
  PERIOD_GRANULARITIES,
  PERIOD_GRANULARITY_LABELS,
  isLastNavigablePeriod,
  shiftAnchor,
  todayAnchor,
  type PeriodGranularity,
} from '../utils/periods';

interface Props {
  granularity: PeriodGranularity;
  anchor: string;
  onChange: (granularity: PeriodGranularity, anchor: string) => void;
  /** Etiqueta del período actual, ya formateada. */
  label: string;
  /** Sufijo del `aria-label` de las flechas, p. ej. "de solicitudes". */
  navSubject?: string;
}

/**
 * Selector de corte temporal compartido por los gráficos de mantenimiento:
 * granularidad (día / mes / trimestre / año) + navegación período a período.
 *
 * Cambiar de granularidad conserva la fecha ancla, así el usuario que está
 * mirando agosto y pasa a "Trimestre" cae en el trimestre que contiene agosto,
 * no en uno arbitrario.
 */
export function PeriodSelector({ granularity, anchor, onChange, label, navSubject }: Props) {
  const canGoForward = !isLastNavigablePeriod(granularity, anchor);
  const suffix = navSubject ? ` ${navSubject}` : '';

  const handleGranularityChange = React.useCallback(
    (value: string) => {
      // Radix emite '' cuando se deselecciona el item activo: ignorar.
      if (!value) return;
      onChange(value as PeriodGranularity, anchor);
    },
    [anchor, onChange]
  );

  const handleShift = React.useCallback(
    (delta: number) => {
      onChange(granularity, shiftAnchor(granularity, anchor, delta));
    },
    [granularity, anchor, onChange]
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        className="max-w-full overflow-x-auto"
        value={granularity}
        onValueChange={handleGranularityChange}
        aria-label="Corte temporal"
      >
        {PERIOD_GRANULARITIES.map((g) => (
          <ToggleGroupItem key={g} value={g} className="h-7 px-2.5 text-xs">
            {PERIOD_GRANULARITY_LABELS[g]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="flex items-center gap-1 rounded-md border bg-card/40 p-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => handleShift(-1)}
          aria-label={`Período anterior${suffix}`}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[104px] px-1 text-center text-sm font-medium tabular-nums">{label}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={!canGoForward}
          onClick={() => handleShift(1)}
          aria-label={`Período siguiente${suffix}`}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-muted-foreground"
        onClick={() => onChange(granularity, todayAnchor())}
      >
        Hoy
      </Button>
    </div>
  );
}
