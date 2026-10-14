import type { DocumentStateCounts } from '@/features/Documentacion/shared/components/DocumentStateMetrics';

/** Convierte el resultado de un `groupBy(['state'])` en los conteos que consumen las tarjetas por estado. */
export function toDocumentStateCounts(rows: { state: string | null; _count: { _all: number } }[]): DocumentStateCounts {
  const counts: DocumentStateCounts = {};
  for (const row of rows) {
    if (row.state && row.state in STATE_KEYS) counts[row.state as keyof DocumentStateCounts] = row._count._all;
  }
  return counts;
}

const STATE_KEYS: Record<keyof DocumentStateCounts, true> = {
  aprobado: true,
  presentado: true,
  pendiente: true,
  vencido: true,
  rechazado: true,
};
