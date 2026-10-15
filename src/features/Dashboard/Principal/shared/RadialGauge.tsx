'use client';

import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import {
  DEFAULT_GAUGE_THRESHOLDS,
  LEVEL_TEXT_CLASS,
  percentLevel,
  type ThresholdLevel,
} from '@/features/Dashboard/lib/chart-thresholds';
import { formatPercentOrDash } from '@/features/Dashboard/lib/metric';
import { cn } from '@/lib/utils';
import * as React from 'react';
import { PolarAngleAxis, RadialBar, RadialBarChart } from 'recharts';

const DEFAULT_THRESHOLDS = DEFAULT_GAUGE_THRESHOLDS;

const LEVEL_WORD: Record<ThresholdLevel, string> = {
  ok: 'nivel alto',
  warn: 'nivel medio',
  danger: 'nivel bajo',
  neutral: 'sin dato',
};

interface RadialGaugeProps {
  /** 0-100; `null` cuando no se puede medir (no es 0 %). */
  value: number | null;
  label: string;
  /** Color del arco, p. ej. `var(--dash-status-operational)`. */
  accentColor: string;
  thresholds?: { success: number; warning: number };
  className?: string;
}

export const RadialGauge = React.memo(function RadialGauge({
  value,
  label,
  accentColor,
  thresholds = DEFAULT_THRESHOLDS,
  className,
}: RadialGaugeProps) {
  const chartConfig = React.useMemo<ChartConfig>(
    () => ({ value: { label, color: accentColor } }),
    [label, accentColor]
  );

  const chartData = React.useMemo(
    () => [{ name: label, value: value == null ? 0 : Math.min(Math.max(value, 0), 100), fill: accentColor }],
    [label, value, accentColor]
  );

  const level = percentLevel(value, thresholds);
  const text = formatPercentOrDash(value == null ? null : Math.round(value));

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <div role="img" aria-label={`${label}: ${text}, ${LEVEL_WORD[level]}`} className="w-full max-w-[200px]">
        <ChartContainer config={chartConfig} className="h-[110px] w-full">
          <RadialBarChart data={chartData} startAngle={180} endAngle={0} innerRadius="70%" outerRadius="100%">
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="value" cornerRadius={8} background={{ fill: 'var(--muted)' }} />
          </RadialBarChart>
        </ChartContainer>
      </div>
      <div className="relative z-10 -mt-4 text-center">
        <p className={cn('text-2xl font-bold tabular-nums', LEVEL_TEXT_CLASS[level])}>{text}</p>
        <p className="text-xs text-muted-foreground">
          {label}
          <span className="sr-only">, {LEVEL_WORD[level]}</span>
        </p>
      </div>
    </div>
  );
});
