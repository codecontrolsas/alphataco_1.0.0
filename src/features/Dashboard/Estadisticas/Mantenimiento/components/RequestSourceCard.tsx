'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartSummary } from '@/features/Dashboard/shared/charts/ChartSummary';
import { useQuery } from '@tanstack/react-query';
import { Inbox, Loader2 } from 'lucide-react';
import * as React from 'react';
import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from 'recharts';
import { getMaintenanceRequestSourceStats } from '../actions/actions.server';
import { REQUEST_SOURCE_LABELS, REQUEST_SOURCE_ORDER, requestSourceColorVar } from '../chart-constants';
import {
  PERIOD_NOUN,
  formatPeriodLabel,
  formatPeriodLabelShort,
  todayAnchor,
  type PeriodGranularity,
} from '../utils/periods';
import { PeriodSelector } from './PeriodSelector';

const chartConfig = { count: { label: 'Solicitudes' } } satisfies ChartConfig;

/** Posición de un origen en el orden fijo de presentación (los nuevos van al final). */
function sourceRank(source: string): number {
  const index = REQUEST_SOURCE_ORDER.indexOf(source);
  return index === -1 ? REQUEST_SOURCE_ORDER.length : index;
}

/**
 * Ticket 680 — Origen de las solicitudes de mantenimiento.
 *
 * Barras horizontales (magnitud + participación) para el período elegido, con
 * corte día / mes / trimestre / año. Se usa barra y no torta a propósito: la
 * tarjeta vecina (682) ya es una torta, y acá interesa comparar cantidades
 * además del reparto.
 *
 * Cada barra lleva su cantidad y su porcentaje escritos al lado: la identidad
 * de la serie nunca depende solo del color.
 */
export function RequestSourceCard() {
  const [granularity, setGranularity] = React.useState<PeriodGranularity>('month');
  const [anchor, setAnchor] = React.useState<string>(() => todayAnchor());

  const handlePeriodChange = React.useCallback((nextGranularity: PeriodGranularity, nextAnchor: string) => {
    setGranularity(nextGranularity);
    setAnchor(nextAnchor);
  }, []);

  const periodLabel = React.useMemo(() => formatPeriodLabel(granularity, anchor), [granularity, anchor]);
  const periodLabelShort = React.useMemo(() => formatPeriodLabelShort(granularity, anchor), [granularity, anchor]);

  const { data, isFetching, isError } = useQuery({
    queryKey: ['mantenimiento-request-source', granularity, anchor],
    queryFn: () => getMaintenanceRequestSourceStats(granularity, anchor),
    staleTime: 5 * 60 * 1000,
  });

  const total = data?.total ?? 0;

  const rows = React.useMemo(() => {
    if (!data) return [];
    return data.slices
      .slice()
      .sort((a, b) => sourceRank(a.source) - sourceRank(b.source))
      .map((slice) => ({
        source: slice.source,
        label: REQUEST_SOURCE_LABELS[slice.source] ?? slice.source,
        count: slice.count,
        pct: data.total > 0 ? Math.round((slice.count / data.total) * 100) : 0,
      }));
  }, [data]);

  const isLoading = !isError && data === undefined;
  const isEmpty = !isLoading && !isError && total === 0;

  return (
    <Card className="py-0">
      <CardHeader className="px-6 pt-4 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Inbox className="h-4 w-4 text-muted-foreground" />
          Origen de las solicitudes de mantenimiento
          {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </CardTitle>
        <CardDescription className="mt-0.5">
          {isLoading ? (
            <span>Cargando solicitudes · {periodLabel}</span>
          ) : (
            <>
              <span className="tabular-nums">{total}</span> {total === 1 ? 'solicitud creada' : 'solicitudes creadas'} ·{' '}
              {periodLabel}
            </>
          )}
        </CardDescription>
        <div className="mt-3">
          <PeriodSelector
            granularity={granularity}
            anchor={anchor}
            onChange={handlePeriodChange}
            label={periodLabelShort}
            navSubject="de solicitudes"
          />
        </div>
      </CardHeader>

      <CardContent className="px-6 pb-5">
        {isError ? (
          <div role="alert" className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            No se pudo cargar el origen de las solicitudes.
          </div>
        ) : isLoading ? (
          <div className="space-y-3 py-2">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center gap-3">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-6 flex-1" />
              </div>
            ))}
          </div>
        ) : isEmpty ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <Inbox className="h-5 w-5 opacity-40" />
            No se cargó ninguna solicitud de mantenimiento en este {PERIOD_NOUN[granularity]}.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <ChartContainer config={chartConfig} className="aspect-auto h-[180px] w-full">
              <BarChart
                accessibilityLayer
                data={rows}
                layout="vertical"
                margin={{ top: 4, right: 56, bottom: 4, left: 4 }}
                barCategoryGap="22%"
              >
                <XAxis type="number" dataKey="count" hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={92}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={6}
                  className="text-xs"
                />
                <ChartTooltip cursor={false} content={<ChartTooltipContent nameKey="label" hideLabel />} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={26}>
                  {rows.map((row) => (
                    <Cell key={row.source} fill={requestSourceColorVar(row.source)} />
                  ))}
                  <LabelList
                    dataKey="count"
                    position="right"
                    offset={8}
                    className="fill-foreground text-xs font-semibold tabular-nums"
                  />
                </Bar>
              </BarChart>
            </ChartContainer>

            {/* Leyenda con el reparto exacto — sirve de tabla de datos y de
                relieve para el aqua, que queda bajo 3:1 en tema claro. */}
            <ul className="flex flex-wrap gap-x-5 gap-y-1.5 border-t pt-3">
              {rows.map((row) => (
                <li key={row.source} className="flex items-center gap-2 text-sm">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: requestSourceColorVar(row.source) }}
                    aria-hidden
                  />
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="font-semibold tabular-nums">{row.count}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">({row.pct}%)</span>
                </li>
              ))}
            </ul>

            <ChartSummary
              title="Origen de las solicitudes de mantenimiento"
              summary={`${periodLabel}: ${total} ${total === 1 ? 'solicitud creada' : 'solicitudes creadas'}; ${rows
                .map((row) => `${row.label} ${row.count} (${row.pct}%)`)
                .join(', ')}.`}
              columns={[
                { key: 'label', header: 'Origen' },
                { key: 'count', header: 'Solicitudes', numeric: true },
                { key: 'pct', header: 'Participación', numeric: true },
              ]}
              rows={rows.map((row) => ({ label: row.label, count: row.count, pct: `${row.pct}%` }))}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
