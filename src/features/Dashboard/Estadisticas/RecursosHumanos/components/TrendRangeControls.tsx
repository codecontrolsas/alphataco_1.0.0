'use client';

import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { YearMonthPicker } from '@/components/ui/year-month-picker';
import type { TrendRange } from '../lib/trend-range';

interface TrendRangeControlsProps {
  timeRange: TrendRange;
  onTimeRangeChange: (range: TrendRange) => void;
  selectedMonth: Date | undefined;
  onSelectedMonthChange: (month: Date | undefined) => void;
}

/** Selector de mes y de rango (7 / 30 / 90 días) que comparten los gráficos de tendencia de RRHH. */
export function TrendRangeControls({
  timeRange,
  onTimeRangeChange,
  selectedMonth,
  onSelectedMonthChange,
}: TrendRangeControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <YearMonthPicker
        date={selectedMonth}
        key={selectedMonth?.toISOString() || ''}
        setDate={onSelectedMonthChange}
        placeholder="Buscar por mes"
      />
      {selectedMonth && (
        <Button
          type="button"
          onClick={() => onSelectedMonthChange(undefined)}
          className="px-2 py-1"
          title="Limpiar filtro de mes"
          aria-label="Limpiar filtro de mes"
          variant="ghost"
        >
          <X className="h-5 w-5 text-[var(--dash-danger,#843b3e)]" aria-hidden="true" />
        </Button>
      )}
      <Select
        value={timeRange}
        onValueChange={(value) => onTimeRangeChange(value as TrendRange)}
        disabled={!!selectedMonth}
      >
        <SelectTrigger className="w-[160px] rounded-lg" aria-label="Seleccionar rango">
          <SelectValue placeholder="Últimos 7 días" />
        </SelectTrigger>
        <SelectContent className="rounded-xl">
          <SelectItem value="90d" className="rounded-lg">
            Últimos 3 meses
          </SelectItem>
          <SelectItem value="30d" className="rounded-lg">
            Últimos 30 días
          </SelectItem>
          <SelectItem value="7d" className="rounded-lg">
            Últimos 7 días
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
