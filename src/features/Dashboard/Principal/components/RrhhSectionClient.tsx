'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { statusColorVar } from '@/features/Dashboard/shared/charts/ChartColorVars';
import { ChartSummary } from '@/features/Dashboard/shared/charts/ChartSummary';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import * as React from 'react';
import { Cell, Label, Pie, PieChart } from 'recharts';
import type { DiagramIndicatorResult } from '../actions/types';
import { CookieFilter } from '../shared/CookieFilter';
import { IndicatorStats } from '../shared/IndicatorStats';
import { RadialGauge } from '../shared/RadialGauge';

// bundle-dynamic-imports — dialog loads only when opened
const AvailableEmployeesDialog = dynamic(() => import('./AvailableEmployeesDialog'), {
  ssr: false,
});

interface Props {
  date: string;
  diagramData: DiagramIndicatorResult[];
  operativos: number;
  enOperacion: number;
  disponibles: number;
  /** Uso del personal con diagrama; `null` si no hay empleados con diagrama de trabajo. */
  indicatorPercent: number | null;
  positionIds?: string[];
  positions: { label: string; value: string }[];
  initialFilterValues: string[];
}

export function RrhhSectionClient({
  date,
  diagramData,
  operativos,
  enOperacion,
  disponibles,
  indicatorPercent,
  positionIds,
  positions,
  initialFilterValues,
}: Props) {
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const { chartConfig, chartData } = React.useMemo(() => {
    const config: ChartConfig = { empleados: { label: 'Novedades' } };
    const data = diagramData.map((d) => {
      config[d.diagram_type_name] = {
        label: d.diagram_type_name,
        color: d.diagram_type_color,
      };
      return {
        id: d.diagram_type_id,
        name: d.diagram_type_name,
        value: d.cantidad_empleados,
        fill: d.diagram_type_color,
      };
    });
    return { chartConfig: config, chartData: data };
  }, [diagramData]);

  const stats = React.useMemo(
    () => [
      {
        label: 'Con diagrama',
        value: operativos,
        description: 'Empleados activos con un diagrama de trabajo (que trabaja) cargado para hoy.',
      },
      {
        label: 'En operación',
        value: enOperacion,
        description: 'Empleados activos cargados en el parte diario de hoy, tengan o no diagrama de trabajo.',
      },
      {
        label: 'Disponibles',
        value: disponibles,
        onClick: () => setDialogOpen(true),
        description:
          'Resta simple: con diagrama − en operación. Puede diferir de la lista, que muestra los empleados con diagrama de trabajo que no están en el parte de hoy.',
      },
    ],
    [operativos, enOperacion, disponibles]
  );

  const totalDiagramEmployees = chartData.reduce((sum, d) => sum + d.value, 0);
  const diagramSummary = `Empleados por tipo de novedad del diagrama de hoy: ${chartData.map((d) => `${d.name} ${d.value}`).join(', ')}. Total ${totalDiagramEmployees}.`;

  const buildDiagramLink = React.useCallback(
    (diagramTypeId: string) => {
      const params = new URLSearchParams();
      params.set('tab', 'diagrams');
      params.set('subtab', 'old');
      params.set('diagOld_diagramType', diagramTypeId);
      if (positionIds?.length) {
        params.set('diagOld_position', positionIds.join(','));
      }
      return `/dashboard/employee?${params.toString()}`;
    },
    [positionIds]
  );

  return (
    <>
      <Card>
        <CardHeader className="border-b px-6 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-base">Recursos Humanos</CardTitle>
              <CardDescription>{date}</CardDescription>
            </div>
            <CookieFilter
              cookieName="position-filter"
              options={positions}
              placeholder="Filtrar por posición..."
              initialValues={initialFilterValues}
            />
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Donut with center text */}
            <div>
              <h4 className="text-sm font-medium mb-3">Novedades cargadas</h4>
              {chartData.length > 0 ? (
                <>
                  <div role="img" aria-label={diagramSummary}>
                    <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[220px]">
                      <PieChart>
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Pie
                          data={chartData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={50}
                          outerRadius={80}
                          strokeWidth={2}
                        >
                          {chartData.map((entry) => (
                            <Cell key={entry.name} fill={entry.fill} />
                          ))}
                          <Label
                            content={({ viewBox }) => {
                              if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                                return (
                                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                                    <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-2xl font-bold">
                                      {totalDiagramEmployees}
                                    </tspan>
                                    <tspan
                                      x={viewBox.cx}
                                      y={(viewBox.cy ?? 0) + 20}
                                      className="fill-muted-foreground text-xs"
                                    >
                                      Empleados
                                    </tspan>
                                  </text>
                                );
                              }
                            }}
                          />
                        </Pie>
                      </PieChart>
                    </ChartContainer>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 justify-center max-h-[80px] overflow-y-auto">
                    {[...chartData]
                      .sort((a, b) => b.value - a.value)
                      .map((d) => (
                        <Link
                          key={d.name}
                          href={buildDiagramLink(d.id)}
                          target="_blank"
                          className="flex items-center gap-1.5 text-xs hover:underline hover:opacity-80 transition-opacity"
                        >
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: d.fill }}
                            aria-hidden="true"
                          />
                          <span className="truncate max-w-[140px]">{d.name}</span>: {d.value}
                        </Link>
                      ))}
                  </div>
                  <ChartSummary
                    className="mt-3"
                    title="Novedades cargadas"
                    summary={diagramSummary}
                    columns={[
                      { key: 'name', header: 'Novedad' },
                      { key: 'value', header: 'Empleados', numeric: true },
                    ]}
                    rows={chartData.map((d) => ({ name: d.name, value: d.value }))}
                  />
                </>
              ) : (
                <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">
                  No hay empleados activos para los filtros elegidos
                </div>
              )}
            </div>

            {/* Right: Stats + Gauge */}
            <div className="flex flex-col gap-4">
              <IndicatorStats items={stats} />
              <RadialGauge value={indicatorPercent} label="Uso del personal" accentColor={statusColorVar('inUse')} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-4 pt-3 border-t text-center">
            <span className="font-semibold">Uso del personal</span> = Empleados en operación / Empleados con diagrama ×
            100
          </p>
        </CardContent>
      </Card>

      {dialogOpen && (
        <AvailableEmployeesDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          count={disponibles}
          positionIds={positionIds}
        />
      )}
    </>
  );
}
