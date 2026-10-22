'use client';

import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/es';

/**
 * Selector de período y agrupación que repiten los gráficos históricos de Estadísticas (servicios de
 * Operaciones y pedidos de Sala de Control): el mes elegido, su ventana de datos y los cubos del eje.
 */

export type Granularity = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

/** Cubo temporal de una fecha: la `key` ordena alfabéticamente igual que cronológicamente. */
export function getBucketKey(dateStr: string, granularity: Granularity): { key: string; label: string } {
  const m = moment(dateStr);

  if (granularity === 'daily') {
    return {
      key: `day-${dateStr}`,
      label: m.format('D MMM'),
    };
  }

  if (granularity === 'weekly') {
    const weekStart = m.clone().startOf('isoWeek');
    const weekEnd = weekStart.clone().add(6, 'days');
    return {
      key: `week-${weekStart.format('YYYY-MM-DD')}`,
      label: `${weekStart.format('D MMM')} - ${weekEnd.format('D MMM')}`,
    };
  }

  if (granularity === 'quarterly') {
    const q = m.quarter();
    const year = m.year();
    return {
      key: `quarter-${year}-Q${q}`,
      label: `T${q} ${year}`,
    };
  }

  // monthly & yearly — same bucket (by month)
  return {
    key: `month-${m.format('YYYY-MM')}`,
    label: m.format('MMM YYYY'),
  };
}

/**
 * Ventana de datos visible según la granularidad, anclada al mes seleccionado. `monthsBack` dice cuántos
 * meses antes del elegido abren las vistas semanal y mensual (cada gráfico usa los suyos).
 */
export function getDataWindow(
  selectedMonth: moment.Moment,
  granularity: Granularity,
  monthsBack: { weekly: number; monthly: number }
): { start: string; end: string } {
  const end = selectedMonth.clone().endOf('month').format('YYYY-MM-DD');

  if (granularity === 'daily') {
    return {
      start: selectedMonth.clone().startOf('month').format('YYYY-MM-DD'),
      end,
    };
  }

  if (granularity === 'weekly') {
    return {
      start: selectedMonth.clone().subtract(monthsBack.weekly, 'months').startOf('month').format('YYYY-MM-DD'),
      end,
    };
  }

  if (granularity === 'monthly') {
    return {
      start: selectedMonth.clone().subtract(monthsBack.monthly, 'months').startOf('month').format('YYYY-MM-DD'),
      end,
    };
  }

  if (granularity === 'quarterly') {
    // 4 trimestres (1 ano) terminando en el trimestre del mes seleccionado
    return {
      start: selectedMonth.clone().subtract(3, 'quarters').startOf('quarter').format('YYYY-MM-DD'),
      end: selectedMonth.clone().endOf('quarter').format('YYYY-MM-DD'),
    };
  }

  // yearly — 12 months back from selected month
  return {
    start: selectedMonth.clone().subtract(11, 'months').startOf('month').format('YYYY-MM-DD'),
    end,
  };
}

interface PeriodControlsProps {
  selectedMonth: moment.Moment;
  onSelectedMonthChange: (update: (month: moment.Moment) => moment.Moment) => void;
  /** Primer mes con datos: no se puede navegar antes. */
  earliestMonth: moment.Moment;
  granularity: Granularity;
  onGranularityChange: (granularity: Granularity) => void;
}

/** Navegador de mes (anterior / siguiente) y selector de agrupación (diario a anual). */
export function PeriodControls({
  selectedMonth,
  onSelectedMonthChange,
  earliestMonth,
  granularity,
  onGranularityChange,
}: PeriodControlsProps) {
  const canGoBack = selectedMonth.isAfter(earliestMonth, 'month');
  const canGoForward = selectedMonth.isBefore(moment(argentinaDate()), 'month');

  // Capitalize first letter for month display
  const monthDisplay = selectedMonth.clone().locale('es').format('MMMM YYYY');
  const capitalizedMonth = monthDisplay.charAt(0).toUpperCase() + monthDisplay.slice(1);

  return (
    <>
      {/* Month navigator */}
      <div className="flex items-center gap-1">
        <Button
          type="button"
          aria-label="Mes anterior"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={!canGoBack}
          onClick={() => onSelectedMonthChange((m) => m.clone().subtract(1, 'month'))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium min-w-[130px] text-center">{capitalizedMonth}</span>
        <Button
          type="button"
          aria-label="Mes siguiente"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={!canGoForward}
          onClick={() => onSelectedMonthChange((m) => m.clone().add(1, 'month'))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Granularity toggle */}
      <ToggleGroup
        type="single"
        value={granularity}
        onValueChange={(val) => {
          if (val) onGranularityChange(val as Granularity);
        }}
        variant="outline"
        size="sm"
        className="max-w-full overflow-x-auto"
      >
        <ToggleGroupItem value="daily">Diario</ToggleGroupItem>
        <ToggleGroupItem value="weekly">Semanal</ToggleGroupItem>
        <ToggleGroupItem value="monthly">Mensual</ToggleGroupItem>
        <ToggleGroupItem value="quarterly">Trimestral</ToggleGroupItem>
        <ToggleGroupItem value="yearly">Anual</ToggleGroupItem>
      </ToggleGroup>
    </>
  );
}
