/**
 * Umbrales y semáforo del dashboard.
 *
 * Los colores son tokens (`--dash-ok`, `--dash-warn`, `--dash-danger`, `--dash-neutral`) declarados por
 * `shared/charts/ChartColorVars` en un ancestro común; el fallback del `var()` es el valor claro para
 * que un gráfico fuera de ese ancestro no quede sin color. Un valor ausente es neutro, nunca verde.
 */

/** Umbrales únicos (%) de operatividad: >= success verde, >= warning ámbar, el resto rojo. */
export const SUCCESS_THRESHOLD = 75;
export const WARNING_THRESHOLD = 50;
export const DEFAULT_GAUGE_THRESHOLDS = { success: SUCCESS_THRESHOLD, warning: WARNING_THRESHOLD } as const;

export type ThresholdLevel = 'ok' | 'warn' | 'danger' | 'neutral';

/** Nivel de un porcentaje; `null`/`undefined`/no finito es neutro. */
export function percentLevel(
  value: number | null | undefined,
  thresholds: { success: number; warning: number } = DEFAULT_GAUGE_THRESHOLDS
): ThresholdLevel {
  if (value == null || !Number.isFinite(value)) return 'neutral';
  if (value >= thresholds.success) return 'ok';
  if (value >= thresholds.warning) return 'warn';
  return 'danger';
}

// Clases escritas completas: Tailwind v4 no genera clases armadas en runtime.
export const LEVEL_TEXT_CLASS: Record<ThresholdLevel, string> = {
  ok: 'text-[var(--dash-ok,#52a27a)]',
  warn: 'text-[var(--dash-warn,#a06b01)]',
  danger: 'text-[var(--dash-danger,#843b3e)]',
  neutral: 'text-muted-foreground',
};

/** Rojo: el valor superó el umbral esperado. */
export const THRESHOLD_DOT_ABOVE_COLOR = 'var(--dash-danger, #843b3e)';
/** Verde: el valor está dentro de lo esperado (incluye el umbral exacto). */
export const THRESHOLD_DOT_WITHIN_COLOR = 'var(--dash-ok, #52a27a)';
/** Neutro: no hay valor medido. */
export const THRESHOLD_DOT_NEUTRAL_COLOR = 'var(--dash-neutral, var(--muted-foreground))';

/**
 * `true` sólo si `value` es un número finito MAYOR que el umbral.
 * Un valor ausente o no numérico no está por encima.
 */
export function isAboveThreshold(value: unknown, threshold: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > threshold;
}

/** Color del punto según el umbral; sin valor numérico, neutro. */
export function thresholdDotColor(value: unknown, threshold: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return THRESHOLD_DOT_NEUTRAL_COLOR;
  return isAboveThreshold(value, threshold) ? THRESHOLD_DOT_ABOVE_COLOR : THRESHOLD_DOT_WITHIN_COLOR;
}
