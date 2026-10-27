import { TONE_TO_BADGE, type StatusUi } from '@/features/Mantenimiento/lib/status-presentation';
import { Archive, CalendarX2, CheckCircle2, Clock, FilePen, Hourglass, Send, TimerOff, XCircle } from 'lucide-react';
import {
  HSE_ACK_STATUS_LABELS,
  HSE_ASSIGNMENT_STATUS_LABELS,
  HSE_ATTEMPT_STATUS_LABELS,
  HSE_DOCUMENT_STATUS_LABELS,
  HSE_TRAINING_STATUS_LABELS,
  type HseAckStatus,
  type HseAssignmentStatus,
  type HseAttemptStatus,
  type HseDocumentStatus,
  type HseTrainingStatus,
} from './constants';

/** Presentación de los estados de HSE (etiqueta, tono e ícono). Nunca solo color. Módulo sin directiva. */

export { TONE_TO_BADGE };
export type { StatusUi };

export const HSE_DOCUMENT_STATUS_UI: Record<HseDocumentStatus, StatusUi> = {
  draft: { label: HSE_DOCUMENT_STATUS_LABELS.draft, tone: 'neutral', icon: FilePen },
  published: { label: HSE_DOCUMENT_STATUS_LABELS.published, tone: 'ok', icon: Send },
  archived: { label: HSE_DOCUMENT_STATUS_LABELS.archived, tone: 'neutral', icon: Archive },
};

export const HSE_ACK_STATUS_UI: Record<HseAckStatus, StatusUi> = {
  pending: { label: HSE_ACK_STATUS_LABELS.pending, tone: 'warn', icon: Clock },
  accepted: { label: HSE_ACK_STATUS_LABELS.accepted, tone: 'ok', icon: CheckCircle2 },
  rejected: { label: HSE_ACK_STATUS_LABELS.rejected, tone: 'danger', icon: XCircle },
};

export const HSE_TRAINING_STATUS_UI: Record<HseTrainingStatus, StatusUi> = {
  draft: { label: HSE_TRAINING_STATUS_LABELS.draft, tone: 'neutral', icon: FilePen },
  published: { label: HSE_TRAINING_STATUS_LABELS.published, tone: 'ok', icon: Send },
  archived: { label: HSE_TRAINING_STATUS_LABELS.archived, tone: 'neutral', icon: Archive },
};

export const HSE_ASSIGNMENT_STATUS_UI: Record<HseAssignmentStatus, StatusUi> = {
  pending: { label: HSE_ASSIGNMENT_STATUS_LABELS.pending, tone: 'warn', icon: Clock },
  in_progress: { label: HSE_ASSIGNMENT_STATUS_LABELS.in_progress, tone: 'info', icon: Hourglass },
  passed: { label: HSE_ASSIGNMENT_STATUS_LABELS.passed, tone: 'ok', icon: CheckCircle2 },
  failed: { label: HSE_ASSIGNMENT_STATUS_LABELS.failed, tone: 'danger', icon: XCircle },
  expired: { label: HSE_ASSIGNMENT_STATUS_LABELS.expired, tone: 'warn', icon: CalendarX2 },
};

export const HSE_ATTEMPT_STATUS_UI: Record<HseAttemptStatus, StatusUi> = {
  in_progress: { label: HSE_ATTEMPT_STATUS_LABELS.in_progress, tone: 'info', icon: Hourglass },
  submitted: { label: HSE_ATTEMPT_STATUS_LABELS.submitted, tone: 'neutral', icon: Send },
  expired: { label: HSE_ATTEMPT_STATUS_LABELS.expired, tone: 'warn', icon: TimerOff },
};
