import { TONE_TO_BADGE, type StatusUi } from '@/features/Mantenimiento/lib/status-presentation';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { DocumentSummary } from '../compliance/summary';

/**
 * Presentación del estado documental de un empleado o equipo (`employees.status` / `vehicles.status`).
 * Las claves son los identificadores del enum de Prisma. La gravedad sigue la prioridad de
 * `aggregateStatus`: faltantes o rechazados (danger) > vencidos (warn) > completo (ok).
 * `Avalado` / `No_avalado` (solo empleados) no son documentales y no pasan por acá.
 */
export const DOCUMENT_STATUS_UI = {
  Completo: { label: 'Documentación completa', tone: 'ok', icon: CheckCircle2 },
  Completo_con_doc_vencida: { label: 'Completo con doc. vencida', tone: 'warn', icon: AlertTriangle },
  Incompleto: { label: 'Documentación incompleta', tone: 'danger', icon: XCircle },
} as const satisfies Record<string, StatusUi>;

export type DocumentStatusKey = keyof typeof DOCUMENT_STATUS_UI;

export { TONE_TO_BADGE };

export function isDocumentStatusKey(value: string | null | undefined): value is DocumentStatusKey {
  return value != null && Object.hasOwn(DOCUMENT_STATUS_UI, value);
}

/** Si el estado guardado no está, se deriva de las filas con la misma prioridad que el motor. */
export function documentStatusFromSummary(summary: DocumentSummary): DocumentStatusKey | null {
  if (summary.applicable === 0) return null;
  if (summary.missing + summary.rejected > 0) return 'Incompleto';
  if (summary.overdue > 0) return 'Completo_con_doc_vencida';
  return 'Completo';
}
