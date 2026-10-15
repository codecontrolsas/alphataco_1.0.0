'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { statusColorVar } from '@/features/Dashboard/shared/charts/ChartColorVars';
import { ChartSummary } from '@/features/Dashboard/shared/charts/ChartSummary';
import dynamic from 'next/dynamic';
import * as React from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts';
import { cancelledNote } from '../lib/cancelled-note';
import { VEHICLE_TYPES_PARAM } from '../lib/url-list';
import { IndicatorStats } from '../shared/IndicatorStats';
import { RadialGauge } from '../shared/RadialGauge';
import { UrlListFilter } from '../shared/UrlListFilter';

// bundle-dynamic-imports — dialog loads only when opened
const AvailableVehiclesDialog = dynamic(() => import('./AvailableVehiclesDialog'), {
  ssr: false,
});

const chartConfig = {
  disponibles: {
    label: 'Disponible / Sin asignar',
    color: statusColorVar('available'),
  },
  fueraDeServicio: {
    label: 'Fuera de servicio',
    color: statusColorVar('unavailable'),
  },
  trabajando: {
    label: 'En operaciones',
    color: statusColorVar('inUse'),
  },
} satisfies ChartConfig;

interface EquipmentChartItem {
  name: string;
  shortName: string;
  disponibles: number;
  fueraDeServicio: number;
  trabajando: number;
  /** Operativos que hoy están solo en servicios cancelados (no cuentan en operaciones). */
  cancelados: number;
}

interface Props {
  date: string;
  chartData: EquipmentChartItem[];
  /** Cantidad de tipos con equipos; el gráfico muestra los 8 con más flota. */
  totalTypes: number;
  totalActive: number;
  totalInUse: number;
  totalCancelled: number;
  totalAvailable: number;
  totalFleet: number;
  operativityPercentage: number | null;
  typeIds?: string[];
  vehicleTypes: { label: string; value: string }[];
  initialFilterValues: string[];
}

export function EquipmentOperationClient({
  date,
  chartData,
  totalTypes,
  totalActive,
  totalInUse,
  totalCancelled,
  totalAvailable,
  totalFleet,
  operativityPercentage,
  typeIds,
  vehicleTypes,
  initialFilterValues,
}: Props) {
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const stats = React.useMemo(
    () => [
      {
        label: 'Operativos',
        value: totalActive,
        description: 'Equipos activos que no están fuera de servicio (no operativo, en reparación o en preparación).',
      },
      {
        label: 'En operaciones',
        value: totalInUse,
        note: cancelledNote(totalCancelled),
        description:
          'Equipos operativos cargados en el parte diario de hoy. Los servicios cancelados no cuentan: se indican aparte.',
      },
      {
        label: 'Disponible / Sin asignar',
        value: totalAvailable,
        onClick: () => setDialogOpen(true),
        description:
          'Operativos − en operaciones. El listado muestra los equipos con condición operativa u operativa condicionada que no están en el parte de hoy.',
      },
    ],
    [totalActive, totalInUse, totalCancelled, totalAvailable]
  );

  const dynamicHeight = React.useMemo(() => {
    const len = chartData.length;
    if (len === 0) return 200;
    // Each bar needs ~44px height; add 40px bottom padding for the legend
    return Math.max(len * 44 + 40, 200);
  }, [chartData]);

  const summary =
    chartData.length === 0
      ? 'Sin equipos para mostrar.'
      : `Equipos por tipo: ${chartData.map((d) => `${d.name} ${d.trabajando} en operaciones, ${d.disponibles} disponibles, ${d.fueraDeServicio} fuera de servicio`).join('; ')}.${totalTypes > chartData.length ? ` Se muestran los ${chartData.length} tipos con más flota de ${totalTypes}.` : ''}`;

  return (
    <>
      <Card>
        <CardHeader className="border-b px-6 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-base">Estado de Equipos</CardTitle>
              <CardDescription>{date} · Disponible, fuera de servicio y en operaciones por tipo</CardDescription>
            </div>
            <UrlListFilter
              key={initialFilterValues.join(',')}
              paramName={VEHICLE_TYPES_PARAM}
              options={vehicleTypes}
              placeholder="Filtrar por tipo..."
              initialValues={initialFilterValues}
            />
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {/* Chart */}
          {chartData.length > 0 ? (
            <div className="space-y-2">
              <div role="img" aria-label={summary}>
                <ChartContainer config={chartConfig} className="w-full" style={{ height: dynamicHeight }}>
                  <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 140, bottom: 0, left: 8 }}>
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="shortName"
                      tickLine={false}
                      axisLine={false}
                      width={70}
                      tick={{ fontSize: 11 }}
                      hide
                    />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent className="w-[200px]" />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="disponibles" stackId="stack" fill="var(--color-disponibles)" radius={[0, 0, 0, 0]} />
                    <Bar
                      dataKey="fueraDeServicio"
                      stackId="stack"
                      fill="var(--color-fueraDeServicio)"
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar dataKey="trabajando" stackId="stack" fill="var(--color-trabajando)" radius={[0, 2, 2, 0]}>
                      <LabelList dataKey="shortName" position="right" offset={8} fontSize={11} />
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </div>
              <ChartSummary
                title="Estado de equipos por tipo"
                summary={summary}
                columns={[
                  { key: 'type', header: 'Tipo' },
                  { key: 'working', header: 'En operaciones', numeric: true },
                  { key: 'cancelled', header: 'En servicios cancelados', numeric: true },
                  { key: 'available', header: 'Disponible / Sin asignar', numeric: true },
                  { key: 'out', header: 'Fuera de servicio', numeric: true },
                ]}
                rows={chartData.map((d) => ({
                  type: d.name,
                  working: d.trabajando,
                  cancelled: d.cancelados,
                  available: d.disponibles,
                  out: d.fueraDeServicio,
                }))}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
              Sin datos de equipos para hoy
            </div>
          )}

          {/* Stats */}
          <IndicatorStats items={stats} className="mt-6 border-t pt-4" />
          <RadialGauge
            value={operativityPercentage}
            label="Operatividad"
            accentColor={statusColorVar('operational')}
            className="mt-4"
          />
          <p className="text-[11px] text-muted-foreground mt-4 pt-3 border-t text-center">
            <span className="font-semibold">Operatividad</span> = Equipos operativos / Flota total (
            {totalFleet.toLocaleString('es-AR')} equipos activos) × 100
          </p>
        </CardContent>
      </Card>

      {dialogOpen && (
        <AvailableVehiclesDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          count={totalAvailable}
          typeIds={typeIds}
        />
      )}
    </>
  );
}
