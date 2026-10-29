import { secondsBetween } from './durations';

/**
 * Tiempo de estudio y de examen de un empleado en una capacitación (reporte de tiempos). Módulo sin directiva.
 *
 * - ESTUDIO: por material, de la primera apertura (`first_opened_at`) al "Ya lo leí" (`read_at`). Se suma el de los
 *   materiales que tienen las dos marcas; los demás (anteriores al registro de aperturas, o abiertos sin marcar como
 *   leídos) cuentan como "sin medición", NUNCA como 0. Cada material se acota a `STUDY_CAP_SECONDS`: una pestaña
 *   abierta de un día para el otro no es tiempo de estudio.
 * - EXAMEN: de cada intento cerrado, `submitted_at − started_at`. Un intento vencido se cierra con
 *   `submitted_at = deadline_at` (lo fija la base), así que el job que lo corrige horas después no lo infla.
 */

/** Tope de tiempo de estudio por material: 4 horas. */
export const STUDY_CAP_SECONDS = 4 * 60 * 60;

export interface MaterialMarks {
  firstOpenedAt: Date | string | null;
  readAt: Date | string | null;
}

export interface StudySummary {
  /** Suma de los materiales medidos; `null` si no se pudo medir ninguno. */
  seconds: number | null;
  /** Materiales con las dos marcas (apertura y lectura) y orden válido. */
  measured: number;
  /** Materiales de la capacitación. */
  total: number;
}

export function summarizeStudy(materials: readonly MaterialMarks[], total: number): StudySummary {
  let seconds = 0;
  let measured = 0;
  for (const material of materials) {
    const spent = secondsBetween(material.firstOpenedAt, material.readAt);
    if (spent === null) continue;
    seconds += Math.min(spent, STUDY_CAP_SECONDS);
    measured += 1;
  }
  return { seconds: measured > 0 ? seconds : null, measured, total };
}

export interface AttemptMarks {
  number: number;
  startedAt: Date | string;
  submittedAt: Date | string | null;
}

export interface ExamSummary {
  /** Intentos cerrados con duración medible. */
  attempts: number;
  /** Duración del último intento cerrado (mayor número); `null` si no hay. */
  lastSeconds: number | null;
  /** Suma de todos los intentos cerrados; `null` si no hay ninguno medible. */
  totalSeconds: number | null;
}

/** Recibe solo intentos CERRADOS (enviados o vencidos). */
export function summarizeExam(attempts: readonly AttemptMarks[]): ExamSummary {
  const measured = attempts
    .map((a) => ({ number: a.number, seconds: secondsBetween(a.startedAt, a.submittedAt) }))
    .filter((a): a is { number: number; seconds: number } => a.seconds !== null)
    .sort((x, y) => x.number - y.number);
  if (measured.length === 0) return { attempts: 0, lastSeconds: null, totalSeconds: null };
  return {
    attempts: measured.length,
    lastSeconds: measured[measured.length - 1]?.seconds ?? null,
    totalSeconds: measured.reduce((sum, a) => sum + a.seconds, 0),
  };
}
