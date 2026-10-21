import type { ProgressSegment } from '@/features/Operaciones/shared/components/SegmentedProgress';

/**
 * Resumen de líneas por estado y avance de un parte. Puro: lo comparten la lista (conteos que
 * trae el servidor) y el detalle (facet `status` sin filtros), para que la fórmula viva en un solo lugar.
 */
export interface StatusSummary {
  total: number;
  pending: number;
  withoutResources: number;
  executed: number;
  certification: number;
  rescheduled: number;
  cancelled: number;
  /** Líneas que cuentan para el avance: ejecutadas + en certificación. */
  progressDone: number;
  /** Líneas que se deben ejecutar: total − canceladas − reprogramadas. */
  progressTotal: number;
  /** Avance en porcentaje entero (0 si no hay líneas por ejecutar). */
  percent: number;
}

/**
 * Arma el resumen en UNA pasada sobre los pares `[estado, cantidad]`.
 * Avance = (ejecutado + en_certificacion) / (total − cancelado − reprogramado).
 */
export function summarizeStatusCountMap(counts: Iterable<readonly [string, number]> | undefined): StatusSummary {
  let total = 0;
  let pending = 0;
  let withoutResources = 0;
  let executed = 0;
  let certification = 0;
  let rescheduled = 0;
  let cancelled = 0;

  if (counts) {
    for (const [status, count] of counts) {
      total += count;
      switch (status) {
        case 'pendiente':
          pending += count;
          break;
        case 'sin_recursos_asignados':
          withoutResources += count;
          break;
        case 'ejecutado':
          executed += count;
          break;
        case 'en_certificacion':
          certification += count;
          break;
        case 'reprogramado':
          rescheduled += count;
          break;
        case 'cancelado':
          cancelled += count;
          break;
      }
    }
  }

  const progressDone = executed + certification;
  const progressTotal = total - cancelled - rescheduled;

  return {
    total,
    pending,
    withoutResources,
    executed,
    certification,
    rescheduled,
    cancelled,
    progressDone,
    progressTotal,
    percent: progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : 0,
  };
}

/** Clases escritas completas: Tailwind no genera las que se arman en runtime. */
const SEGMENT_CLASSES = {
  executed: 'bg-ok',
  certification: 'bg-cert',
  rescheduled: 'bg-brand',
  pending: 'bg-warn',
  withoutResources: 'bg-danger',
  cancelled: 'bg-pending',
} as const;

/**
 * Segmentos de la barra de avance.
 * - `all` (detalle): los seis estados, sobre el total de líneas.
 * - `executable` (lista): sin canceladas ni reprogramadas, para usar `progressTotal` como total.
 */
export function buildProgressSegments(summary: StatusSummary, scope: 'all' | 'executable' = 'all'): ProgressSegment[] {
  const segments: ProgressSegment[] = [
    { key: 'executed', label: 'Ejecutadas', value: summary.executed, className: SEGMENT_CLASSES.executed },
    { key: 'certification', label: 'En certificación', value: summary.certification, className: SEGMENT_CLASSES.certification },
  ];
  if (scope === 'all') {
    segments.push({ key: 'rescheduled', label: 'Reprogramadas', value: summary.rescheduled, className: SEGMENT_CLASSES.rescheduled });
  }
  segments.push(
    { key: 'pending', label: 'Pendientes', value: summary.pending, className: SEGMENT_CLASSES.pending },
    { key: 'withoutResources', label: 'Sin recursos', value: summary.withoutResources, className: SEGMENT_CLASSES.withoutResources }
  );
  if (scope === 'all') {
    segments.push({ key: 'cancelled', label: 'Canceladas', value: summary.cancelled, className: SEGMENT_CLASSES.cancelled });
  }
  return segments;
}
