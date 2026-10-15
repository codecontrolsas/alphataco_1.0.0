'use client';

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { makeThresholdDot } from '@/features/Dashboard/shared/charts/ThresholdDot';
import { CartesianGrid, LabelList, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts';

interface TrendData {
  date: string;
  percentage: number;
}

interface AbsenteeismTrendChartProps {
  data: TrendData[];
  chartConfig: ChartConfig;
  showLabels?: boolean;
}

// Constante para el porcentaje esperado de ausentismo
export const EXPECTED_ABSENTEEISM_PERCENTAGE = 3;

export function AbsenteeismTrendChartComponent({ chartConfig, data, showLabels }: AbsenteeismTrendChartProps) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
      <LineChart
        accessibilityLayer
        data={data}
        margin={{
          top: 20,
          left: 12,
          right: 12,
        }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(value: string) => {
            if (!value) return '';
            // Si ya viene como D/M o DD/MM(/YYYY), tomar día/mes
            if (value.includes('/')) {
              const parts = value.split('/');
              if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
            }
            // ISO YYYY-MM-DD -> D/M
            const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
            if (iso) {
              const [, , m, d] = iso;
              return `${parseInt(d, 10)}/${parseInt(m, 10)}`;
            }
            // Intento de parseo genérico
            const d = new Date(value);
            if (!isNaN(d.getTime())) {
              return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
            }
            return value;
          }}
        />
        <YAxis hide />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />

        {/* Línea de referencia del porcentaje esperado */}
        <ReferenceLine
          y={EXPECTED_ABSENTEEISM_PERCENTAGE}
          stroke="var(--dash-ok, #52a27a)"
          strokeWidth={2}
          strokeDasharray="5 5"
          label={{
            value: `${EXPECTED_ABSENTEEISM_PERCENTAGE}%`,
            position: 'insideTopRight',
            fill: 'var(--dash-ok, #52a27a)',
            fontSize: 12,
            fontWeight: 600,
          }}
        />

        {/* Línea principal con stroke gris y puntos de colores */}
        <Line
          dataKey="percentage"
          type="monotone"
          stroke="color-mix(in oklch, var(--muted-foreground) 30%, transparent)"
          strokeWidth={2}
          dot={makeThresholdDot('percentage', EXPECTED_ABSENTEEISM_PERCENTAGE)}
          activeDot={{
            r: 7,
          }}
        >
          {showLabels && (
            <LabelList
              position="top"
              offset={12}
              className="fill-foreground"
              fontSize={12}
              formatter={(value: number) => `${value}%`}
            />
          )}
        </Line>
      </LineChart>
    </ChartContainer>
  );
}
