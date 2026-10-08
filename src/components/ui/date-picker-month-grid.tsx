'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { MONTH_LABELS, MONTH_NAMES } from '@/components/ui/date-picker-text';
import { cn } from '@/lib/utils';

export type MonthGridProps = {
  value: Date | null;
  initialYear: number;
  yearRange?: { from: number; to: number };
  isMonthDisabled: (date: Date) => boolean;
  onSelect: (date: Date) => void;
};

/** Grid de 12 meses con navegación de año (rdp no trae selector de mes). Flechas mueven el foco. */
export function MonthGrid({ value, initialYear, yearRange, isMonthDisabled, onSelect }: MonthGridProps) {
  const [year, setYear] = React.useState(initialYear);
  const selectedIndex = value && value.getFullYear() === year ? value.getMonth() : -1;
  const today = new Date();
  const focusIndex = selectedIndex >= 0 ? selectedIndex : today.getFullYear() === year ? today.getMonth() : 0;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 }[event.key];
    const current = Number((event.target as HTMLElement).dataset.month);
    if (step === undefined || Number.isNaN(current)) return;
    event.preventDefault();
    const target = event.currentTarget.querySelector<HTMLButtonElement>(`[data-month="${current + step}"]`);
    target?.focus();
  };

  return (
    <div className="w-[15.75rem] p-3 pointer-coarse:w-[21rem]">
      <div className="mb-2 flex h-8 items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Año anterior"
          disabled={yearRange ? year <= yearRange.from : false}
          onClick={() => setYear((prev) => prev - 1)}
        >
          <ChevronLeft />
        </Button>
        <span className="text-sm font-medium tabular-nums" aria-live="polite">
          {year}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Año siguiente"
          disabled={yearRange ? year >= yearRange.to : false}
          onClick={() => setYear((prev) => prev + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
      <div role="group" aria-label={`Meses de ${year}`} className="grid grid-cols-3 gap-1" onKeyDown={handleKeyDown}>
        {MONTH_LABELS.map((label, index) => {
          const monthDate = new Date(year, index, 1);
          const selected = index === selectedIndex;
          return (
            <Button
              key={label}
              type="button"
              variant="ghost"
              size="md"
              data-month={index}
              aria-pressed={selected}
              aria-label={`${MONTH_NAMES[index]} de ${year}`}
              autoFocus={index === focusIndex}
              disabled={isMonthDisabled(monthDate)}
              onClick={() => onSelect(monthDate)}
              className={cn(
                'capitalize pointer-coarse:h-11',
                selected && 'bg-primary text-primary-foreground hover:bg-primary-hover'
              )}
            >
              {label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
