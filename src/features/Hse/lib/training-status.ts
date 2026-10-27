import type { HseAssignmentStatus } from './constants';

/**
 * Situación efectiva de un empleado frente a una capacitación. La base guarda pending | in_progress | passed | failed;
 * "vencida" es una aprobada cuya vigencia ya pasó (`validUntil` < hoy, ambos `YYYY-MM-DD` en hora argentina).
 * Módulo sin directiva: lo usan el dashboard y el portal.
 */
export function effectiveAssignmentStatus(
  status: Exclude<HseAssignmentStatus, 'expired'>,
  validUntil: string | null,
  today: string
): HseAssignmentStatus {
  if (status === 'passed' && validUntil && validUntil < today) return 'expired';
  return status;
}

/** `Decimal` de Prisma (o número) → número con hasta 2 decimales, o null. */
export function toPercent(value: { toNumber(): number } | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' ? value : value.toNumber();
}

/** `68.5` → `68,5 %` (sin ceros de más). */
export function formatPercent(value: number | null): string {
  if (value === null) return '—';
  return `${value.toLocaleString('es-AR', { maximumFractionDigits: 2 })} %`;
}
