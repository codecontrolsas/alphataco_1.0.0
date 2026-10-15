'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { categoricalColorVar } from '@/features/Dashboard/shared/charts/ChartColorVars';
import { ChartSummary } from '@/features/Dashboard/shared/charts/ChartSummary';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { Bar, BarChart, XAxis, YAxis } from 'recharts';

const MAX_CLIENTS_VISIBLE = 7;

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

interface ClientRankingData {
  name: string;
  mensual: number;
  adicional: number;
}

interface ClientRankingChartProps {
  data: ClientRankingData[];
  periodLabel: string;
}

export function ClientRankingChart({ data, periodLabel }: ClientRankingChartProps) {
  const [showAll, setShowAll] = useState(false);

  const remainingCount = Math.max(0, data.length - MAX_CLIENTS_VISIBLE);
  const displayData = showAll ? data : data.slice(0, MAX_CLIENTS_VISIBLE);

  if (displayData.length === 0) {
    return null;
  }

  const chartData = displayData.map((item) => ({
    ...item,
    shortName: item.name.length > 20 ? item.name.slice(0, 18) + '...' : item.name,
  }));

  const chartHeight = Math.max(180, displayData.length * 40 + 40);

  return (
    <Card className="py-0">
      <CardHeader className="pb-2 pt-4 px-6">
        <CardTitle className="text-base">Servicios por cliente</CardTitle>
        <CardDescription>{periodLabel}</CardDescription>
      </CardHeader>
      <CardContent className="px-2 pb-4 sm:px-6">
        <ChartContainer config={chartConfig} className="w-full" style={{ height: chartHeight }}>
          <BarChart accessibilityLayer data={chartData} layout="vertical" margin={{ left: 0, right: 12 }}>
            <XAxis type="number" hide />
            <YAxis
              dataKey="shortName"
              type="category"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={130}
              tick={{ fontSize: 12 }}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
            <Bar dataKey="mensual" stackId="a" fill="var(--color-mensual)" radius={[0, 0, 0, 0]} />
            <Bar dataKey="adicional" stackId="a" fill="var(--color-adicional)" radius={[0, 4, 4, 0]} />
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
          title="Servicios por cliente"
          summary={`${periodLabel}: ${data.length} ${data.length === 1 ? 'cliente' : 'clientes'} con servicios${
            data[0]
              ? `; el mayor es ${data[0].name} con ${(data[0].mensual + data[0].adicional).toLocaleString('es-AR')}`
              : ''
          }.`}
          columns={[
            { key: 'name', header: 'Cliente' },
            { key: 'mensual', header: 'Mensual', numeric: true },
            { key: 'adicional', header: 'Adicional', numeric: true },
          ]}
          rows={data.map((item) => ({
            name: item.name,
            mensual: item.mensual.toLocaleString('es-AR'),
            adicional: item.adicional.toLocaleString('es-AR'),
          }))}
        />
      </CardContent>
    </Card>
  );
}
