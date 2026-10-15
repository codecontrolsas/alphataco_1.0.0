import { LEVEL_TEXT_CLASS, percentLevel, type ThresholdLevel } from '@/features/Dashboard/lib/chart-thresholds';
import { NO_DATA_LABEL, formatPercentOrDash } from '@/features/Dashboard/lib/metric';
import { MetricCard } from '@/shared/components/common/MetricCard';
import { Suspense, cache, type ReactNode } from 'react';
import { getChecklistMissingIndicator } from '../actions/checklists.server';
import { getActiveEmployeesKpi, getFleetKpis, getTodayServicesKpi } from '../actions/kpis.server';
import { KpiCardSkeleton } from '../fallback/KpiCardsSkeleton';
import { InfoTip } from '../shared/InfoTip';
import { ChecklistMissingCard } from './ChecklistMissingCard';

/** Las tres tarjetas de flota comparten una sola lectura por request. */
const loadFleetKpis = cache(() => getFleetKpis());

const LEVEL_WORD: Record<ThresholdLevel, string> = {
  ok: 'nivel alto (75 % o más)',
  warn: 'nivel medio (50 % a 74 %)',
  danger: 'nivel bajo (menos de 50 %)',
  neutral: 'sin flota para medir',
};

const formatCount = (value: number) => value.toLocaleString('es-AR');

interface KpiCardProps {
  label: string;
  value: ReactNode;
  hint: ReactNode;
  info: ReactNode;
}

/** Tarjeta de KPI: rótulo con su explicación accesible por teclado, valor y línea de apoyo. */
function KpiCard({ label, value, hint, info }: KpiCardProps) {
  return (
    <MetricCard
      label={
        <span className="inline-flex items-center gap-1">
          {label}
          <InfoTip label={`Cómo se calcula «${label}»`}>{info}</InfoTip>
        </span>
      }
      value={value}
      hint={hint}
    />
  );
}

/** Tarjeta cuando no se pudo calcular: «—» y un aviso, nunca un 0 ni un color de semáforo. */
function KpiCardError({ label }: { label: string }) {
  return (
    <MetricCard
      label={label}
      value={NO_DATA_LABEL}
      hint={<span role="alert">No se pudo calcular. Recargá la página.</span>}
    />
  );
}

async function EmployeesCard() {
  try {
    const { activeEmployees } = await getActiveEmployeesKpi();
    return (
      <KpiCard
        label="Empleados"
        value={formatCount(activeEmployees)}
        hint="empleados activos"
        info="Empleados activos de la empresa, tengan o no diagrama de trabajo hoy."
      />
    );
  } catch {
    return <KpiCardError label="Empleados" />;
  }
}

async function ActiveVehiclesCard() {
  try {
    const { activeVehicles } = await loadFleetKpis();
    return (
      <KpiCard
        label="Equipos activos"
        value={formatCount(activeVehicles)}
        hint="toda la flota activa"
        info="Todos los equipos activos de la empresa, estén operativos o fuera de servicio. Es la flota total que usa Operatividad."
      />
    );
  } catch {
    return <KpiCardError label="Equipos activos" />;
  }
}

async function OperativeFleetCard() {
  try {
    const { activeVehicles, fleetMinusRepair } = await loadFleetKpis();
    const outOfService = activeVehicles - fleetMinusRepair;
    return (
      <KpiCard
        label="Flota operativa"
        value={formatCount(fleetMinusRepair)}
        hint="activos − fuera de servicio"
        info={`Equipos activos menos los fuera de servicio (no operativo, en reparación o en preparación): ${formatCount(activeVehicles)} − ${formatCount(outOfService)}.`}
      />
    );
  } catch {
    return <KpiCardError label="Flota operativa" />;
  }
}

async function TodayServicesCard() {
  try {
    const { totalServices } = await getTodayServicesKpi();
    return (
      <KpiCard
        label="Servicios del día"
        value={formatCount(totalServices)}
        hint="partes pendientes o ejecutados"
        info="Servicios cargados en el parte de hoy (hora argentina) con estado pendiente o ejecutado, de cualquier tipo, con o sin cliente. La tabla por tipo y el gráfico por cliente de la sección «Servicios del Día» cuentan un subconjunto."
      />
    );
  } catch {
    return <KpiCardError label="Servicios del día" />;
  }
}

async function OperativityCard() {
  try {
    const { operativityPercentage, operativeVehicles, totalFleet } = await loadFleetKpis();
    const level = percentLevel(operativityPercentage);
    return (
      <KpiCard
        label="Operatividad"
        value={<span className={LEVEL_TEXT_CLASS[level]}>{formatPercentOrDash(operativityPercentage)}</span>}
        hint={`operativos / flota total · ${LEVEL_WORD[level]}`}
        info={`(Equipos operativos / Flota total) × 100 = (${formatCount(operativeVehicles)} / ${formatCount(totalFleet)}) × 100. La flota total son todos los equipos activos.`}
      />
    );
  } catch {
    return <KpiCardError label="Operatividad" />;
  }
}

async function ChecklistMissingKpi() {
  try {
    const { historicalCount, monthCount } = await getChecklistMissingIndicator();
    return <ChecklistMissingCard historicalCount={historicalCount} monthCount={monthCount} />;
  } catch {
    return <KpiCardError label="Equipos sin checklist" />;
  }
}

/** Fila de KPIs: cada tarjeta carga y falla por su cuenta (su propio `<Suspense>`). */
export function KpiCardsRow() {
  return (
    <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <Suspense fallback={<KpiCardSkeleton />}>
        <EmployeesCard />
      </Suspense>
      <Suspense fallback={<KpiCardSkeleton />}>
        <ActiveVehiclesCard />
      </Suspense>
      <Suspense fallback={<KpiCardSkeleton />}>
        <OperativeFleetCard />
      </Suspense>
      <Suspense fallback={<KpiCardSkeleton />}>
        <TodayServicesCard />
      </Suspense>
      <Suspense fallback={<KpiCardSkeleton />}>
        <OperativityCard />
      </Suspense>
      <Suspense fallback={<KpiCardSkeleton />}>
        <ChecklistMissingKpi />
      </Suspense>
    </div>
  );
}
