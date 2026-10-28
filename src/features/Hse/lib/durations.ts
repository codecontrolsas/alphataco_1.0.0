/**
 * Duraciones de capacitación (módulo sin directiva: lo usan el dashboard, el portal y los PDF).
 *
 * Regla del repo: un dato que no se pudo medir es `null`, nunca 0. Un 0 inventado se lee como "no tardó nada".
 */

/** Segundos entre dos instantes; `null` si falta alguno o el orden es imposible. */
export function secondsBetween(start: Date | string | null | undefined, end: Date | string | null | undefined) {
  if (!start || !end) return null;
  const from = new Date(start).getTime();
  const to = new Date(end).getTime();
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return null;
  return Math.round((to - from) / 1000);
}

/** `3725` → `1 h 02 min`; `754` → `12 min 34 s`; `42` → `42 s`; sin medición → `Sin medición`. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return 'Sin medición';
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')} min`;
  if (minutes > 0) return `${minutes} min ${String(rest).padStart(2, '0')} s`;
  return `${rest} s`;
}
