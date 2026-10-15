'use client';

import { useQuery } from '@tanstack/react-query';
import { TrendingUp } from 'lucide-react';
import React from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { type ChartConfig } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { NO_DATA_LABEL } from '@/features/Dashboard/lib/metric';
import { ChartSummary } from '@/features/Dashboard/shared/charts/ChartSummary';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { getDailyAbsenceTimeseries } from '../actions.server';
import { resolveTrendRange, trendRangeLabel, type TrendRange } from '../lib/trend-range';
import { TrendRangeControls } from './TrendRangeControls';
import { HeadcountTrendChartComponent } from './charts/headcount-trend-chart';

const chartConfig = {
  dotacion: {
    label: 'Dotación',
    color: 'var(--dash-cat-6, #5c53da)',
  },
} satisfies ChartConfig;

interface HeadcountTrendChartProps {
  companyId: string;
}

export function HeadcountTrendChart({ companyId }: HeadcountTrendChartProps) {
  const [timeRange, setTimeRange] = React.useState<TrendRange>('7d');
  const [selectedMonth, setSelectedMonth] = React.useState<Date | undefined>(undefined);

  const range = React.useMemo(() => resolveTrendRange(timeRange, selectedMonth), [selectedMonth, timeRange]);

  const {
    data: rawData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['daily-absence-timeseries', companyId, range?.from, range?.to],
    queryFn: () => getDailyAbsenceTimeseries(range?.from, range?.to),
    enabled: !!companyId && !!range,
  });

  const data = (rawData ?? []).map((d) => ({ date: d.fecha, dotacion: d.totalDotacion }));

  const currentValue = data.length > 0 ? data[data.length - 1].dotacion : null;
  const baseline = !selectedMonth && timeRange === '7d' ? data[data.length - 2] : data[0];
  const trend = data.length >= 2 && currentValue !== null && baseline ? currentValue - baseline.dotacion : null;
  const isPositive = trend !== null && trend > 0;

  const rangeLabel = trendRangeLabel(timeRange, selectedMonth);
  const trendTextSuffix = selectedMonth
    ? 'respecto al inicio del mes'
    : timeRange === '7d'
      ? 'respecto al día anterior'
      : timeRange === '30d'
        ? 'respecto al inicio de los 30 días'
        : 'respecto al inicio de los 3 meses';

  const description = !range
    ? 'El mes elegido todavía no tiene mediciones'
    : selectedMonth
      ? `Mostrando datos de ${rangeLabel}`
      : `Mostrando últimos ${rangeLabel}`;

  const summary =
    data.length === 0
      ? 'No hay mediciones de dotación para el período.'
      : `Dotación diaria entre ${data[0].date} y ${data[data.length - 1].date}. Último valor: ${currentValue}.`;

  return (
    <Card className="pt-0">
      <CardHeader className="flex flex-col items-stretch gap-2 space-y-0 border-b py-5 sm:flex-row sm:items-center">
        <div className="grid flex-1 gap-1">
          <CardTitle className="text-lg font-semibold">Variación de Dotación</CardTitle>
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
          <Skeleton className="h-[250px] w-full rounded-lg" aria-label="Cargando variación de dotación" />
        ) : isError ? (
          <StateBlock
            variant="error"
            title="No se pudo cargar la variación de dotación"
            description="Probá de nuevo en unos segundos."
            action={
              <Button type="button" variant="outline" onClick={() => refetch()}>
                Reintentar
              </Button>
            }
          />
        ) : data.length === 0 ? (
          <StateBlock
            variant="empty"
            title="Sin mediciones"
            description="No hay datos de dotación para este período."
          />
        ) : (
          <div className="space-y-3">
            <div aria-hidden="true">
              <HeadcountTrendChartComponent
                chartConfig={chartConfig}
                data={data}
                showLabels={!selectedMonth && timeRange === '7d'}
              />
            </div>
            <ChartSummary
              title="Variación de dotación"
              summary={summary}
              columns={[
                { key: 'date', header: 'Fecha' },
                { key: 'dotacion', header: 'Dotación', numeric: true },
              ]}
              rows={data.map((point) => ({ date: point.date, dotacion: point.dotacion }))}
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
              {isPositive ? 'Incremento' : 'Reducción'} de {Math.abs(trend)} {trendTextSuffix}
              <TrendingUp
                aria-hidden="true"
                className={`h-4 w-4 text-muted-foreground ${isPositive ? '' : 'rotate-180'}`}
              />
            </>
          )}
        </div>
        <div className="text-muted-foreground leading-none">Dotación actual: {currentValue ?? NO_DATA_LABEL}</div>
      </CardFooter>
    </Card>
  );
}
