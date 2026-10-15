'use client';

import { CalendarIcon } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/es';
import dynamic from 'next/dynamic';
import * as React from 'react';
import { type DateRange } from 'react-day-picker';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useKpiChartData } from '../hooks/useKpiChartData';

// Lazy-load recharts (~300KB) — solo se carga cuando hay datos para mostrar
const KpiLineChart = dynamic(() => import('./KpiLineChart'), {
  ssr: false,
  loading: () => <ChartAreaSkeleton />,
});

moment.locale('es');

type KpiCode = 'KPI-0001' | 'KPI-0002' | 'KPI-0003' | 'KPI-0004' | 'KPI-0005' | 'KPI-0006';
type TimeRange = '7d' | '30d' | '90d' | '1y';

interface KpiChartProps {
  kpiCode: KpiCode;
  kpiName: string;
  kpiDescription: string;
  expectedPercentage: number;
}

function calculateDateRange(timeRange: TimeRange): { from: Date; to: Date } {
  if (timeRange === '1y') {
    return {
      from: moment().startOf('year').toDate(),
      to: moment().endOf('year').toDate(),
    };
  }

  const daysMap: Record<TimeRange, number> = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
    '1y': 365,
  };

  return {
    from: moment().subtract(daysMap[timeRange], 'days').toDate(),
    to: moment().toDate(),
  };
}

/** Skeleton para el area del grafico mientras carga */
function ChartAreaSkeleton() {
  return (
    <div className="h-[250px] w-full flex flex-col justify-between py-4">
      <Skeleton className="h-px w-full opacity-30" />
      <Skeleton className="h-px w-3/4 opacity-30" />
      <Skeleton className="h-px w-full opacity-30" />
      <Skeleton className="h-px w-5/6 opacity-30" />
      <Skeleton className="h-px w-full opacity-30" />
      <div className="flex justify-between pt-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-8" />
        ))}
      </div>
    </div>
  );
}

export function KpiChart({ kpiCode, kpiName, kpiDescription, expectedPercentage }: KpiChartProps) {
  const [timeRange, setTimeRange] = React.useState<TimeRange>('30d');
  const [dateRange, setDateRange] = React.useState<DateRange>(() => calculateDateRange('30d'));
  const [isCustomRange, setIsCustomRange] = React.useState(false);

  const handleTimeRangeChange = React.useCallback((value: TimeRange) => {
    setTimeRange(value);
    setIsCustomRange(false);
    setDateRange(calculateDateRange(value));
  }, []);

  const handleCalendarSelect = React.useCallback((range: DateRange | undefined) => {
    if (range?.from && range?.to) {
      setIsCustomRange(true);
      setDateRange(range);
    }
  }, []);

  const fromDate = dateRange.from || moment().subtract(30, 'days').toDate();
  const toDate = dateRange.to || moment().toDate();

  const { data: rawData, loading } = useKpiChartData(kpiCode, fromDate, toDate);

  const chartData = React.useMemo(() => {
    if (!rawData || rawData.length === 0) return [];
    return rawData.map((item) => ({
      date: item.snapshot_date,
      indicator: item.metrics?.indicator ?? 0,
    }));
  }, [rawData]);

  const showLabels = React.useMemo(() => {
    if (!dateRange.from || !dateRange.to) return false;
    return moment(dateRange.to).diff(moment(dateRange.from), 'days') <= 15;
  }, [dateRange]);

  const averageIndicator = React.useMemo(() => {
    if (chartData.length === 0) return '0';
    const sum = chartData.reduce((acc, curr) => acc + curr.indicator, 0);
    return (sum / chartData.length).toFixed(1);
  }, [chartData]);

  const invertColors = kpiCode === 'KPI-0003' || kpiCode === 'KPI-0006';

  return (
    <Card className="@container/card w-full">
      {/* Header se renderiza INMEDIATAMENTE con metadata del servidor */}
      <CardHeader className="border-b">
        <div className="grid min-w-0 gap-1">
          <CardTitle>{kpiName}</CardTitle>
          <CardDescription>{kpiDescription}</CardDescription>
        </div>
        <CardAction className="col-start-1 row-span-1 row-start-2 justify-self-start @2xl/card:col-start-2 @2xl/card:row-span-2 @2xl/card:row-start-1 @2xl/card:justify-self-end">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={isCustomRange ? undefined : timeRange}
              onValueChange={(v) => handleTimeRangeChange(v as TimeRange)}
              disabled={loading}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder={isCustomRange ? 'Personalizado' : undefined} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Últimos 7 días</SelectItem>
                <SelectItem value="30d">Últimos 30 días</SelectItem>
                <SelectItem value="90d">Últimos 3 meses</SelectItem>
                <SelectItem value="1y">Último año</SelectItem>
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[260px] max-w-full" disabled={loading}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange.from && dateRange.to
                    ? `${moment(dateRange.from).format('DD/MM/YYYY')} - ${moment(dateRange.to).format('DD/MM/YYYY')}`
                    : 'Seleccionar rango'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto max-w-[calc(100vw-2rem)] overflow-auto p-0" align="end">
                <Calendar
                  className="w-full"
                  mode="range"
                  defaultMonth={dateRange.from}
                  selected={dateRange}
                  onSelect={handleCalendarSelect}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
          </div>
        </CardAction>
      </CardHeader>

      {/* Contenido del grafico — skeleton individual por chart */}
      <CardContent className="px-4">
        {loading ? (
          <ChartAreaSkeleton />
        ) : chartData.length === 0 ? (
          <div className="flex items-center justify-center h-[250px] text-muted-foreground">
            <p>No hay datos disponibles para el rango seleccionado</p>
          </div>
        ) : (
          <KpiLineChart
            chartData={chartData}
            expectedPercentage={expectedPercentage}
            invertColors={invertColors}
            showLabels={showLabels}
          />
        )}
      </CardContent>

      {/* Footer con promedio */}
      {!loading && chartData.length > 0 && (
        <CardFooter className="border-t">
          <div className="flex flex-col gap-1 text-sm">
            <div>
              Promedio del período: <span className="font-semibold">{averageIndicator}%</span>
            </div>
            {expectedPercentage > 0 && (
              <div className="text-muted-foreground">
                Umbral objetivo: <span className="font-semibold">{expectedPercentage}%</span>
              </div>
            )}
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
