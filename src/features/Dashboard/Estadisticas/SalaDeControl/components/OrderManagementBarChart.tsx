'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { ChartSummary } from '@/features/Dashboard/shared/charts/ChartSummary';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { Bar, BarChart, XAxis, YAxis } from 'recharts';
import { ORDER_CHART_CONFIG, ORDER_SERIES, type OrderActiveView } from '../utils/order-series';
import type { OrderChartDataPoint } from './OrderManagementChart';

const MAX_CLIENTS_VISIBLE = 7;

interface Props {
  chartData: OrderChartDataPoint[];
  activeView: OrderActiveView;
  periodLabel: string;
}

export function OrderManagementBarChart({ chartData, activeView, periodLabel }: Props) {
  const [showAll, setShowAll] = useState(false);

  const remainingCount = Math.max(0, chartData.length - MAX_CLIENTS_VISIBLE);
  const displayData = showAll ? chartData : chartData.slice(0, MAX_CLIENTS_VISIBLE);
  const visibleSeries = ORDER_SERIES.filter((key) => activeView === 'total' || activeView === key);

  const chartHeight = Math.max(200, displayData.length * 45 + 60);

  return (
    <Card className="py-0">
      <CardHeader className="pb-2 pt-4 px-6">
        <CardTitle className="text-base">Pedidos por cliente</CardTitle>
        <CardDescription>{periodLabel}</CardDescription>
      </CardHeader>
      <CardContent className="px-2 pb-4 sm:px-6">
        <ChartContainer config={ORDER_CHART_CONFIG} className="w-full" style={{ height: chartHeight }}>
          <BarChart accessibilityLayer data={displayData} layout="vertical" margin={{ left: 0, right: 12 }}>
            <XAxis type="number" hide />
            <YAxis
              dataKey="label"
              type="category"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={130}
              tick={{ fontSize: 12 }}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            {visibleSeries.map((key, idx) => (
              <Bar
                key={key}
                dataKey={key}
                stackId="a"
                fill={`var(--color-${key})`}
                radius={idx === visibleSeries.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0]}
              />
            ))}
            <ChartLegend content={<ChartLegendContent />} />
          </BarChart>
        </ChartContainer>
        {remainingCount > 0 && (
          <div className="flex justify-center mt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground h-7 gap-1"
              onClick={() => setShowAll((prev) => !prev)}
            >
              {showAll ? (
                <>
                  Mostrar menos <ChevronUp className="h-3.5 w-3.5" />
                </>
              ) : (
                <>
                  +{remainingCount} {remainingCount === 1 ? 'cliente' : 'clientes'}{' '}
                  <ChevronDown className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </div>
        )}
        <ChartSummary
          className="mt-2"
          title="Pedidos por cliente"
          summary={`${periodLabel}: ${chartData.length} ${chartData.length === 1 ? 'cliente' : 'clientes'} con pedidos.`}
          columns={[
            { key: 'label', header: 'Cliente' },
            ...ORDER_SERIES.map((key) => ({ key, header: ORDER_CHART_CONFIG[key].label, numeric: true })),
          ]}
          rows={chartData.map((row) => ({
            label: row.label,
            ...Object.fromEntries(ORDER_SERIES.map((key) => [key, row[key].toLocaleString('es-AR')])),
          }))}
        />
      </CardContent>
    </Card>
  );
}
