'use client';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { CalendarIcon } from 'lucide-react';
import moment from 'moment';
import { useState } from 'react';
import { isoDayToDate } from '../lib/massive-ranges';

export interface PickerDateRange {
  from: Date;
  to: Date;
}

interface Preset {
  label: string;
  days: number;
}

interface DateRangePresetPickerProps {
  value: PickerDateRange | undefined;
  onChange: (range: PickerDateRange) => void;
  presets?: Preset[];
  /** Tope de días del rango: si se supera se avisa debajo (la validación dura la hace el servidor). */
  maxDays?: number;
  /** Primer día elegible; los atajos arrancan desde acá (por defecto, hoy en Argentina). */
  minDate?: Date;
  className?: string;
}

const DEFAULT_PRESETS: Preset[] = [
  { label: '7 días', days: 7 },
  { label: '14 días', days: 14 },
  { label: '30 días', days: 30 },
  { label: '60 días', days: 60 },
];

/**
 * Rango de fechas con atajos (7, 14, 30, 60 días) y calendario de dos meses. Es un rango y no una fecha suelta,
 * así que no lleva escritura directa.
 */
export function DateRangePresetPicker({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  maxDays,
  minDate,
  className,
}: DateRangePresetPickerProps) {
  const [open, setOpen] = useState(false);

  const applyPreset = (days: number) => {
    // Sin `minDate` se arranca en el "hoy" argentino (no el del navegador); "N días" son exactamente N días.
    const from = minDate ? moment(minDate).startOf('day').toDate() : isoDayToDate(argentinaDate());
    onChange({
      from,
      to: moment(from)
        .add(days - 1, 'days')
        .toDate(),
    });
    setOpen(false);
  };

  const totalDays = value ? moment(value.to).startOf('day').diff(moment(value.from).startOf('day'), 'days') + 1 : 0;
  const exceedsMax = Boolean(maxDays && totalDays > maxDays);

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="justify-start font-normal">
            <CalendarIcon aria-hidden="true" className="mr-2 size-4" />
            {value
              ? `${moment(value.from).format('DD/MM/YYYY')} → ${moment(value.to).format('DD/MM/YYYY')} · ${totalDays} días`
              : 'Elegir rango'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="flex w-auto max-w-[calc(100vw-1rem)] flex-col p-0 sm:flex-row" align="start">
          <div className="flex flex-row gap-1 border-b p-2 sm:min-w-36 sm:flex-col sm:border-r sm:border-b-0">
            {presets.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant="ghost"
                size="sm"
                className="justify-start"
                onClick={() => applyPreset(preset.days)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <Calendar
            mode="range"
            numberOfMonths={2}
            selected={value}
            onSelect={(range) => {
              if (range?.from && range?.to) onChange({ from: range.from, to: range.to });
            }}
            disabled={minDate ? { before: minDate } : undefined}
            autoFocus
          />
        </PopoverContent>
      </Popover>
      {exceedsMax && <p className="text-warn text-xs">El rango supera el máximo de {maxDays} días.</p>}
    </div>
  );
}
