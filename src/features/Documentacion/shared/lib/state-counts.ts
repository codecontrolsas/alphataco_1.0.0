import type { DocumentStateCounts } from '@/features/Documentacion/shared/components/DocumentStateMetrics';

const STATE_KEYS: Record<keyof DocumentStateCounts, true> = {
  aprobado: true,
  presentado: true,
  pendiente: true,
  vencido: true,
  rechazado: true,
};

/**
 * Conteos por estado para las tarjetas, sacados de las MISMAS filas calculadas de la lista (sin los
 * filtros del usuario). `pendiente` cuenta las filas faltantes ("Faltantes" en la UI). Las filas
 * "ya no aplica" (sólo existen en la ficha de un recurso) no cuentan.
 */
export function countRowStates(
  rows: ReadonlyArray<{ state: string | null; notApplicable?: boolean }>
): DocumentStateCounts {
  const counts: DocumentStateCounts = {};
  for (const row of rows) {
    if (row.notApplicable || !row.state || !(row.state in STATE_KEYS)) continue;
    const key = row.state as keyof DocumentStateCounts;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
