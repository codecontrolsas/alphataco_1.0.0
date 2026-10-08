'use client';

import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Separator } from '@/components/ui/separator';

import type { UrlDateRangeState } from './use-url-date-range';

interface DateRangeFilterBodyProps {
  state: UrlDateRangeState;
  /** Enfoca el calendario al montar (popover). En el acordeón mobile va en `false`. */
  autoFocus?: boolean;
}

/** Cuerpo del filtro de fechas (dos calendarios "Desde"/"Hasta" + "Limpiar fechas"). */
export function DateRangeFilterBody({ state, autoFocus = true }: DateRangeFilterBodyProps) {
  const { fromDate, toDate, hasValue, setFrom, setTo, clearFilter } = state;

  return (
    <div className="p-3 space-y-3">
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Desde</p>
        <Calendar mode="single" selected={fromDate} onSelect={setFrom} initialFocus={autoFocus} />
      </div>
      <Separator />
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Hasta</p>
        <Calendar mode="single" selected={toDate} onSelect={setTo} />
      </div>
      {hasValue && (
        <Button type="button" variant="ghost" size="sm" className="w-full h-7" onClick={clearFilter}>
          <X className="h-3.5 w-3.5 mr-1" />
          Limpiar fechas
        </Button>
      )}
    </div>
  );
}
