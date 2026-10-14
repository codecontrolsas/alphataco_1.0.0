import type { ComplianceStatus, StatusTypeValue } from './types';

/**
 * Agregado de un recurso. Prioridad: algún faltante o rechazado → INCOMPLETO; si no, algún
 * vencido → VENCIDO; si no COMPLETO. Sin obligatorios → SIN_REQUISITOS.
 */
export function aggregateStatus(counts: {
  mandatoryTotal: number;
  missingOrRejected: number;
  expired: number;
}): ComplianceStatus {
  if (counts.mandatoryTotal === 0) return 'SIN_REQUISITOS';
  if (counts.missingOrRejected > 0) return 'INCOMPLETO';
  if (counts.expired > 0) return 'VENCIDO';
  return 'COMPLETO';
}

/** Valor del enum `status_type` que se guarda en `employees.status` / `vehicles.status`. */
export function toStatusType(status: ComplianceStatus): StatusTypeValue {
  switch (status) {
    case 'COMPLETO':
    case 'SIN_REQUISITOS':
      return 'Completo';
    case 'VENCIDO':
      return 'Completo con doc vencida';
    case 'INCOMPLETO':
      return 'Incompleto';
  }
}
