'use client';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useDataTablePending } from '@/shared/components/common/DataTable/DataTablePendingContext';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { CalendarIcon, X } from 'lucide-react';
import moment from 'moment';
import { useState } from 'react';
import type { DateRange } from 'react-day-picker';

const ISO_DAY = 'YYYY-MM-DD';

/** "Hoy" argentino como `moment` local a medianoche: `format('YYYY-MM-DD')` devuelve ese mismo día en cualquier zona. */
const todayAr = () => moment(argentinaDate(), ISO_DAY);

interface PeriodPreset {
  label: string;
  range: () => { from: moment.Moment; to: moment.Moment };
}

/** Atajos hacia atrás desde hoy: un reporte mira el pasado (los del selector de carga miran hacia adelante). */
const PRESETS: PeriodPreset[] = [
  { label: 'Hoy', range: () => ({ from: todayAr(), to: todayAr() }) },
  { label: 'Últimos 7 días', range: () => ({ from: todayAr().subtract(6, 'days'), to: todayAr() }) },
  { label: 'Últimos 30 días', range: () => ({ from: todayAr().subtract(29, 'days'), to: todayAr() }) },
  { label: 'Este mes', range: () => ({ from: todayAr().startOf('month'), to: todayAr().endOf('month') }) },
  {
    label: 'Mes anterior',
    range: () => ({
      from: todayAr().subtract(1, 'month').startOf('month'),
      to: todayAr().subtract(1, 'month').endOf('month'),
    }),
  },
  { label: 'Este año', range: () => ({ from: todayAr().startOf('year'), to: todayAr().endOf('year') }) },
];

interface PeriodFilterProps {
  /** Namespace de la tabla: los params de la URL van como `<namespace>__date_from` / `__date_to`. */
  paramNamespace: string;
  /** Período activo (`YYYY-MM-DD`), tomado del estado de la tabla. */
  dateFrom: string | undefined;
  dateTo: string | undefined;
}

/**
 * Rango de fechas de la novedad con atajos hacia atrás. Va en la barra de la tabla y escribe en la URL igual que
 * los filtros propios del DataTable (`replaceState` + aviso a la tabla), así el período entra al fetch, a los
 * facets, a los totales y al export sin tocar nada más.
 */
export function PeriodFilter({ paramNamespace, dateFrom, dateTo }: PeriodFilterProps) {
  const { notifyUrlChange } = useDataTablePending();
  const [open, setOpen] = useState(false);
  // Selección a medio hacer (solo el "desde"): el rango recién se aplica cuando hay "desde" y "hasta".
  const [draft, setDraft] = useState<DateRange | undefined>(undefined);

  const from = dateFrom ? moment(dateFrom, ISO_DAY, true) : null;
  const to = dateTo ? moment(dateTo, ISO_DAY, true) : null;
  const hasValue = Boolean(from?.isValid() || to?.isValid());

  const applyRange = (nextFrom: string | null, nextTo: string | null) => {
    const params = new URLSearchParams(window.location.search);
    const prefix = `${paramNamespace}__`;
    for (const [key, value] of [
      [`${prefix}date_from`, nextFrom],
      [`${prefix}date_to`, nextTo],
    ] as const) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.set(`${prefix}page`, '1');
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params.toString()}`);
    notifyUrlChange();
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setDraft(undefined);
  };

  const handleSelectRange = (range: DateRange | undefined) => {
    setDraft(range);
    if (range?.from && range.to) {
      applyRange(moment(range.from).format(ISO_DAY), moment(range.to).format(ISO_DAY));
      handleOpenChange(false);
    }
  };

  const handlePreset = (preset: PeriodPreset) => {
    const { from: presetFrom, to: presetTo } = preset.range();
    applyRange(presetFrom.format(ISO_DAY), presetTo.format(ISO_DAY));
    handleOpenChange(false);
  };

  const label = hasValue
    ? `${from?.isValid() ? from.format('DD/MM/YYYY') : 'Sin límite'} → ${to?.isValid() ? to.format('DD/MM/YYYY') : 'Sin límite'}`
    : 'Período';

  const selected: DateRange | undefined =
    draft ?? (from?.isValid() && to?.isValid() ? { from: from.toDate(), to: to.toDate() } : undefined);

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn('h-9 gap-1.5 font-normal', !hasValue && 'border-dashed')}
            aria-label={hasValue ? `Período de las novedades: ${label}` : 'Elegir el período de las novedades'}
          >
            <CalendarIcon aria-hidden="true" className="size-3.5" />
            <span className="tabular-nums">{label}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="flex w-auto max-w-[calc(100vw-1rem)] flex-col p-0 sm:flex-row" align="end">
          <div className="flex flex-wrap gap-1 border-b p-2 sm:w-40 sm:flex-col sm:flex-nowrap sm:border-r sm:border-b-0">
            {PRESETS.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant="ghost"
                size="sm"
                className="justify-start"
                onClick={() => handlePreset(preset)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <Calendar
            mode="range"
            numberOfMonths={2}
            selected={selected}
            defaultMonth={selected?.from ?? todayAr().toDate()}
            onSelect={handleSelectRange}
            autoFocus
          />
        </PopoverContent>
      </Popover>
      {hasValue && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9"
          onClick={() => applyRange(null, null)}
          aria-label="Quitar el período"
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      )}
    </div>
  );
}
