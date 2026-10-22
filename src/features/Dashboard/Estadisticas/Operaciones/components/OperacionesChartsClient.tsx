'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { categoricalColorVar } from '@/features/Dashboard/shared/charts/ChartColorVars';
import { ChartSummary } from '@/features/Dashboard/shared/charts/ChartSummary';
import {
  PeriodControls,
  getBucketKey,
  getDataWindow,
  type Granularity,
} from '@/features/Dashboard/shared/charts/period-controls';
import { argentinaDate } from '@/shared/lib/argentina-time';
import moment from 'moment';
import 'moment/locale/es';
import * as React from 'react';
import type { OperationsChartData } from '../actions/actions.server';
import { ClientRankingChart } from './ClientRankingChart';
import type { ChartDataPoint, ClientBreakdown } from './CustomChartTooltip';
import { ServiceHistoryAreaChart } from './ServiceHistoryAreaChart';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActiveView = 'total' | 'mensual' | 'adicional';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Opción del filtro para partes cuyos equipos no tienen centro de costo asignado */
const UNASSIGNED_COST_CENTER = '__null__';

/** Meses previos al elegido que abren las vistas semanal y mensual de este gráfico. */
const MONTHS_BACK = { weekly: 2, monthly: 2 };

interface Props {
  data: OperationsChartData;
}

export function OperacionesChartsClient({ data }: Props) {
  const [selectedMonth, setSelectedMonth] = React.useState(() => moment(argentinaDate()).startOf('month'));
  const [granularity, setGranularity] = React.useState<Granularity>('daily');
  const [selectedCustomerIds, setSelectedCustomerIds] = React.useState<string[]>([]);
  const [selectedCostCenterIds, setSelectedCostCenterIds] = React.useState<string[]>([]);
  const [activeView, setActiveView] = React.useState<ActiveView>('total');

  // Opciones del filtro de centro de costo — "Sin asignar" solo si existen partes sin centro
  const costCenterOptions = React.useMemo(() => {
    const options = data.costCenters.map((cc) => ({ label: cc.name, value: cc.id }));
    if (data.rows.some((row) => row.costCenterIds.length === 0)) {
      options.push({ label: 'Sin asignar', value: UNASSIGNED_COST_CENTER });
    }
    return options;
  }, [data.costCenters, data.rows]);

  // Determine the earliest month we have data for (to disable left arrow)
  const earliestMonth = React.useMemo(() => {
    if (data.rows.length === 0) return moment(argentinaDate());
    return moment(data.rows[0].date).startOf('month');
  }, [data.rows]);

  // Main processing — single loop
  const { chartData, totals, clientRanking, periodLabel } = React.useMemo(() => {
    moment.locale('es');

    const { start, end } = getDataWindow(selectedMonth, granularity, MONTHS_BACK);
    const customerFilter = selectedCustomerIds.length > 0 ? new Set(selectedCustomerIds) : null;
    const costCenterFilter = selectedCostCenterIds.length > 0 ? new Set(selectedCostCenterIds) : null;

    /**
     * Una fila pasa el filtro si alguno de sus centros está seleccionado, o si no tiene
     * centro y se eligió "Sin asignar". Cada parte vive en una sola fila (agrupada por su
     * conjunto exacto de centros), así que nunca se cuenta dos veces.
     */
    const matchesCostCenter = (rowCostCenterIds: string[]) => {
      if (!costCenterFilter) return true;
      if (rowCostCenterIds.length === 0) return costCenterFilter.has(UNASSIGNED_COST_CENTER);
      return rowCostCenterIds.some((id) => costCenterFilter.has(id));
    };

    // Bucket map: key -> { label, mensual, adicional, breakdownMap, byCostCenter }
    const buckets = new Map<
      string,
      {
        label: string;
        mensual: number;
        adicional: number;
        breakdownMap: Map<string, { name: string; mensual: number; adicional: number }>;
        byCostCenter: Map<string, { mensual: number; adicional: number }>;
      }
    >();

    // Client totals for ranking
    const clientTotals = new Map<string, { name: string; mensual: number; adicional: number }>();

    let totalMensual = 0;
    let totalAdicional = 0;

    for (const row of data.rows) {
      if (row.date < start || row.date > end) continue;
      if (customerFilter && !customerFilter.has(row.customerId)) continue;
      if (!matchesCostCenter(row.costCenterIds)) continue;

      const { key: bucketKey, label: bucketLabel } = getBucketKey(row.date, granularity);

      // Bucket aggregation
      let bucket = buckets.get(bucketKey);
      if (!bucket) {
        bucket = {
          label: bucketLabel,
          mensual: 0,
          adicional: 0,
          breakdownMap: new Map(),
          byCostCenter: new Map(),
        };
        buckets.set(bucketKey, bucket);
      }

      bucket.mensual += row.mensual;
      bucket.adicional += row.adicional;
      totalMensual += row.mensual;
      totalAdicional += row.adicional;

      /**
       * Desglose por centro de costo — alimenta una linea por centro seleccionado.
       * Un parte cuyos equipos pertenecen a varios centros suma en CADA uno de ellos,
       * porque cada linea responde "cuantos servicios toco este sector". Por eso la
       * suma de las lineas puede superar el total (pasa en ~1,4% de los partes) y se
       * aclara en la UI.
       */
      if (costCenterFilter) {
        const rowKeys = row.costCenterIds.length === 0 ? [UNASSIGNED_COST_CENTER] : row.costCenterIds;

        for (const key of rowKeys) {
          if (!costCenterFilter.has(key)) continue;

          let centerEntry = bucket.byCostCenter.get(key);
          if (!centerEntry) {
            centerEntry = { mensual: 0, adicional: 0 };
            bucket.byCostCenter.set(key, centerEntry);
          }
          centerEntry.mensual += row.mensual;
          centerEntry.adicional += row.adicional;
        }
      }

      // Per-client breakdown within bucket (for tooltip)
      let clientInBucket = bucket.breakdownMap.get(row.customerId);
      if (!clientInBucket) {
        clientInBucket = { name: row.customerName, mensual: 0, adicional: 0 };
        bucket.breakdownMap.set(row.customerId, clientInBucket);
      }
      clientInBucket.mensual += row.mensual;
      clientInBucket.adicional += row.adicional;

      // Client totals (for ranking)
      let clientTotal = clientTotals.get(row.customerId);
      if (!clientTotal) {
        clientTotal = { name: row.customerName, mensual: 0, adicional: 0 };
        clientTotals.set(row.customerId, clientTotal);
      }
      clientTotal.mensual += row.mensual;
      clientTotal.adicional += row.adicional;
    }

    // Build chart data sorted by bucket key
    const chartData: ChartDataPoint[] = Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, bucket]) => ({
        label: bucket.label,
        mensual: bucket.mensual,
        adicional: bucket.adicional,
        _breakdown: Array.from(bucket.breakdownMap.values()) as ClientBreakdown[],
        _byCostCenter: Object.fromEntries(bucket.byCostCenter),
      }));

    // Client ranking sorted by total descending
    const clientRanking = Array.from(clientTotals.values()).sort(
      (a, b) => b.mensual + b.adicional - (a.mensual + a.adicional)
    );

    // Period label
    let periodLabel: string;
    if (granularity === 'daily') {
      periodLabel = selectedMonth.clone().locale('es').format('MMMM YYYY');
      periodLabel = periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1);
    } else if (granularity === 'weekly' || granularity === 'monthly') {
      const startM = selectedMonth.clone().subtract(2, 'months');
      periodLabel = `${startM.locale('es').format('MMM YYYY')} - ${selectedMonth.clone().locale('es').format('MMM YYYY')}`;
    } else if (granularity === 'quarterly') {
      const startM = selectedMonth.clone().subtract(3, 'quarters');
      periodLabel = `T${startM.quarter()} ${startM.year()} - T${selectedMonth.quarter()} ${selectedMonth.year()}`;
    } else {
      // yearly
      const startM = selectedMonth.clone().subtract(11, 'months');
      periodLabel = `${startM.locale('es').format('MMM YYYY')} - ${selectedMonth.clone().locale('es').format('MMM YYYY')}`;
    }

    return {
      chartData,
      totals: { mensual: totalMensual, adicional: totalAdicional },
      clientRanking,
      periodLabel,
    };
  }, [data.rows, selectedMonth, granularity, selectedCustomerIds, selectedCostCenterIds]);

  /**
   * Una serie (linea) por centro de costo seleccionado. Sin seleccion no hay series y el
   * grafico mantiene su comportamiento original (areas apiladas Mensual/Adicional).
   */
  const costCenterSeries = React.useMemo(() => {
    if (selectedCostCenterIds.length === 0) return [];

    const nameById = new Map(data.costCenters.map((cc) => [cc.id, cc.name]));

    return selectedCostCenterIds.map((id, index) => ({
      key: id,
      dataKey: `cc_${id}`,
      name: id === UNASSIGNED_COST_CENTER ? 'Sin asignar' : nameById.get(id) ?? 'Sin nombre',
      // Paleta categórica del dashboard (8 colores distinguibles, con variante oscura); con más de 8 centros se reutilizan
      color: categoricalColorVar(index),
    }));
  }, [selectedCostCenterIds, data.costCenters]);

  /**
   * Agrega al dataset una clave por serie con el valor del boton activo (Total, Mensual o
   * Adicional). Se calcula aparte del loop principal para no recorrer los partes de nuevo
   * cada vez que se cambia de boton.
   */
  const chartDataWithSeries = React.useMemo(() => {
    if (costCenterSeries.length === 0) return chartData;

    return chartData.map((point) => {
      const byCenter = (point._byCostCenter ?? {}) as Record<string, { mensual: number; adicional: number }>;
      const enriched: ChartDataPoint = { ...point };

      for (const serie of costCenterSeries) {
        const entry = byCenter[serie.key];
        enriched[serie.dataKey] = !entry
          ? 0
          : activeView === 'mensual'
            ? entry.mensual
            : activeView === 'adicional'
              ? entry.adicional
              : entry.mensual + entry.adicional;
      }

      return enriched;
    });
  }, [chartData, costCenterSeries, activeView]);

  return (
    <section className="grid grid-cols-1 gap-3 mb-4">
      {/* Main area chart card */}
      <Card className="@container py-0">
        <CardHeader className="flex flex-col items-stretch border-b p-0! @3xl:flex-row">
          {/* Left: title + controls */}
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-6 pt-4 pb-3 @3xl:py-4">
            <CardTitle className="text-base">Historico de servicios</CardTitle>
            <CardDescription>
              {periodLabel}
              {selectedCustomerIds.length > 0 && (
                <span className="ml-1">
                  ({selectedCustomerIds.length} {selectedCustomerIds.length === 1 ? 'cliente' : 'clientes'})
                </span>
              )}
              {selectedCostCenterIds.length > 0 && (
                <span className="ml-1">
                  ({selectedCostCenterIds.length}{' '}
                  {selectedCostCenterIds.length === 1 ? 'centro de costo' : 'centros de costo'})
                </span>
              )}
            </CardDescription>

            {/* Controls row */}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <PeriodControls
                selectedMonth={selectedMonth}
                onSelectedMonthChange={setSelectedMonth}
                earliestMonth={earliestMonth}
                granularity={granularity}
                onGranularityChange={setGranularity}
              />

              {/* Client filter */}
              <div className="w-full max-w-[220px]">
                <MultiSelectCombobox
                  options={data.customers.map((c) => ({ label: c.name, value: c.id }))}
                  placeholder="Todos los clientes"
                  emptyMessage="No se encontraron clientes"
                  selectedValues={selectedCustomerIds}
                  onChange={setSelectedCustomerIds}
                  showSelectAll
                />
              </div>

              {/* Cost center filter — se resuelve por los equipos afectados al parte */}
              <div className="w-full max-w-[220px]">
                <MultiSelectCombobox
                  options={costCenterOptions}
                  placeholder="Todos los centros de costo"
                  emptyMessage="No se encontraron centros de costo"
                  selectedValues={selectedCostCenterIds}
                  onChange={setSelectedCostCenterIds}
                  showSelectAll
                />
              </div>
            </div>
          </div>

          {/* Right: stat buttons */}
          <div className="overflow-hidden @3xl:shrink-0">
            <div className="-ml-px flex @3xl:ml-0">
              {(['total', 'mensual', 'adicional'] as const).map((key) => {
                const value = key === 'total' ? totals.mensual + totals.adicional : totals[key];
                const label = key === 'total' ? 'Total' : key === 'mensual' ? 'Mensual' : 'Adicional';
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={activeView === key}
                    data-active={activeView === key}
                    className="relative z-30 flex flex-1 flex-col justify-center gap-1 border-t border-l px-4 py-4 text-left data-[active=true]:bg-muted/50 @3xl:border-t-0 @3xl:px-8 @3xl:py-6 cursor-pointer transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setActiveView(key)}
                  >
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <span className="text-lg leading-none font-bold tabular-nums @3xl:text-3xl">
                      {value.toLocaleString('es-AR')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-2 pt-4 @xl:px-6 @xl:pt-6">
          {chartData.length === 0 && (
            <p role="status" className="py-6 text-center text-sm text-muted-foreground">
              Sin servicios cargados para {periodLabel} con los filtros elegidos.
            </p>
          )}
          <ServiceHistoryAreaChart
            chartData={chartDataWithSeries}
            activeView={activeView}
            costCenterSeries={costCenterSeries}
          />
          <ChartSummary
            className="mt-3"
            title="Histórico de servicios"
            summary={
              chartData.length === 0
                ? `Sin servicios registrados en ${periodLabel}.`
                : `${periodLabel}: ${totals.mensual.toLocaleString('es-AR')} servicios mensuales y ${totals.adicional.toLocaleString('es-AR')} adicionales en ${chartData.length} ${chartData.length === 1 ? 'período' : 'períodos'}.`
            }
            columns={[
              { key: 'label', header: 'Período' },
              { key: 'mensual', header: 'Mensual', numeric: true },
              { key: 'adicional', header: 'Adicional', numeric: true },
            ]}
            rows={chartData.map((point) => ({
              label: point.label,
              mensual: point.mensual.toLocaleString('es-AR'),
              adicional: point.adicional.toLocaleString('es-AR'),
            }))}
          />
          {/* Un parte con equipos de varios centros suma en la linea de cada uno */}
          {costCenterSeries.length > 1 && (
            <p className="mt-2 px-2 text-xs text-muted-foreground @xl:px-0">
              Cada linea cuenta los servicios en los que participo ese centro de costo. Un servicio con equipos de
              varios centros aparece en la linea de cada uno, por lo que la suma de las lineas puede superar el total.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Client ranking chart */}
      <ClientRankingChart data={clientRanking} periodLabel={periodLabel} />
    </section>
  );
}
