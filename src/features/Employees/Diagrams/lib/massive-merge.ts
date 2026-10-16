import type { ProcessingResult } from '../types/massive-diagram';

/**
 * Une los resultados de `process_massive_*` de una carga con varios rangos (uno por rango, ya en orden
 * cronológico) en un único resultado para la UI. Con un solo rango devuelve el mismo objeto.
 */
export function mergeProcessingResults(results: readonly ProcessingResult[]): ProcessingResult {
  const [first] = results;
  if (!first) throw new Error('La carga masiva no devolvió resultados');
  if (results.length === 1) return first;
  const last = results[results.length - 1];

  const sum = (pick: (result: ProcessingResult) => number) => results.reduce((total, r) => total + pick(r), 0);

  return {
    success: true,
    summary: {
      total_employees: first.summary.total_employees,
      processed_employees: Math.max(...results.map((r) => r.summary.processed_employees)),
      total_days: sum((r) => r.summary.total_days),
      processed_days: sum((r) => r.summary.processed_days),
      created_records: sum((r) => r.summary.created_records),
      updated_records: sum((r) => r.summary.updated_records),
      skipped_records: sum((r) => r.summary.skipped_records),
      errors_count: sum((r) => r.summary.errors_count ?? 0),
      processing_time_seconds: sum((r) => r.summary.processing_time_seconds),
      start_time: first.summary.start_time,
      end_time: last.summary.end_time,
    },
    data: {
      created: results.flatMap((r) => r.data.created),
      updated: results.flatMap((r) => r.data.updated),
    },
    details: {
      ...first.details,
      date_range: { from: first.details.date_range.from, to: last.details.date_range.to },
    },
    errors: results.flatMap((r) => r.errors),
  };
}
