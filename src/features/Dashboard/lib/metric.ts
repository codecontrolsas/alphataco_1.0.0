/** Texto que se muestra cuando una métrica no se puede calcular (no es lo mismo que 0 %). */
export const NO_DATA_LABEL = '—';

/**
 * Porcentaje entero, o `null` si no hay dato medible (denominador 0 o dato ausente / no finito).
 * `null` significa "no hay medición"; 0 significa "medí y dio cero". Distinto de `percentage` de
 * `Principal/lib/indicators.ts`, que devuelve 0 y por eso lee como buena o mala noticia inventada.
 */
export function percentageOrNull(
  numerator: number | null | undefined,
  denominator: number | null | undefined
): number | null {
  if (numerator == null || denominator == null) return null;
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return Math.round((numerator / denominator) * 100);
}

/** `42 %` o «—» cuando no hay dato. */
export function formatPercentOrDash(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? NO_DATA_LABEL : `${value} %`;
}
