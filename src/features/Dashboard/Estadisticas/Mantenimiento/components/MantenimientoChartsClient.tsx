'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/es';
import * as React from 'react';
import { getMaintenanceMonthSummary } from '../actions/actions.server';
import {
  OWNERSHIP_CATEGORIES,
  VEHICLE_STATUSES,
  type MaintenanceMonthSummary,
  type OwnershipCategory,
  type VehicleStatus,
  type WorkdaysAggregate,
} from '../types';
import { CategorySection } from './CategorySection';
import { MaintenanceByTypeCard } from './MaintenanceByTypeCard';
import { MaintenanceKindCard } from './MaintenanceKindCard';
import { MaintenanceStatsColorVars } from './MaintenanceStatsColorVars';
import { OwnershipDonutChart } from './OwnershipDonutChart';
import { RequestSourceCard } from './RequestSourceCard';

const MONTH_KEY_FORMAT = 'YYYY-MM';

interface Props {
  initialSummary: MaintenanceMonthSummary;
  initialMonthKey: string;
}

// Construye un Record vacio para conditionCounts (helper local).
function emptyConditionCounts(): Record<VehicleStatus, number> {
  return {
    operativo: 0,
    operativo_condicionado: 0,
    en_preparacion: 0,
    no_operativo: 0,
    en_reparacion: 0,
  };
}

// Suma una lista de Records de conditionCounts en uno solo.
function sumConditionCounts(records: Record<VehicleStatus, number>[]): Record<VehicleStatus, number> {
  const acc = emptyConditionCounts();
  for (const rec of records) {
    for (const s of VEHICLE_STATUSES) acc[s] += rec[s];
  }
  return acc;
}

export function MantenimientoChartsClient({ initialSummary, initialMonthKey }: Props) {
  const [selectedMonth, setSelectedMonth] = React.useState(() => moment(initialMonthKey, MONTH_KEY_FORMAT));

  // Drill-down de tenencia (toggle de UNA card a la vez).
  const [drilledCategory, setDrilledCategory] = React.useState<OwnershipCategory | null>(null);

  // Filtro global de estados — multi-select.
  const [selectedStatuses, setSelectedStatuses] = React.useState<Set<VehicleStatus>>(() => new Set());

  // Filtros locales por acordeon: tipos + patente.
  const [typeFilters, setTypeFilters] = React.useState<Record<OwnershipCategory, string[]>>({
    Propios: [],
    Leasing: [],
    Contratados: [],
  });
  const [patenteFilters, setPatenteFilters] = React.useState<Record<OwnershipCategory, string>>({
    Propios: '',
    Leasing: '',
    Contratados: '',
  });

  // Todas las secciones inician CERRADAS — el detalle se carga lazy al abrir.
  const [openSections, setOpenSections] = React.useState<Record<OwnershipCategory, boolean>>({
    Propios: false,
    Leasing: false,
    Contratados: false,
  });

  // Trigger de highlight breve cuando cambia el drill-down (apunta a un acordeon).
  // Cada bump aumenta el contador; CategorySection observa el cambio y aplica el ring.
  const [highlightSeq, setHighlightSeq] = React.useState(0);

  const monthKey = selectedMonth.format(MONTH_KEY_FORMAT);

  const { data: summary, isFetching } = useQuery({
    queryKey: ['mantenimiento-summary', monthKey],
    queryFn: () => getMaintenanceMonthSummary(monthKey),
    initialData: monthKey === initialMonthKey ? initialSummary : undefined,
    staleTime: 5 * 60 * 1000,
  });

  const earliestMonth = React.useMemo(() => {
    const fromData = summary?.earliestMonth ?? initialSummary.earliestMonth;
    return fromData ? moment(fromData, MONTH_KEY_FORMAT) : moment(argentinaDate()).subtract(1, 'year').startOf('month');
  }, [summary?.earliestMonth, initialSummary.earliestMonth]);

  const maxMonth = React.useMemo(() => moment(argentinaDate()).add(1, 'month').startOf('month'), []);

  const canGoBack = selectedMonth.isAfter(earliestMonth, 'month');
  const canGoForward = selectedMonth.isBefore(maxMonth, 'month');

  const monthLabel = React.useMemo(() => {
    const formatted = selectedMonth.clone().locale('es').format('MMMM YYYY');
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }, [selectedMonth]);

  // Reset filtros + cierra secciones al cambiar de mes: typeIds del mes anterior
  // pueden no existir en el nuevo mes y dejarian la lista vacia silenciosamente.
  // Cerrar secciones ademas evita disparar fetches pesados en el cambio de mes.
  const goToMonth = React.useCallback((next: moment.Moment) => {
    setSelectedMonth(next);
    setTypeFilters({ Propios: [], Leasing: [], Contratados: [] });
    setPatenteFilters({ Propios: '', Leasing: '', Contratados: '' });
    setOpenSections({ Propios: false, Leasing: false, Contratados: false });
    setDrilledCategory(null);
    setSelectedStatuses(new Set());
  }, []);

  const handleTypeFilterChange = React.useCallback(
    (category: OwnershipCategory) => (values: string[]) => {
      setTypeFilters((prev) => ({ ...prev, [category]: values }));
    },
    []
  );

  const handlePatenteFilterChange = React.useCallback(
    (category: OwnershipCategory) => (value: string) => {
      setPatenteFilters((prev) => ({ ...prev, [category]: value }));
    },
    []
  );

  const handleSectionOpenChange = React.useCallback(
    (category: OwnershipCategory) => (open: boolean) => {
      setOpenSections((prev) => ({ ...prev, [category]: open }));
    },
    []
  );

  const handleDrillDown = React.useCallback((category: OwnershipCategory) => {
    setDrilledCategory((prev) => (prev === category ? null : category));
    // Bump del trigger de highlight; CategorySection lo lee y aplica ring breve.
    setHighlightSeq((s) => s + 1);
  }, []);

  const handleToggleStatus = React.useCallback((status: VehicleStatus) => {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  const handleClearStatuses = React.useCallback(() => {
    setSelectedStatuses(new Set());
  }, []);

  const activeSummary = summary ?? initialSummary;

  // ── Derivados globales segun drill-down + estados seleccionados ──────────
  // Counts efectivos por categoria: si hay estados seleccionados, restringe a esos.
  // Si no hay seleccion, count total de la categoria.
  const effectiveCountsByCategory = React.useMemo<Record<OwnershipCategory, number>>(() => {
    if (selectedStatuses.size === 0) return activeSummary.countsByCategory;
    const result: Record<OwnershipCategory, number> = { Propios: 0, Leasing: 0, Contratados: 0 };
    for (const cat of OWNERSHIP_CATEGORIES) {
      let sum = 0;
      for (const s of selectedStatuses) sum += activeSummary.conditionCountsByCategory[cat][s];
      result[cat] = sum;
    }
    return result;
  }, [activeSummary.countsByCategory, activeSummary.conditionCountsByCategory, selectedStatuses]);

  // ConditionCounts efectivos para la banda inferior:
  // - Con drill-down: counts de esa categoria
  // - Sin drill-down: suma de las 3 categorias (= total global)
  const effectiveConditionCounts = React.useMemo(() => {
    if (drilledCategory) return activeSummary.conditionCountsByCategory[drilledCategory];
    return sumConditionCounts(OWNERSHIP_CATEGORIES.map((c) => activeSummary.conditionCountsByCategory[c]));
  }, [activeSummary.conditionCountsByCategory, drilledCategory]);

  // Workdays globales para el progress bar del header:
  // - Con drill-down: workdays de esa categoria
  // - Sin drill-down: suma de las 3 categorias
  // NOTA: el filtro de estados NO se aplica al workdays globalmente porque
  // worked esta agregado a nivel categoria (no por vehiculo+status). El
  // workdays del acordeon (que SI tiene granularidad por vehiculo) si lo aplica.
  const effectiveWorkdays = React.useMemo<WorkdaysAggregate>(() => {
    if (drilledCategory) return activeSummary.workdaysByCategory[drilledCategory];
    return OWNERSHIP_CATEGORIES.reduce<WorkdaysAggregate>(
      (acc, cat) => {
        acc.worked += activeSummary.workdaysByCategory[cat].worked;
        acc.possible += activeSummary.workdaysByCategory[cat].possible;
        return acc;
      },
      { worked: 0, possible: 0 }
    );
  }, [activeSummary.workdaysByCategory, drilledCategory]);

  // Para el chevron de "scroll a categoria" al activar drill-down,
  // mantenemos refs por acordeon. CategorySection puede expandirlas al recibir.
  const sectionRefs = React.useRef<Record<OwnershipCategory, HTMLDivElement | null>>({
    Propios: null,
    Leasing: null,
    Contratados: null,
  });

  // Scroll suave al acordeon activo en cada bump del drill-down.
  React.useEffect(() => {
    if (!drilledCategory) return;
    const el = sectionRefs.current[drilledCategory];
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    // Intencionalmente depende SOLO de highlightSeq para correr en cada toggle,
    // incluso si la categoria es la misma (no re-toggle de la misma categoria).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightSeq]);

  return (
    <section className="grid grid-cols-1 gap-3 mb-4">
      {/* Donut card */}
      <Card className="@container py-0">
        <CardHeader className="flex flex-col items-stretch border-b p-0! @3xl:flex-row">
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-6 pt-4 pb-3 @3xl:py-4">
            <CardTitle className="text-base flex items-center gap-2">
              Mantenimiento de equipos
              {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </CardTitle>
            <CardDescription>
              Distribución de la flota por tipo de tenencia · {monthLabel}
              {activeSummary.daysElapsed > 0 && (
                <span className="ml-1 text-muted-foreground/80">
                  ({activeSummary.daysElapsed} de {activeSummary.daysInMonth} días transcurridos)
                </span>
              )}
            </CardDescription>

            <div className="flex flex-wrap items-center gap-2 mt-3">
              <div className="flex items-center gap-1 rounded-md border bg-card/40 p-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={!canGoBack}
                  onClick={() => goToMonth(selectedMonth.clone().subtract(1, 'month'))}
                  aria-label="Mes anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium min-w-[140px] text-center flex items-center justify-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                  {monthLabel}
                </span>
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
          </div>
        </CardHeader>
        <CardContent className="px-2 pt-6 pb-6 @xl:px-6">
          <OwnershipDonutChart
            countsByCategory={effectiveCountsByCategory}
            effectiveConditionCounts={effectiveConditionCounts}
            workdays={effectiveWorkdays}
            drilledCategory={drilledCategory}
            selectedStatuses={selectedStatuses}
            onDrillDown={handleDrillDown}
            onToggleStatus={handleToggleStatus}
            onClearStatuses={handleClearStatuses}
          />
        </CardContent>
      </Card>

      {/* Equipos en mantenimiento por tipo (ticket 233) — autonomo, con su propio mes */}
      <MaintenanceByTypeCard />

      {/* Tarjetas de los tickets 680 y 682 — autonomas, con su propio corte
          temporal (dia / mes / trimestre / anio). Comparten la paleta que
          declara MaintenanceStatsColorVars sobre el contenedor de abajo. */}
      <div data-maintenance-stats className="grid grid-cols-1 gap-3">
        <MaintenanceStatsColorVars />
        <RequestSourceCard />
        <MaintenanceKindCard />
      </div>

      {/* 3 secciones — cada una se autoabastece via useQuery cuando esta abierta */}
      {OWNERSHIP_CATEGORIES.map((category) => (
        <div
          key={category}
          ref={(el) => {
            sectionRefs.current[category] = el;
          }}
        >
          <CategorySection
            category={category}
            monthKey={monthKey}
            totalCount={activeSummary.countsByCategory[category]}
            types={activeSummary.typesByCategory[category]}
            selectedTypeIds={typeFilters[category]}
            onTypeFilterChange={handleTypeFilterChange(category)}
            patenteFilter={patenteFilters[category]}
            onPatenteFilterChange={handlePatenteFilterChange(category)}
            selectedStatuses={selectedStatuses}
            open={openSections[category]}
            onOpenChange={handleSectionOpenChange(category)}
            daysElapsed={activeSummary.daysElapsed}
            highlightActive={drilledCategory === category}
            highlightSeq={highlightSeq}
          />
        </div>
      ))}
    </section>
  );
}
