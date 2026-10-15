'use client';

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  MultiSelect,
  MultiSelectContent,
  MultiSelectGroup,
  MultiSelectItem,
  MultiSelectTrigger,
  MultiSelectValue,
} from '@/components/ui/multi-select';
import { ChartSummary } from '@/features/Dashboard/shared/charts/ChartSummary';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts';
import { EmployeesByGenderAndPositionData } from '../../actions.server';

interface EmployeeGenderPositionChartProps {
  data: EmployeesByGenderAndPositionData;
}

const chartConfig = {
  masculino: {
    label: 'Masculino',
    color: 'var(--dash-cat-6, #5c53da)',
  },
  femenino: {
    label: 'Femenino',
    color: 'var(--dash-cat-1, #ec4b7f)',
  },
} satisfies ChartConfig;

export function EmployeeGenderPositionChartComponent({ data }: EmployeeGenderPositionChartProps) {
  const sortedData = useMemo(() => {
    const positionData = new Map<string, { male: number; female: number }>();

    data?.forEach((group) => {
      const position = group.positionName || 'Sin puesto';
      const gender = group.gender;

      if (!positionData.has(position)) {
        positionData.set(position, { male: 0, female: 0 });
      }

      const counts = positionData.get(position)!;
      if (gender === 'Masculino') {
        counts.male += group.count;
      } else if (gender === 'Femenino') {
        counts.female += group.count;
      }
    });

    return Array.from(positionData.entries())
      .map(([position, counts]) => ({
        month: position.length > 24 ? position.substring(0, 24) + '...' : position,
        originalPosition: position,
        masculino: counts.male,
        femenino: counts.female,
      }))
      .sort((a, b) => b.masculino + b.femenino - (a.masculino + a.femenino));
  }, [data]);

  const [selectedPositions, setSelectedPositions] = useState<string[]>(() => {
    return sortedData.slice(0, 5).map((item) => item.originalPosition);
  });

  const chartData = useMemo(() => {
    if (selectedPositions.length === 0) {
      return sortedData.slice(0, 5);
    }
    return sortedData.filter((item) => selectedPositions.includes(item.originalPosition));
  }, [selectedPositions, sortedData]);

  if (sortedData.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No hay empleados activos para mostrar.</p>;
  }

  return (
    <div className="w-full space-y-3">
      <MultiSelect values={selectedPositions} onValuesChange={setSelectedPositions}>
        <MultiSelectTrigger className="w-full max-w-[400px]" aria-label="Seleccionar posiciones">
          <MultiSelectValue placeholder="Seleccionar posiciones..." />
        </MultiSelectTrigger>
        <MultiSelectContent>
          <MultiSelectGroup>
            {sortedData.map((item) => (
              <MultiSelectItem key={item.originalPosition} value={item.originalPosition}>
                {item.originalPosition}
              </MultiSelectItem>
            ))}
          </MultiSelectGroup>
        </MultiSelectContent>
      </MultiSelect>
      <div aria-hidden="true">
        <ChartContainer
          config={chartConfig}
          className="w-full"
          style={{ height: chartData.length > 6 ? chartData.length * 40 : chartData.length * 65 }}
        >
          <BarChart
            accessibilityLayer
            data={chartData}
            layout="vertical"
            className="h-full"
            margin={{
              right: 16,
            }}
          >
            <CartesianGrid horizontal={false} />

            <XAxis type="number" hide />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent />}
              labelFormatter={(value) => chartData.find((item) => item.month === value)?.month || value}
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="masculino" stackId="a" fill="var(--color-masculino)" radius={[0, 0, 0, 0]} />
            <Bar dataKey="femenino" stackId="a" fill="var(--color-femenino)" radius={[0, 2, 2, 0]}>
              <LabelList dataKey="month" position="right" offset={8} fontSize={12} width={100} />
            </Bar>

            <YAxis
              dataKey="month"
              type="category"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              width={60}
              tickFormatter={(value) => (value.length > 4 ? value.substring(0, 4) + '...' : value)}
              hide
            />
          </BarChart>
        </ChartContainer>
      </div>
      <ChartSummary
        title="Distribución de empleados por género y posición"
        summary={
          chartData.length === 0
            ? 'No hay empleados activos para mostrar.'
            : `Empleados activos por posición (masculino / femenino): ${chartData
                .map((item) => `${item.originalPosition} (${item.masculino} / ${item.femenino})`)
                .join(', ')}.`
        }
        columns={[
          { key: 'position', header: 'Posición' },
          { key: 'masculino', header: 'Masculino', numeric: true },
          { key: 'femenino', header: 'Femenino', numeric: true },
        ]}
        rows={chartData.map((item) => ({
          position: item.originalPosition,
          masculino: item.masculino,
          femenino: item.femenino,
        }))}
      />
    </div>
  );
}
