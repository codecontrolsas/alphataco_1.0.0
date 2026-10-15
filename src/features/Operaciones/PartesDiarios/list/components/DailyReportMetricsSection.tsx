import { Suspense } from 'react';
import type { DailyReportAttentionCounts, DailyReportFacets } from '../actions.server';
import { DailyReportMetricsSkeleton } from '../fallback/DailyReportMetricsSkeleton';
import { DailyReportMetrics } from './DailyReportMetrics';

interface DailyReportMetricsSectionProps {
  paramNamespace: string;
  /** Filtro `status` con el que se renderizó el servidor. */
  serverStatus: string | null;
  /** Conteos por estado del parte (sin filtros del usuario). Se piden antes de esperar la tabla. */
  facets: Promise<DailyReportFacets>;
  /** Conteos de partes con líneas pendientes / sin recursos. */
  attention: Promise<DailyReportAttentionCounts>;
}

async function Metrics({ paramNamespace, serverStatus, facets, attention }: DailyReportMetricsSectionProps) {
  const [statusFacets, attentionCounts] = await Promise.all([facets, attention]);

  const statusCounts = statusFacets?.status;
  let closed: number | null = null;
  if (statusCounts) {
    closed = 0;
    for (const [status, count] of statusCounts) {
      if (status.startsWith('cerrado')) closed += count;
    }
  }

  return (
    <DailyReportMetrics
      paramNamespace={paramNamespace}
      serverStatus={serverStatus}
      open={statusCounts ? (statusCounts.get('abierto') ?? 0) : null}
      closed={closed}
      withPending={attentionCounts?.withPending ?? null}
      withoutResources={attentionCounts?.withoutResources ?? null}
    />
  );
}

/** Server Component: resuelve las tarjetas en su propio Suspense, sin frenar la tabla. */
export function DailyReportMetricsSection(props: DailyReportMetricsSectionProps) {
  return (
    <Suspense fallback={<DailyReportMetricsSkeleton />}>
      <Metrics {...props} />
    </Suspense>
  );
}
