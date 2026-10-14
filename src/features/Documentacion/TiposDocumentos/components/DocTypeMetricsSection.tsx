import { MetricCard } from '@/shared/components/common/MetricCard';
import { Suspense } from 'react';
import { getDocTypeMetrics } from '../actions/metrics.server';
import { DocTypeMetricsSkeleton } from '../fallback/DocTypeMetricsSkeleton';

async function Metrics({ metrics: pending }: { metrics: ReturnType<typeof getDocTypeMetrics> }) {
  const metrics = await pending;

  // Informativas, sin filtro asociado: las tarjetas no son clickeables.
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4" role="group" aria-label="Resumen de tipos de documento">
      <MetricCard label="Tipos activos" value={metrics.active} hint="En uso hoy" tone="ok" />
      <MetricCard label="Obligatorios" value={metrics.mandatory} hint="Se exigen a todos los que aplican" />
      <MetricCard label="Con condiciones" value={metrics.conditional} hint="Solo para algunos recursos" tone="brand" />
      <MetricCard label="Mensuales" value={metrics.monthly} hint="Se renuevan cada mes" />
    </div>
  );
}

/** Server Component: resuelve las tarjetas en su propio Suspense, sin frenar la tabla. */
export function DocTypeMetricsSection({ metrics }: { metrics: ReturnType<typeof getDocTypeMetrics> }) {
  return (
    <Suspense fallback={<DocTypeMetricsSkeleton />}>
      <Metrics metrics={metrics} />
    </Suspense>
  );
}
