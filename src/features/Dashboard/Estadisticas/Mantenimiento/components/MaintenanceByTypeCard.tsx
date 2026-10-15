'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Wrench } from 'lucide-react';
import moment from 'moment';
import * as React from 'react';
import { Cell, Pie, PieChart } from 'recharts';
import { getMaintenanceByTypeForMonth } from '../actions/actions.server';
import type { VehicleStatus } from '../types';

// Paleta ciclica para los tipos de equipo (dinamicos, a diferencia de las 3
// categorias fijas del donut de tenencia).
const TYPE_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'oklch(0.65 0.18 30)',
  'oklch(0.70 0.14 200)',
  'oklch(0.62 0.19 320)',
  'oklch(0.74 0.15 130)',
  'oklch(0.66 0.16 260)',
];

const STATUS_LABELS: Record<VehicleStatus, string> = {
  operativo: 'Operativo',
  operativo_condicionado: 'Operativo condicionado',
  en_preparacion: 'En preparación',
  no_operativo: 'No operativo',
  en_reparacion: 'En reparación',
};

const chartConfig = { count: { label: 'Equipos' } } satisfies ChartConfig;

/** Formatea km/hs (string numerico) con separador de miles. */
function fmtNum(value: string): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('es-AR') : value;
}

/**
 * Card de equipos en mantenimiento agrupados por TIPO de equipo (ticket 233).
 * Autonomo: maneja su propio selector de mes (flechas mes a mes + calendario para
 * saltar a meses viejos). Muestra un donut por tipo y una leyenda clickeable con
 * scroll; al tocar un tipo despliega la lista de equipos (dominio, nro interno,
 * solicitudes abiertas y tooltip). Cuenta dominios unicos que entraron a taller.
 */
export function MaintenanceByTypeCard() {
  const [selectedMonth, setSelectedMonth] = React.useState(() => moment(argentinaDate()).startOf('month'));
  const [selectedTypeId, setSelectedTypeId] = React.useState<string | null>(null);
  const [filterTypeIds, setFilterTypeIds] = React.useState<string[]>([]);
  const [monthPickerOpen, setMonthPickerOpen] = React.useState(false);

  const monthKey = selectedMonth.format('YYYY-MM');
  const monthLabel = React.useMemo(() => {
    const f = selectedMonth.clone().locale('es').format('MMMM YYYY');
    return f.charAt(0).toUpperCase() + f.slice(1);
  }, [selectedMonth]);
  const maxMonth = React.useMemo(() => moment(argentinaDate()).add(1, 'month').startOf('month'), []);
  const canGoForward = selectedMonth.isBefore(maxMonth, 'month');

  // Cambiar de mes resetea seleccion y filtro (los tipos pueden no existir).
  const goToMonth = React.useCallback((next: moment.Moment) => {
    setSelectedMonth(next);
    setSelectedTypeId(null);
    setFilterTypeIds([]);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ['mantenimiento-by-type', monthKey],
    queryFn: () => getMaintenanceByTypeForMonth(monthKey),
    staleTime: 5 * 60 * 1000,
  });

  const groups = React.useMemo(() => data ?? [], [data]);

  // Color estable por tipo (segun orden de aparicion del dataset completo).
  const colorByType = React.useMemo(() => {
    const map = new Map<string, string>();
    groups.forEach((g, i) => map.set(g.typeId, TYPE_COLORS[i % TYPE_COLORS.length]));
    return map;
  }, [groups]);

  const visible = React.useMemo(
    () => (filterTypeIds.length > 0 ? groups.filter((g) => filterTypeIds.includes(g.typeId)) : groups),
    [groups, filterTypeIds]
  );

  const total = React.useMemo(() => visible.reduce((s, g) => s + g.count, 0), [visible]);

  const donutData = React.useMemo(
    () =>
      visible
        .filter((g) => g.count > 0)
        .map((g) => ({
          typeId: g.typeId,
          typeName: g.typeName,
          count: g.count,
          fill: colorByType.get(g.typeId) ?? 'var(--chart-1)',
          fillOpacity: selectedTypeId && selectedTypeId !== g.typeId ? 0.25 : 1,
        })),
    [visible, selectedTypeId, colorByType]
  );

  const typeOptions = React.useMemo(() => groups.map((g) => ({ label: g.typeName, value: g.typeId })), [groups]);
  const selectedGroup = visible.find((g) => g.typeId === selectedTypeId) ?? null;
  const isEmpty = !isFetching && groups.length === 0;

  return (
    <TooltipProvider delayDuration={150}>
      <Card className="py-0">
        <CardHeader className="px-6 pt-4 pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wrench className="h-4 w-4 text-muted-foreground" />
                Equipos en mantenimiento por tipo
                {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </CardTitle>
              <CardDescription className="mt-0.5">
                {total} {total === 1 ? 'equipo único' : 'equipos únicos'} en taller · {monthLabel}
              </CardDescription>
              {/* Selector de mes: flechas mes a mes + calendario para saltar de mes/año */}
              <div className="mt-3 flex w-fit items-center gap-1 rounded-md border bg-card/40 p-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => goToMonth(selectedMonth.clone().subtract(1, 'month'))}
                  aria-label="Mes anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Popover open={monthPickerOpen} onOpenChange={setMonthPickerOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label="Elegir mes en el calendario"
                      className="flex min-w-[140px] items-center justify-center gap-1.5 rounded-sm px-2 py-1 text-center text-sm font-medium transition-colors hover:bg-muted"
                    >
                      <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                      {monthLabel}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="center">
                    <Calendar
                      mode="single"
                      captionLayout="dropdown"
                      selected={selectedMonth.toDate()}
                      defaultMonth={selectedMonth.toDate()}
                      onSelect={(date) => {
                        if (date) {
                          goToMonth(moment(date).startOf('month'));
                          setMonthPickerOpen(false);
                        }
                      }}
                      disabled={(date) => moment(date).isAfter(moment(argentinaDate()), 'month')}
                    />
                  </PopoverContent>
                </Popover>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={!canGoForward}
                  onClick={() => goToMonth(selectedMonth.clone().add(1, 'month'))}
                  aria-label="Mes siguiente"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {typeOptions.length > 0 && (
              <div className="sm:w-[210px]">
                <MultiSelectCombobox
                  options={typeOptions}
                  placeholder="Todos los tipos"
                  emptyMessage="No hay tipos"
                  selectedValues={filterTypeIds}
                  onChange={setFilterTypeIds}
                  showSelectAll
                />
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="px-6 pb-5">
          {isEmpty ? (
            <div className="flex h-44 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <Wrench className="h-5 w-5 opacity-40" />
              Sin equipos en mantenimiento este período
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {/* Donut + leyenda */}
              <div className="flex flex-col items-center gap-5 lg:flex-row lg:items-center lg:justify-around">
                <ChartContainer config={chartConfig} className="aspect-square h-[190px] w-[190px] shrink-0">
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="count"
                      nameKey="typeName"
                      innerRadius={58}
                      outerRadius={86}
                      strokeWidth={2}
                      paddingAngle={total > 0 ? 2 : 0}
                    >
                      {donutData.map((entry) => (
                        <Cell key={entry.typeId} fill={entry.fill} fillOpacity={entry.fillOpacity} />
                      ))}
                    </Pie>
                    <text
                      x="50%"
                      y="46%"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="fill-foreground text-3xl font-bold"
                    >
                      {total}
                    </text>
                    <text
                      x="50%"
                      y="58%"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="fill-muted-foreground text-xs"
                    >
                      equipos
                    </text>
                  </PieChart>
                </ChartContainer>

                {/* Leyenda clickeable con scroll interno */}
                <div className="w-full lg:max-w-xs">
                  <p className="mb-1.5 px-1 text-[11px] uppercase tracking-wide text-muted-foreground/80">
                    Tipos · tocá uno para ver sus equipos
                  </p>
                  <div className="max-h-[170px] space-y-1 overflow-y-auto pr-1">
                    {visible.map((g) => {
                      const isSel = selectedTypeId === g.typeId;
                      const dimmed = selectedTypeId !== null && !isSel;
                      const pct = total > 0 ? Math.round((g.count / total) * 100) : 0;
                      return (
                        <button
                          key={g.typeId}
                          type="button"
                          onClick={() => setSelectedTypeId(isSel ? null : g.typeId)}
                          aria-pressed={isSel}
                          aria-label={`${g.typeName}: ${g.count} equipos. Tocá para ver la lista`}
                          className={cn(
                            'group flex w-full cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-all',
                            isSel
                              ? 'border-foreground/30 bg-muted/70'
                              : 'border-transparent hover:border-border hover:bg-muted/50',
                            dimmed && 'opacity-50'
                          )}
                        >
                          <ChevronRight
                            className={cn(
                              'h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:text-muted-foreground',
                              isSel && 'rotate-90 text-foreground'
                            )}
                          />
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: colorByType.get(g.typeId) }}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium" title={g.typeName}>
                            {g.typeName}
                          </span>
                          <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
                          <span className="w-6 text-right text-sm font-semibold tabular-nums">{g.count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Drill-down: equipos del tipo seleccionado, con scroll */}
              {selectedGroup && (
                <div className="space-y-2 border-t pt-3">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    Equipos · <span className="normal-case text-foreground/80">{selectedGroup.typeName}</span>
                  </span>
                  <div className="grid max-h-[240px] grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
                    {selectedGroup.vehicles.map((v) => (
                      <Tooltip key={v.id}>
                        <TooltipTrigger asChild>
                          <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-card px-2.5 py-1.5 text-sm transition-colors hover:border-border hover:bg-muted/40">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="font-mono font-medium">{v.domain ?? '—'}</span>
                              {v.internNumber && (
                                <span className="truncate text-xs text-muted-foreground">#{v.internNumber}</span>
                              )}
                            </span>
                            {v.openCount > 0 && (
                              <Badge
                                variant="outline"
                                className="shrink-0 border-[var(--dash-warn)] tabular-nums text-foreground"
                              >
                                {v.openCount} {v.openCount === 1 ? 'abierta' : 'abiertas'}
                              </Badge>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          <div className="space-y-0.5">
                            <p className="font-medium">
                              {v.domain ?? 'Sin dominio'}
                              {v.internNumber ? ` · #${v.internNumber}` : ''}
                            </p>
                            <p>Estado: {STATUS_LABELS[v.status]}</p>
                            {v.kilometer != null && <p>Km: {fmtNum(v.kilometer)}</p>}
                            {v.engineHours != null && <p>Hs: {fmtNum(v.engineHours)}</p>}
                            <p>Solicitudes abiertas: {v.openCount}</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
