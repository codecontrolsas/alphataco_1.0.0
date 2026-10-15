import type { ThresholdLevel } from '@/features/Dashboard/lib/chart-thresholds';

/** Porcentaje de ausentismo esperado: por encima es rojo; desde WARNING hasta el esperado es ámbar. */
export const EXPECTED_ABSENTEEISM_PERCENTAGE = 5;
export const WARNING_ABSENTEEISM_PERCENTAGE = 4;

/** Nivel de un % de ausentismo; sin dato es neutro (nunca verde). */
export function absenceLevel(percentage: number | null | undefined): ThresholdLevel {
  if (percentage == null || !Number.isFinite(percentage)) return 'neutral';
  if (percentage > EXPECTED_ABSENTEEISM_PERCENTAGE) return 'danger';
  if (percentage >= WARNING_ABSENTEEISM_PERCENTAGE) return 'warn';
  return 'ok';
}

// Clases escritas completas: Tailwind v4 no genera clases armadas en runtime.
export const ABSENCE_BADGE_CLASS: Record<ThresholdLevel, string> = {
  ok: 'bg-[var(--dash-ok,#52a27a)]/15 text-[var(--dash-ok,#52a27a)]',
  warn: 'bg-[var(--dash-warn,#a06b01)]/15 text-[var(--dash-warn,#a06b01)]',
  danger: 'bg-[var(--dash-danger,#843b3e)]/15 text-[var(--dash-danger,#843b3e)]',
  neutral: 'bg-muted text-muted-foreground',
};

/** `3.57 %` o «—» cuando no hay dato. */
export function formatAbsencePercent(percentage: number | null | undefined): string {
  return percentage == null || !Number.isFinite(percentage) ? '—' : `${percentage.toFixed(2)} %`;
}
