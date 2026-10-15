'use client';

import { useQuery } from '@tanstack/react-query';
import { TrendingUp } from 'lucide-react';
import React from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { type ChartConfig } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPercentOrDash } from '@/features/Dashboard/lib/metric';
import { ChartSummary } from '@/features/Dashboard/shared/charts/ChartSummary';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { getAbsenteeismTrend } from '../actions.server';
import { resolveTrendRange, trendRangeLabel, type TrendRange } from '../lib/trend-range';
import { TrendRangeControls } from './TrendRangeControls';
import { AbsenteeismTrendChartComponent, EXPECTED_ABSENTEEISM_PERCENTAGE } from './charts/absenteeism-trend-chart';

const chartConfig = {
  percentage: {
    label: 'Ausentismo',
    color: 'var(--dash-cat-1, #ec4b7f)',
  },
} satisfies ChartConfig;

interface AbsenteeismTrendChartProps {
  companyId: string;
}

export function AbsenteeismTrendChart({ companyId }: AbsenteeismTrendChartProps) {
  const [timeRange, setTimeRange] = React.useState<TrendRange>('7d');
  const [selectedMonth, setSelectedMonth] = React.useState<Date | undefined>(undefined);

  const range = React.useMemo(() => resolveTrendRange(timeRange, selectedMonth), [selectedMonth, timeRange]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['absenteeism-trend', companyId, range?.from, range?.to],
    queryFn: () => getAbsenteeismTrend(range?.from, range?.to),
    enabled: !!companyId && !!range,
  });

  const points = data ?? [];
  const currentValue = points.length > 0 ? points[points.length - 1].percentage : null;
  // Con 7 días se compara contra el día anterior; con un mes o un período largo, contra el primer punto.
  const baseline = !selectedMonth && timeRange === '7d' ? points[points.length - 2] : points[0];
  const trend =
    points.length >= 2 && currentValue !== null && baseline
      ? Math.round((currentValue - baseline.percentage) * 100) / 100
      : null;
  const isPositive = trend !== null && trend > 0;

  const rangeLabel = trendRangeLabel(timeRange, selectedMonth);
  const trendTextSuffix = selectedMonth
    ? 'respecto al inicio del mes'
    : timeRange === '7d'
      ? 'desde el día anterior'
      : 'respecto al inicio del período';

  const description = !range
    ? 'El mes elegido todavía no tiene mediciones'
    : selectedMonth
      ? `Mostrando datos de ${rangeLabel}`
      : `Mostrando últimos ${rangeLabel}`;

  const summary =
    points.length === 0
      ? 'No hay mediciones de ausentismo para el período.'
      : `Ausentismo diario entre ${points[0].date} y ${points[points.length - 1].date}. ` +
        `Último valor: ${formatPercentOrDash(currentValue)}; esperado hasta ${EXPECTED_ABSENTEEISM_PERCENTAGE} %.`;

  return (
    <Card className="@container pt-0">
      <CardHeader className="flex flex-col items-stretch gap-2 space-y-0 border-b py-5 @xl:flex-row @xl:items-center">
        <div className="grid min-w-0 flex-1 gap-1">
          <CardTitle className="text-lg font-semibold">Variación de Ausentismo</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <TrendRangeControls
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          selectedMonth={selectedMonth}
          onSelectedMonthChange={setSelectedMonth}
        />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[250px] w-full rounded-lg" aria-label="Cargando variación de ausentismo" />
        ) : isError ? (
          <StateBlock
            variant="error"
            title="No se pudo cargar la variación de ausentismo"
            description="Probá de nuevo en unos segundos."
            action={
              <Button type="button" variant="outline" onClick={() => refetch()}>
                Reintentar
              </Button>
            }
          />
        ) : points.length === 0 ? (
          <StateBlock
            variant="empty"
            title="Sin mediciones"
            description="No hay datos de ausentismo para este período."
          />
        ) : (
          <div className="space-y-3">
            <div aria-hidden="true">
              <AbsenteeismTrendChartComponent
                chartConfig={chartConfig}
                data={points}
                showLabels={!selectedMonth && timeRange === '7d'}
              />
            </div>
            <ChartSummary
              title="Variación de ausentismo"
              summary={summary}
              columns={[
                { key: 'date', header: 'Fecha' },
                { key: 'percentage', header: 'Ausentismo', numeric: true },
              ]}
              rows={points.map((point) => ({ date: point.date, percentage: formatPercentOrDash(point.percentage) }))}
            />
          </div>
        )}
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 leading-none font-medium">
          {trend === null ? (
            <span className="text-muted-foreground">Sin datos suficientes para calcular la variación</span>
          ) : trend === 0 ? (
            <span>Sin variación {trendTextSuffix}</span>
          ) : (
            <>
              {isPositive ? 'Incremento' : 'Reducción'} de {Math.abs(trend).toFixed(2)} puntos porcentuales{' '}
              {trendTextSuffix}
              <TrendingUp
                aria-hidden="true"
                className={`h-4 w-4 ${isPositive ? 'text-[var(--dash-danger,#843b3e)]' : 'text-[var(--dash-ok,#52a27a)] rotate-180'}`}
              />
            </>
          )}
        </div>
        <div className="text-muted-foreground leading-none">Ausentismo actual: {formatPercentOrDash(currentValue)}</div>
      </CardFooter>
    </Card>
  );
}
