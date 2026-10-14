import { Suspense } from 'react';
import { DocumentStateMetricsSkeleton } from '../fallback/DocumentStateMetricsSkeleton';
import { DocumentStateMetrics, type DocumentStateCounts } from './DocumentStateMetrics';

interface DocumentStateMetricsSectionProps {
  /** Mismo `tableId` que la tabla: de ahí sale el prefijo de sus params en la URL. */
  tableId: string;
  /** Conteos por estado del mismo universo que la tabla, sin los filtros del usuario. Se piden antes de esperar la tabla. */
  counts: Promise<DocumentStateCounts>;
}

async function Metrics({ tableId, counts }: DocumentStateMetricsSectionProps) {
  return <DocumentStateMetrics tableId={tableId} counts={await counts} />;
}

/** Server Component: resuelve las tarjetas en su propio Suspense, sin frenar la tabla. */
export function DocumentStateMetricsSection(props: DocumentStateMetricsSectionProps) {
  return (
    <Suspense fallback={<DocumentStateMetricsSkeleton />}>
      <Metrics {...props} />
    </Suspense>
  );
}
