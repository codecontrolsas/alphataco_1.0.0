import { TONE_TO_BADGE, type StatusUi } from '@/features/Mantenimiento/lib/status-presentation';
import { Archive, CheckCircle2, Clock, FilePen, Send, XCircle } from 'lucide-react';
import {
  HSE_ACK_STATUS_LABELS,
  HSE_DOCUMENT_STATUS_LABELS,
  type HseAckStatus,
  type HseDocumentStatus,
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
