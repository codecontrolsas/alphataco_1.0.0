import { daysUntil } from '@/features/Documentacion/shared/compliance/dates';
import { EXPIRING_SOON_DAYS } from '@/features/Documentacion/shared/lib/document-expiry';
import type { HseAssignmentStatus } from '@/features/Hse/lib/constants';
import type { Tone } from '../lib/labels';

/**
 * Situación de una persona frente a una capacitación, UNA sola clasificación para el legajo (`trainings` del empleado)
 * y para la capacitación (`/trainings/{id}/people`): la misma persona muestra el mismo estado en las dos pantallas.
 * `result` es el estado efectivo de la web (`effectiveAssignmentStatus`: «vencida» = aprobada con la vigencia pasada).
 * «Por vencer» = vence dentro de `EXPIRING_SOON_DAYS` (30) días, igual que los documentos.
 */
export const TRAINING_STATUS = {
  valid: { code: 'valid', label: 'Vigente', tone: 'ok' as Tone },
  expiring: { code: 'expiring', label: 'Por vencer', tone: 'warn' as Tone },
  expired: { code: 'expired', label: 'Vencida', tone: 'danger' as Tone },
  pending: { code: 'pending', label: 'Pendiente', tone: 'neutral' as Tone },
};

export type TrainingStatusCode = keyof typeof TRAINING_STATUS;

export function trainingStatusOf(result: HseAssignmentStatus, validUntil: string | null, today: string) {
  if (result === 'expired') return TRAINING_STATUS.expired;
  if (result === 'passed') {
    return validUntil && daysUntil(validUntil, today) <= EXPIRING_SOON_DAYS
      ? TRAINING_STATUS.expiring
      : TRAINING_STATUS.valid;
  }
  return TRAINING_STATUS.pending;
}
