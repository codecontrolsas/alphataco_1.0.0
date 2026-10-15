'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartSummary } from '@/features/Dashboard/shared/charts/ChartSummary';
import { type_of_maintenance_ENUM } from '@/generated/prisma/enums';
import { useQuery } from '@tanstack/react-query';
import { Gauge, Loader2 } from 'lucide-react';
import * as React from 'react';
import { Cell, Pie, PieChart } from 'recharts';
import { getMaintenanceKindStats } from '../actions/actions.server';
import { MAINTENANCE_KIND_ORDER, maintenanceKindColorVar } from '../chart-constants';
import {
  PERIOD_NOUN,
  formatPeriodLabel,
  formatPeriodLabelShort,
  todayAnchor,
  type PeriodGranularity,
} from '../utils/periods';
import { PeriodSelector } from './PeriodSelector';

const chartConfig = { count: { label: 'Tareas' } } satisfies ChartConfig;

/**
 * Ticket 682 — Indicador preventivo vs. correctivo.
 *
 * Responde la pregunta textual del cliente: "¿cuál es mi porcentaje de
 * mantenimiento preventivo y correctivo en la empresa?". La unidad es la tarea
 * EJECUTADA por el taller (la reparación completada dentro de una OT), que es
 * lo único en el sistema que lleva la clasificación preventivo/correctivo.
 *
 * "Otro" es el tercer valor del enum `type_of_maintenance_ENUM`. Solo se dibuja
 * si el período tiene tareas de ese tipo: esconderlo siempre falsearía el
 * denominador, y mostrarlo vacío agregaría ruido.
 *
 * Las tareas de diagnóstico quedan fuera del cálculo — se generan en toda orden
 * y no son trabajo preventivo ni correctivo — y se informan al pie para que el
 * número no aparezca recortado sin explicación.
 */
export function MaintenanceKindCard() {
  const [granularity, setGranularity] = React.useState<PeriodGranularity>('month');
  const [anchor, setAnchor] = React.useState<string>(() => todayAnchor());

  const handlePeriodChange = React.useCallback((nextGranularity: PeriodGranularity, nextAnchor: string) => {
    setGranularity(nextGranularity);
    setAnchor(nextAnchor);
  }, []);

  const periodLabel = React.useMemo(() => formatPeriodLabel(granularity, anchor), [granularity, anchor]);
  const periodLabelShort = React.useMemo(() => formatPeriodLabelShort(granularity, anchor), [granularity, anchor]);

  const { data, isFetching, isError } = useQuery({
    queryKey: ['mantenimiento-kind-split', granularity, anchor],
    queryFn: () => getMaintenanceKindStats(granularity, anchor),
    staleTime: 5 * 60 * 1000,
  });

  const total = data?.total ?? 0;

  const slices = React.useMemo(() => {
    if (!data) return [];
    return MAINTENANCE_KIND_ORDER.map((kind) => ({
      kind,
      label: kind,
      count: data.counts[kind],
      pct: data.total > 0 ? Math.round((data.counts[kind] / data.total) * 100) : 0,
    })).filter((slice) => slice.count > 0);
  }, [data]);

  const preventivePct = React.useMemo(() => {
    if (!data || data.total === 0) return 0;
    return Math.round((data.counts[type_of_maintenance_ENUM.Preventivo] / data.total) * 100);
  }, [data]);

  const isLoading = !isError && data === undefined;
  const isEmpty = !isLoading && !isError && total === 0;
  const diagnostics = data?.diagnostics ?? 0;
  const unclassified = data?.unclassified ?? 0;

  return (
    <Card className="@container py-0">
      <CardHeader className="px-6 pt-4 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4 text-muted-foreground" />
          Mantenimiento preventivo vs. correctivo
          {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </CardTitle>
        <CardDescription className="mt-0.5">
          {isLoading ? (
            <span>Cargando tareas ejecutadas · {periodLabel}</span>
          ) : (
            <>
              <span className="tabular-nums">{total}</span> {total === 1 ? 'tarea ejecutada' : 'tareas ejecutadas'} por
              el taller · {periodLabel}
            </>
          )}
        </CardDescription>
        <div className="mt-3">
          <PeriodSelector
            granularity={granularity}
            anchor={anchor}
            onChange={handlePeriodChange}
            label={periodLabelShort}
            navSubject="de tareas"
          />
        </div>
      </CardHeader>

      <CardContent className="px-6 pb-5">
        {isError ? (
          <div role="alert" className="flex h-44 items-center justify-center text-sm text-muted-foreground">
            No se pudo cargar el indicador de preventivo/correctivo.
          </div>
        ) : isLoading ? (
          <div className="flex flex-col items-center gap-5 py-2 @2xl:flex-row @2xl:justify-around">
            <Skeleton className="h-[190px] w-[190px] shrink-0 rounded-full" />
            <div className="w-full space-y-2 @2xl:max-w-xs">
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} className="h-8 w-full" />
              ))}
            </div>
          </div>
        ) : isEmpty ? (
          <div className="flex h-44 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
            <Gauge className="h-5 w-5 opacity-40" />
            {diagnostics > 0 ? (
              <span>
                En este {PERIOD_NOUN[granularity]} el taller solo completó tareas de diagnóstico ({diagnostics}), que no
                se clasifican como preventivo ni correctivo.
              </span>
            ) : (
              <span>El taller no completó ninguna tarea en este {PERIOD_NOUN[granularity]}.</span>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-5 @2xl:flex-row @2xl:items-center @2xl:justify-around">
              <ChartContainer config={chartConfig} className="aspect-square h-[190px] w-[190px] shrink-0">
                <PieChart>
                  <ChartTooltip cursor={false} content={<ChartTooltipContent nameKey="label" hideLabel />} />
                  <Pie
                    data={slices}
                    dataKey="count"
                    nameKey="label"
                    innerRadius={58}
                    outerRadius={86}
                    strokeWidth={2}
                    paddingAngle={slices.length > 1 ? 2 : 0}
                  >
                    {slices.map((slice) => (
                      <Cell key={slice.kind} fill={maintenanceKindColorVar(slice.kind)} />
                    ))}
                  </Pie>
                  <text
                    x="50%"
                    y="46%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-foreground text-3xl font-bold"
                  >
                    {preventivePct}%
                  </text>
                  <text
                    x="50%"
                    y="58%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-muted-foreground text-xs"
                  >
                    preventivo
                  </text>
                </PieChart>
              </ChartContainer>

              {/* Reparto exacto: hace de leyenda y de tabla de datos. */}
              <ul className="w-full space-y-1.5 @2xl:max-w-xs">
                {slices.map((slice) => (
                  <li
                    key={slice.kind}
                    className="flex items-center gap-2 rounded-md border border-transparent px-2 py-1.5"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: maintenanceKindColorVar(slice.kind) }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{slice.label}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{slice.pct}%</span>
                    <span className="w-10 text-right text-sm font-semibold tabular-nums">{slice.count}</span>
                  </li>
                ))}
              </ul>
            </div>

            <ChartSummary
              title="Mantenimiento preventivo vs. correctivo"
              summary={`${periodLabel}: ${total} ${total === 1 ? 'tarea ejecutada' : 'tareas ejecutadas'}, ${preventivePct}% preventivas; ${slices
                .map((slice) => `${slice.label} ${slice.count} (${slice.pct}%)`)
                .join(', ')}.`}
              columns={[
                { key: 'label', header: 'Tipo' },
                { key: 'count', header: 'Tareas', numeric: true },
                { key: 'pct', header: 'Participación', numeric: true },
              ]}
              rows={slices.map((slice) => ({ label: slice.label, count: slice.count, pct: `${slice.pct}%` }))}
            />

            {(diagnostics > 0 || unclassified > 0) && (
              <div className="space-y-0.5 border-t pt-3 text-xs text-muted-foreground">
                {diagnostics > 0 && (
                  <p>
                    No se cuentan {diagnostics} {diagnostics === 1 ? 'tarea' : 'tareas'} de diagnóstico: se generan en
                    toda orden y no son trabajo preventivo ni correctivo.
                  </p>
                )}
                {unclassified > 0 && (
                  <p>
                    {unclassified} {unclassified === 1 ? 'tarea quedó fuera' : 'tareas quedaron fuera'} del cálculo
                    porque su tipo de reparación no tiene definido el tipo de mantenimiento.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
