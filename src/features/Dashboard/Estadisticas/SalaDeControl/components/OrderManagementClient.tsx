'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ChartSummary } from '@/features/Dashboard/shared/charts/ChartSummary';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/es';
import * as React from 'react';
import type { PreparteKpiData } from '../actions/preparte-kpi.server';
import { ORDER_CHART_CONFIG, ORDER_SERIES, type OrderActiveView } from '../utils/order-series';
import { OrderManagementBarChart } from './OrderManagementBarChart';
import { OrderManagementChart, type OrderChartDataPoint } from './OrderManagementChart';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Granularity = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
type ActiveView = OrderActiveView;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBucketKey(dateStr: string, granularity: Granularity): { key: string; label: string } {
  const m = moment(dateStr);

  if (granularity === 'daily') {
    return {
      key: `day-${dateStr}`,
      label: m.format('D MMM'),
    };
  }

  if (granularity === 'weekly') {
    const weekStart = m.clone().startOf('isoWeek');
    const weekEnd = weekStart.clone().add(6, 'days');
    return {
      key: `week-${weekStart.format('YYYY-MM-DD')}`,
      label: `${weekStart.format('D MMM')} - ${weekEnd.format('D MMM')}`,
    };
  }

  if (granularity === 'quarterly') {
    const q = m.quarter();
    const year = m.year();
    return {
      key: `quarter-${year}-Q${q}`,
      label: `T${q} ${year}`,
    };
  }

  return {
    key: `month-${m.format('YYYY-MM')}`,
    label: m.format('MMM YYYY'),
  };
}

function getDataWindow(selectedMonth: moment.Moment, granularity: Granularity): { start: string; end: string } {
  const end = selectedMonth.clone().endOf('month').format('YYYY-MM-DD');

  if (granularity === 'daily') {
    return {
      start: selectedMonth.clone().startOf('month').format('YYYY-MM-DD'),
      end,
    };
  }

  if (granularity === 'weekly') {
    return {
      start: selectedMonth.clone().startOf('month').format('YYYY-MM-DD'),
      end,
    };
  }

  if (granularity === 'monthly') {
    return {
      start: selectedMonth.clone().subtract(5, 'months').startOf('month').format('YYYY-MM-DD'),
      end,
    };
  }

  if (granularity === 'quarterly') {
    // 4 trimestres (1 ano) terminando en el trimestre del mes seleccionado
    return {
      start: selectedMonth.clone().subtract(3, 'quarters').startOf('quarter').format('YYYY-MM-DD'),
      end: selectedMonth.clone().endOf('quarter').format('YYYY-MM-DD'),
    };
  }

  // yearly — 12 months back
  return {
    start: selectedMonth.clone().subtract(11, 'months').startOf('month').format('YYYY-MM-DD'),
    end,
  };
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface Props {
  data: PreparteKpiData;
}

export function OrderManagementClient({ data }: Props) {
  const [selectedMonth, setSelectedMonth] = React.useState(() => moment(argentinaDate()).startOf('month'));
  const [granularity, setGranularity] = React.useState<Granularity>('monthly');
  const [selectedCustomerIds, setSelectedCustomerIds] = React.useState<string[]>([]);
  const [activeView, setActiveView] = React.useState<ActiveView>('total');

  // Earliest month with data
  const earliestMonth = React.useMemo(() => {
    if (data.rows.length === 0) return moment(argentinaDate());
    return moment(data.rows[0].date).startOf('month');
  }, [data.rows]);

  const canGoBack = selectedMonth.isAfter(earliestMonth, 'month');
  const canGoForward = selectedMonth.isBefore(moment(argentinaDate()), 'month');

  // Process data
  const { chartData, stats, periodLabel } = React.useMemo(() => {
    moment.locale('es');

    const { start, end } = getDataWindow(selectedMonth, granularity);
    const customerFilter = selectedCustomerIds.length > 0 ? new Set(selectedCustomerIds) : null;

    // Bucket aggregation for chart
    const buckets = new Map<
      string,
      { label: string; confirmado: number; pendiente: number; rechazado: number; cancelado: number; otros: number }
    >();

    // Current month stats (always the selected month regardless of granularity)
    const monthStart = selectedMonth.clone().startOf('month').format('YYYY-MM-DD');
    const monthEnd = selectedMonth.clone().endOf('month').format('YYYY-MM-DD');
    let totalCount = 0;
    let confirmadoCount = 0;
    let pendienteCount = 0;
    let rechazadoCount = 0;
    let canceladoCount = 0;

    for (const row of data.rows) {
      if (customerFilter && !customerFilter.has(row.customerId)) continue;

      // Current month stats
      if (row.date >= monthStart && row.date <= monthEnd) {
        totalCount += row.total;
        confirmadoCount += row.confirmado;
        pendienteCount += row.pendiente;
        rechazadoCount += row.rechazado;
        canceladoCount += row.cancelado;
      }

      // Chart data (may span wider window)
      if (row.date < start || row.date > end) continue;

      const { key, label } = getBucketKey(row.date, granularity);

      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { label, confirmado: 0, pendiente: 0, rechazado: 0, cancelado: 0, otros: 0 };
        buckets.set(key, bucket);
      }

      bucket.confirmado += row.confirmado;
      bucket.pendiente += row.pendiente;
      bucket.rechazado += row.rechazado;
      bucket.cancelado += row.cancelado;
      bucket.otros += row.otros;
    }

    const chartData: OrderChartDataPoint[] = Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, b]) => ({
        label: b.label,
        confirmado: b.confirmado,
        pendiente: b.pendiente,
        rechazado: b.rechazado,
        cancelado: b.cancelado,
        otros: b.otros,
      }));

    const stats = {
      total: totalCount,
      confirmado: confirmadoCount,
      pendiente: pendienteCount,
      rechazado: rechazadoCount,
      cancelado: canceladoCount,
    };

    // Period label
    let periodLabel: string;
    if (granularity === 'daily' || granularity === 'weekly') {
      periodLabel = selectedMonth.clone().locale('es').format('MMMM YYYY');
      periodLabel = periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1);
    } else if (granularity === 'monthly') {
      const startM = selectedMonth.clone().subtract(5, 'months');
      periodLabel = `${startM.locale('es').format('MMM YYYY')} – ${selectedMonth.clone().locale('es').format('MMM YYYY')}`;
    } else if (granularity === 'quarterly') {
      const startM = selectedMonth.clone().subtract(3, 'quarters');
      periodLabel = `T${startM.quarter()} ${startM.year()} – T${selectedMonth.quarter()} ${selectedMonth.year()}`;
    } else {
      // yearly
      const startM = selectedMonth.clone().subtract(11, 'months');
      periodLabel = `${startM.locale('es').format('MMM YYYY')} – ${selectedMonth.clone().locale('es').format('MMM YYYY')}`;
    }

    return { chartData, stats, periodLabel };
  }, [data.rows, selectedMonth, granularity, selectedCustomerIds]);

  // Aggregate by customer for bar chart
  const clientBarData = React.useMemo(() => {
    moment.locale('es');
    const { start, end } = getDataWindow(selectedMonth, granularity);
    const customerFilter = selectedCustomerIds.length > 0 ? new Set(selectedCustomerIds) : null;

    const byCustomer = new Map<
      string,
      {
        name: string;
        confirmado: number;
        pendiente: number;
        rechazado: number;
        cancelado: number;
        otros: number;
        total: number;
      }
    >();

    for (const row of data.rows) {
      if (customerFilter && !customerFilter.has(row.customerId)) continue;
      if (row.date < start || row.date > end) continue;

      let entry = byCustomer.get(row.customerId);
      if (!entry) {
        entry = { name: row.customerName, confirmado: 0, pendiente: 0, rechazado: 0, cancelado: 0, otros: 0, total: 0 };
        byCustomer.set(row.customerId, entry);
      }

      entry.confirmado += row.confirmado;
      entry.pendiente += row.pendiente;
      entry.rechazado += row.rechazado;
      entry.cancelado += row.cancelado;
      entry.otros += row.otros;
      entry.total += row.total;
    }

    return Array.from(byCustomer.values())
      .sort((a, b) => b.total - a.total)
      .map((c) => ({
        label: c.name.length > 20 ? c.name.slice(0, 18) + '...' : c.name,
        confirmado: c.confirmado,
        pendiente: c.pendiente,
        rechazado: c.rechazado,
        cancelado: c.cancelado,
        otros: c.otros,
      }));
  }, [data.rows, selectedMonth, granularity, selectedCustomerIds]);

  // Month display
  const monthDisplay = selectedMonth.clone().locale('es').format('MMMM YYYY');
  const capitalizedMonth = monthDisplay.charAt(0).toUpperCase() + monthDisplay.slice(1);

  // Stat buttons config (right side of header)
  const statButtons: { key: ActiveView; label: string; value: number }[] = [
    { key: 'total', label: 'Total', value: stats.total },
    { key: 'confirmado', label: 'Confirmados', value: stats.confirmado },
    { key: 'pendiente', label: 'Pendientes', value: stats.pendiente },
    { key: 'rechazado', label: 'Rechazados', value: stats.rechazado },
    { key: 'cancelado', label: 'Cancelados', value: stats.cancelado },
  ];

  return (
    <>
      <Card className="py-0">
        <CardHeader className="flex flex-col items-stretch border-b p-0! sm:flex-row">
          {/* Left: title + controls */}
          <div className="flex flex-1 flex-col justify-center gap-1 px-6 pt-4 pb-3 sm:py-4">
            <CardTitle className="text-base">Gestion de Pedidos — Sala de Control</CardTitle>
            <CardDescription>
              {periodLabel}
              {selectedCustomerIds.length > 0 && (
                <span className="ml-1">
                  ({selectedCustomerIds.length} {selectedCustomerIds.length === 1 ? 'cliente' : 'clientes'})
                </span>
              )}
              {/*
                Los pedidos cancelados, rechazados y vencidos nunca llegan a tener un parte
                asociado, que es el unico camino hacia el centro de costo. Filtrarlos por ese
                criterio vaciaria justamente los estados que este KPI mide.
              */}
              <span className="ml-1 text-xs italic">— no responde al filtro de centro de costo</span>
            </CardDescription>

            {/* Controls row */}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {/* Month navigator */}
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  aria-label="Mes anterior"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={!canGoBack}
                  onClick={() => setSelectedMonth((m) => m.clone().subtract(1, 'month'))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium min-w-[130px] text-center">{capitalizedMonth}</span>
                <Button
                  type="button"
                  aria-label="Mes siguiente"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={!canGoForward}
                  onClick={() => setSelectedMonth((m) => m.clone().add(1, 'month'))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Granularity toggle */}
              <ToggleGroup
                type="single"
                value={granularity}
                onValueChange={(val) => {
                  if (val) setGranularity(val as Granularity);
                }}
                variant="outline"
                size="sm"
              >
                <ToggleGroupItem value="daily">Diario</ToggleGroupItem>
                <ToggleGroupItem value="weekly">Semanal</ToggleGroupItem>
                <ToggleGroupItem value="monthly">Mensual</ToggleGroupItem>
                <ToggleGroupItem value="quarterly">Trimestral</ToggleGroupItem>
                <ToggleGroupItem value="yearly">Anual</ToggleGroupItem>
              </ToggleGroup>

              {/* Client filter */}
              <div className="w-[220px]">
                <MultiSelectCombobox
                  options={data.customers.map((c) => ({ label: c.name, value: c.id }))}
                  placeholder="Todos los clientes"
                  emptyMessage="No se encontraron clientes"
                  selectedValues={selectedCustomerIds}
                  onChange={setSelectedCustomerIds}
                  showSelectAll
                />
              </div>
            </div>
          </div>

          {/* Right: stat buttons (identical pattern to Historico de servicios) */}
          <div className="flex flex-wrap sm:flex-nowrap">
            {statButtons.map(({ key, label, value }) => (
              <button
                key={key}
                type="button"
                aria-pressed={activeView === key}
                data-active={activeView === key}
                className="relative z-30 flex flex-1 flex-col justify-center gap-1 border-t px-3 py-4 text-left even:border-l data-[active=true]:bg-muted/50 sm:border-t-0 sm:border-l sm:px-8 sm:py-6 cursor-pointer transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setActiveView(key)}
              >
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="text-lg leading-none font-bold sm:text-3xl">{value.toLocaleString('es-AR')}</span>
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
          {chartData.length > 0 ? (
            <>
              <OrderManagementChart chartData={chartData} activeView={activeView} />
              <ChartSummary
                className="mt-3"
                title="Gestión de pedidos"
                summary={`${periodLabel}: ${stats.total.toLocaleString('es-AR')} pedidos en el mes seleccionado (${stats.confirmado} confirmados, ${stats.pendiente} pendientes, ${stats.rechazado} rechazados, ${stats.cancelado} cancelados).`}
                columns={[
                  { key: 'label', header: 'Período' },
                  ...ORDER_SERIES.map((key) => ({ key, header: ORDER_CHART_CONFIG[key].label, numeric: true })),
                ]}
                rows={chartData.map((point) => ({
                  label: point.label,
                  ...Object.fromEntries(ORDER_SERIES.map((key) => [key, point[key].toLocaleString('es-AR')])),
                }))}
              />
            </>
          ) : (
            <div role="status" className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
              No hay datos de pedidos para este periodo
            </div>
          )}
        </CardContent>
      </Card>

      {clientBarData.length > 0 && (
        <OrderManagementBarChart chartData={clientBarData} activeView={activeView} periodLabel={periodLabel} />
      )}
    </>
  );
}
