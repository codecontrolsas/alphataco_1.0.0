'use client';

import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { categoricalColorVar } from '@/features/Dashboard/shared/charts/ChartColorVars';
import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis } from 'recharts';
import { CostCenterChartTooltip } from './CostCenterChartTooltip';
import type { ChartDataPoint } from './CustomChartTooltip';
import { CustomChartTooltip } from './CustomChartTooltip';

const chartConfig = {
  mensual: {
    label: 'Mensual',
    color: categoricalColorVar(5),
  },
  adicional: {
    label: 'Adicional',
    color: categoricalColorVar(1),
  },
} satisfies ChartConfig;

export interface CostCenterSerie {
  key: string;
  dataKey: string;
  name: string;
  color: string;
}

interface ServiceHistoryAreaChartProps {
  chartData: ChartDataPoint[];
  activeView: 'total' | 'mensual' | 'adicional';
  /** Una serie por centro de costo seleccionado. Vacio = vista original apilada. */
  costCenterSeries?: CostCenterSerie[];
}

export function ServiceHistoryAreaChart({
  chartData,
  activeView,
  costCenterSeries = [],
}: ServiceHistoryAreaChartProps) {
  const showMensual = activeView === 'total' || activeView === 'mensual';
  const showAdicional = activeView === 'total' || activeView === 'adicional';

  // ─── Vista por centro de costo: una linea por centro seleccionado ──────────
  // No se apilan: un mismo servicio puede contarse en varias lineas, asi que apilarlas
  // mostraria un total que no existe.
  if (costCenterSeries.length > 0) {
    const costCenterConfig = Object.fromEntries(
      costCenterSeries.map((serie) => [serie.dataKey, { label: serie.name, color: serie.color }])
    ) satisfies ChartConfig;

    return (
      <ChartContainer config={costCenterConfig} className="aspect-auto h-[280px] w-full">
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
          <ChartTooltip cursor={false} content={<CostCenterChartTooltip activeView={activeView} />} />
          {costCenterSeries.map((serie) => (
            <Line
              key={serie.dataKey}
              dataKey={serie.dataKey}
              name={serie.name}
              type="natural"
              stroke={serie.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              // Sin animacion: al cambiar de centros el set de series cambia y la animacion
              // de entrada de recharts queda trabada en su primer frame, dejando las lineas
              // dibujadas fuera del area visible.
              isAnimationActive={false}
            />
          ))}
          <ChartLegend content={<ChartLegendContent />} />
        </LineChart>
      </ChartContainer>
    );
  }

  // ─── Vista original: areas apiladas Mensual / Adicional ────────────────────
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
      <AreaChart data={chartData} margin={{ left: 12, right: 12 }}>
        <defs>
          <linearGradient id="fillMensual" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-mensual)" stopOpacity={0.8} />
            <stop offset="95%" stopColor="var(--color-mensual)" stopOpacity={0.1} />
          </linearGradient>
          <linearGradient id="fillAdicional" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-adicional)" stopOpacity={0.6} />
            <stop offset="95%" stopColor="var(--color-adicional)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          tickFormatter={(value) => String(value)}
        />
        <ChartTooltip cursor={false} content={<CustomChartTooltip activeView={activeView} />} />
        {showMensual && (
          <Area
            dataKey="mensual"
            type="natural"
            fill="url(#fillMensual)"
            stroke="var(--color-mensual)"
            strokeWidth={2}
            stackId="a"
          />
        )}
        {showAdicional && (
          <Area
            dataKey="adicional"
            type="natural"
            fill="url(#fillAdicional)"
            stroke="var(--color-adicional)"
            strokeWidth={2}
            stackId="a"
          />
        )}
        <ChartLegend content={<ChartLegendContent />} />
      </AreaChart>
    </ChartContainer>
  );
}
