import { Logger } from '@/lib/logger';
import { Suspense } from 'react';
import { DocumentStateMetricsSkeleton } from '../fallback/DocumentStateMetricsSkeleton';
import { DocumentStateMetrics, type DocumentStateCounts } from './DocumentStateMetrics';

interface DocumentStateMetricsSectionProps {
  /** Mismo `tableId` que la tabla: de ahí sale el prefijo de sus params en la URL. */
  tableId: string;
  /** Conteos por estado del mismo universo que la tabla, sin los filtros del usuario. Se piden antes de esperar la tabla. */
  counts: Promise<DocumentStateCounts>;
}

const logger = new Logger('Documentacion/DocumentStateMetricsSection');

async function Metrics({ tableId, counts }: DocumentStateMetricsSectionProps) {
  // Si el conteo falla (o no hay permiso) las tarjetas se omiten: la tabla sigue funcionando sola.
  try {
    return <DocumentStateMetrics tableId={tableId} counts={await counts} />;
  } catch (error) {
    logger.error('Error al cargar las tarjetas por estado', { data: { error } });
    return null;
  }
}

/** Server Component: resuelve las tarjetas en su propio Suspense, sin frenar la tabla. */
export function DocumentStateMetricsSection(props: DocumentStateMetricsSectionProps) {
  return (
    <Suspense fallback={<DocumentStateMetricsSkeleton />}>
      <Metrics {...props} />
    </Suspense>
  );
}
