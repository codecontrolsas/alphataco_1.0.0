'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ChartSummary } from '@/features/Dashboard/shared/charts/ChartSummary';
import { argentinaDate, formatDateAr } from '@/shared/lib/argentina-time';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/es';
import * as React from 'react';
import type { DeviationTotals, DeviationsChartData } from '../actions/actions.server';
import {
  DEFAULT_VISIBLE_SERIES,
  DEVIATION_SERIES,
  SeriesColorVars,
  seriesColorVar,
  type DeviationSeriesKey,
} from '../constants';
import { getBucketKey, getDataWindow, getPeriodLabel, type DeviationGranularity } from '../utils/buckets';
import type { DeviationChartPoint } from './DesviosChartTooltip';
import { DesviosTimeSeriesChart } from './DesviosTimeSeriesChart';

const GRANULARITY_OPTIONS: { value: DeviationGranularity; label: string }[] = [
  { value: 'daily', label: 'Diario' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensual' },
];

const MONTH_KEY_FORMAT = 'YYYY-MM';

/**
 * Los duplicados arrancan en 0 porque existen para todo el historico; las tres
 * series de desvios arrancan en null y solo toman valor si algun dia del periodo
 * las aporta.
 */
const EMPTY_TOTALS: DeviationTotals = {
  rows_with_deviations: null,
  employee_deviations: null,
  equipment_deviations: null,
  duplicated_employees: 0,
  duplicated_equipment: 0,
};

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Suma los dias que tienen medicion y descarta los que no.
 *
 * Anular el periodo entero por un dia faltante seria excesivo: un mes con 28 de
 * 30 dias sigue siendo informativo. Lo que no se puede hacer es contar el dia
 * ausente como cero, porque bajaria el total sin avisar — por eso el bucket
 * lleva la cuenta de los dias sin dato y la expone en el tooltip.
 */
function accumulate(target: DeviationTotals, source: DeviationTotals): void {
  if (source.employee_deviations !== null) {
    target.rows_with_deviations = (target.rows_with_deviations ?? 0) + (source.rows_with_deviations ?? 0);
    target.employee_deviations = (target.employee_deviations ?? 0) + source.employee_deviations;
    target.equipment_deviations = (target.equipment_deviations ?? 0) + (source.equipment_deviations ?? 0);
  }
  target.duplicated_employees += source.duplicated_employees;
  target.duplicated_equipment += source.duplicated_equipment;
}

interface Props {
  data: DeviationsChartData;
}

export function DesviosChartsClient({ data }: Props) {
  /*
   * El mes se guarda como string 'YYYY-MM' y no como objeto moment: cada clone()
   * produce una identidad nueva, lo que invalidaria el useMemo en cada render.
   * Ordena lexicograficamente igual que cronologicamente, asi que sirve tambien
   * para comparar contra los limites.
   */
  const [selectedMonthKey, setSelectedMonthKey] = React.useState(() =>
    moment(argentinaDate()).format(MONTH_KEY_FORMAT)
  );
  const [granularity, setGranularity] = React.useState<DeviationGranularity>('daily');
  const [selectedCustomerIds, setSelectedCustomerIds] = React.useState<string[]>([]);
  const [visibleSeries, setVisibleSeries] = React.useState<DeviationSeriesKey[]>(DEFAULT_VISIBLE_SERIES);
  const [, startTransition] = React.useTransition();

  const customerOptions = React.useMemo(
    () => data.customers.map((c) => ({ label: c.name, value: c.id })),
    [data.customers]
  );

  const currentMonthKey = moment(argentinaDate()).format(MONTH_KEY_FORMAT);
  const earliestMonthKey = data.days.length > 0 ? data.days[0].date.slice(0, 7) : currentMonthKey;
  const canGoBack = selectedMonthKey > earliestMonthKey;
  const canGoForward = selectedMonthKey < currentMonthKey;

  // Etapa 1 — recortar por ventana temporal. Solo depende del periodo, de modo
  // que tildar un cliente no vuelve a filtrar los 730 dias por fecha.
  const { daysInWindow, periodLabel, monthLabel } = React.useMemo(() => {
    const selectedMonth = moment(selectedMonthKey, MONTH_KEY_FORMAT);
    const { start, end } = getDataWindow(selectedMonth, granularity);

    return {
      daysInWindow: data.days.filter((day) => day.date >= start && day.date <= end),
      periodLabel: capitalize(getPeriodLabel(selectedMonth, granularity)),
      monthLabel: capitalize(selectedMonth.format('MMMM YYYY')),
    };
  }, [data.days, selectedMonthKey, granularity]);

  // Etapa 2 — agregar por bucket aplicando el filtro de cliente.
  const { chartData, periodTotals, missingDaysInWindow } = React.useMemo(() => {
    const customerFilter = selectedCustomerIds.length > 0 ? new Set(selectedCustomerIds) : null;

    const buckets = new Map<string, DeviationChartPoint>();
    const totals: DeviationTotals = { ...EMPTY_TOTALS };
    let missingDays = 0;

    for (const day of daysInWindow) {
      /*
       * Sin filtro se usan los totales del dia. Con filtro se suman los desgloses
       * por cliente: no son intercambiables, porque un mismo empleado duplicado en
       * dos clientes cuenta una vez en el total del dia y una vez en cada cliente.
       */
      let dayTotals: DeviationTotals;
      if (customerFilter) {
        // El desglose por cliente respeta el mismo criterio: si el dia no tiene
        // medicion, sus clientes tampoco.
        dayTotals = {
          ...EMPTY_TOTALS,
          rows_with_deviations: day.totals.rows_with_deviations === null ? null : 0,
          employee_deviations: day.totals.employee_deviations === null ? null : 0,
          equipment_deviations: day.totals.equipment_deviations === null ? null : 0,
        };
        for (const entry of day.byCustomer) {
          if (!entry.customer_id || !customerFilter.has(entry.customer_id)) continue;
          accumulate(dayTotals, entry);
        }
      } else {
        dayTotals = day.totals;
      }

      const { key, label } = getBucketKey(day.date, granularity);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { key, label, ...EMPTY_TOTALS, missingDays: 0 };
        buckets.set(key, bucket);
      }

      accumulate(bucket, dayTotals);
      accumulate(totals, dayTotals);

      // Dia con parte pero sin registro de desvios (no llegó el mail de esa noche).
      if (dayTotals.employee_deviations === null) {
        bucket.missingDays += 1;
        missingDays += 1;
      }
    }

    const sorted = Array.from(buckets.values()).sort((a, b) => a.key.localeCompare(b.key));

    return { chartData: sorted, periodTotals: totals, missingDaysInWindow: missingDays };
  }, [daysInWindow, granularity, selectedCustomerIds]);

  /*
   * Un dia sin desvios igual genera snapshot, asi que "cero desvios" se dibuja
   * como linea plana. Que no haya ningun punto significa que no hubo partes
   * diarios cerrados: es ausencia de informacion, no una buena noticia.
   */
  const hasDays = chartData.length > 0;
  const hasNoDeviations = hasDays && DEVIATION_SERIES.every((serie) => periodTotals[serie.key] === 0);
  const isFilteredByCustomer = selectedCustomerIds.length > 0;
  // Periodo anterior al primer snapshot en vivo: solo hay duplicados.
  const hasUnmeasuredSeries = hasDays && DEVIATION_SERIES.some((serie) => periodTotals[serie.key] === null);

  const toggleSeries = (key: DeviationSeriesKey) => {
    setVisibleSeries((current) => {
      // Nunca dejar el grafico sin ninguna serie: apagar la ultima no hace nada.
      if (current.includes(key)) {
        return current.length === 1 ? current : current.filter((k) => k !== key);
      }
      return [...current, key];
    });
  };

  const handleCustomerChange = (values: string[]) => {
    // La reagregacion recorre todo el periodo; en transicion para que el click
    // en el combo responda de inmediato.
    startTransition(() => setSelectedCustomerIds(values));
  };

  const shiftMonth = (amount: number) =>
    setSelectedMonthKey((key) => moment(key, MONTH_KEY_FORMAT).add(amount, 'month').format(MONTH_KEY_FORMAT));

  return (
    <section data-deviation-series className="grid grid-cols-1 gap-3 mb-4">
      <SeriesColorVars />

      <Card className="@container gap-0 py-0">
        <div className="flex flex-col gap-1 px-6 pt-4 pb-3 @xl:py-4">
          <h3 className="text-base font-semibold leading-none">Desvíos del parte diario</h3>
          <p className="text-sm text-muted-foreground">{periodLabel} — la meta es 0 desvíos</p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => shiftMonth(-1)}
                disabled={!canGoBack}
                aria-label="Mes anterior"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="min-w-[8.5rem] text-center text-sm font-medium tabular-nums">{monthLabel}</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => shiftMonth(1)}
                disabled={!canGoForward}
                aria-label="Mes siguiente"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>

            <ToggleGroup
              type="single"
              value={granularity}
              onValueChange={(value) => {
                // Radix permite des-seleccionar; siempre debe quedar una activa.
                if (value) setGranularity(value as DeviationGranularity);
              }}
              variant="outline"
              size="sm"
              className="max-w-full overflow-x-auto"
              aria-label="Agrupar por"
            >
              {GRANULARITY_OPTIONS.map((option) => (
                <ToggleGroupItem key={option.value} value={option.value}>
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            <div className="w-full @xl:w-56">
              <MultiSelectCombobox
                options={customerOptions}
                placeholder="Todos los clientes"
                emptyMessage="No se encontraron clientes"
                selectedValues={selectedCustomerIds}
                onChange={handleCustomerChange}
                showSelectAll
              />
            </div>
          </div>
        </div>

        {/*
          Los KPI son ademas la leyenda interactiva del grafico: prenden y apagan
          su serie. Van en grilla propia a ancho completo — la tira lateral de
          shadcn esta pensada para dos celdas y con cinco rompia los bordes al
          envolver.
        */}
        <div
          role="group"
          aria-label="Indicadores: mostrar u ocultar series del gráfico"
          className="grid grid-cols-2 gap-px border-y bg-border @2xl:grid-cols-3 @5xl:grid-cols-5"
        >
          {DEVIATION_SERIES.map((serie) => {
            const isActive = visibleSeries.includes(serie.key);
            const isLastActive = isActive && visibleSeries.length === 1;

            return (
              <button
                key={serie.key}
                type="button"
                aria-pressed={isActive}
                aria-disabled={isLastActive || undefined}
                title={isLastActive ? 'Debe quedar al menos una serie visible' : undefined}
                data-active={isActive}
                onClick={() => toggleSeries(serie.key)}
                className="group flex cursor-pointer flex-col justify-center gap-1 bg-card px-4 py-3 text-left
                           transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2
                           focus-visible:ring-ring focus-visible:ring-inset @xl:px-5 @xl:py-4"
              >
                <span className="flex items-center gap-1.5 text-xs leading-tight text-muted-foreground group-data-[active=false]:opacity-55">
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-[2px] group-data-[active=false]:opacity-40"
                    style={{ backgroundColor: seriesColorVar(serie.key) }}
                  />
                  <span className="truncate">{serie.label}</span>
                </span>
                <span className="text-lg font-bold leading-none tabular-nums tracking-tight @xl:text-2xl group-data-[active=false]:opacity-55">
                  {periodTotals[serie.key] ?? <span className="text-muted-foreground">—</span>}
                </span>
              </button>
            );
          })}
        </div>

        <CardContent className="px-2 pt-4 @xl:px-6 @xl:pt-6">
          {!hasDays ? (
            <div className="flex h-[300px] flex-col items-center justify-center gap-1 text-center">
              <p className="text-sm font-medium">Sin datos para este período</p>
              <p role="status" className="max-w-md text-xs text-muted-foreground">
                {data.days.length === 0
                  ? 'Todavía no hay registros de desvíos del parte diario.'
                  : `No hay partes diarios cerrados en ${periodLabel.toLowerCase()}. El registro de desvíos comienza el ${formatDateAr(data.days[0].date)}.`}
              </p>
            </div>
          ) : (
            <>
              <DesviosTimeSeriesChart chartData={chartData} visibleSeries={visibleSeries} />

              <ChartSummary
                className="mt-3"
                title="Desvíos del parte diario"
                summary={`${periodLabel}: ${DEVIATION_SERIES.filter((serie) => visibleSeries.includes(serie.key))
                  .map((serie) => `${serie.label} ${periodTotals[serie.key] ?? 'sin medición'}`)
                  .join(', ')}. La meta es 0 desvíos.`}
                columns={[
                  { key: 'label', header: 'Período' },
                  ...DEVIATION_SERIES.map((serie) => ({ key: serie.key, header: serie.label, numeric: true })),
                ]}
                rows={chartData.map((point) => ({
                  label: point.label,
                  ...Object.fromEntries(DEVIATION_SERIES.map((serie) => [serie.key, point[serie.key] ?? '—'])),
                }))}
              />

              {hasNoDeviations && (
                <p className="px-4 pt-3 text-xs text-muted-foreground @xl:px-0">
                  Sin desvíos {isFilteredByCustomer ? 'para los clientes seleccionados ' : ''}en el período. Se
                  registraron {chartData.length} {chartData.length === 1 ? 'período' : 'períodos'} con parte diario
                  cerrado.
                </p>
              )}

              {(hasUnmeasuredSeries || missingDaysInWindow > 0) && (
                <p className="px-4 pt-3 text-xs leading-relaxed text-muted-foreground @xl:px-0">
                  {hasUnmeasuredSeries
                    ? 'El reporte de desvíos del parte diario existe desde febrero de 2026: antes de esa fecha no se medían. Los duplicados, en cambio, se pueden reconstruir y están desde el inicio.'
                    : `Sin registro de desvíos en ${missingDaysInWindow} ${missingDaysInWindow === 1 ? 'día' : 'días'} del período; esos días no suman a los totales.`}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
