'use client';

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { ORDER_CHART_CONFIG, ORDER_SERIES, type OrderActiveView } from '../utils/order-series';

export type OrderChartDataPoint = {
  label: string;
  confirmado: number;
  pendiente: number;
  rechazado: number;
  cancelado: number;
  otros: number;
};

interface Props {
  chartData: OrderChartDataPoint[];
  activeView: OrderActiveView;
}

export function OrderManagementChart({ chartData, activeView }: Props) {
  return (
    <ChartContainer config={ORDER_CHART_CONFIG} className="aspect-auto h-[280px] w-full">
      <LineChart data={chartData} margin={{ left: 12, right: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          tickFormatter={(value) => String(value)}
        />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {ORDER_SERIES.map((key) => {
          const visible = activeView === 'total' || activeView === key;
          if (!visible) return null;
          return (
            <Line
              key={key}
              dataKey={key}
              type="monotone"
              stroke={`var(--color-${key})`}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          );
        })}
        <ChartLegend content={<ChartLegendContent />} />
      </LineChart>
    </ChartContainer>
  );
}
