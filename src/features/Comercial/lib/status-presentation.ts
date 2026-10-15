import type { arca_environment, certification_status, invoice_status } from '@/generated/prisma/enums';
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  FileCheck2,
  FilePen,
  FlaskConical,
  MonitorPlay,
  Receipt,
  SearchCheck,
  Send,
  XCircle,
} from 'lucide-react';
import { TONE_TO_BADGE, type StatusUi } from '../../Mantenimiento/lib/status-presentation';
import { CERTIFICATION_STATUS_LABELS } from '../Certificaciones/lib/state-machine';
import { INVOICE_STATUS_LABELS } from '../Facturacion/lib/invoice-state-machine';

/**
 * Fuente única de la presentación de estados de Comercial (etiqueta, tono e ícono).
 *
 * Módulo sin directiva: lo consumen servidor y cliente. Las etiquetas salen de las máquinas de
 * estados (`CERTIFICATION_STATUS_LABELS` / `INVOICE_STATUS_LABELS`); acá solo se decide el tono y el ícono.
 */

export { TONE_TO_BADGE };
export type { StatusUi };

/** Certificaciones (`certifications.status`). */
export const CERTIFICATION_STATUS_UI: Record<certification_status, StatusUi> = {
  borrador: { label: CERTIFICATION_STATUS_LABELS.borrador, tone: 'neutral', icon: FilePen },
  emitida: { label: CERTIFICATION_STATUS_LABELS.emitida, tone: 'info', icon: Send },
  confirmada: { label: CERTIFICATION_STATUS_LABELS.confirmada, tone: 'brand', icon: FileCheck2 },
  anulada: { label: CERTIFICATION_STATUS_LABELS.anulada, tone: 'danger', icon: Ban },
  facturada: { label: CERTIFICATION_STATUS_LABELS.facturada, tone: 'ok', icon: Receipt },
};

/** Comprobantes (`invoices.status`). */
export const INVOICE_STATUS_UI: Record<invoice_status, StatusUi> = {
  borrador: { label: INVOICE_STATUS_LABELS.borrador, tone: 'neutral', icon: FilePen },
  emitiendo: { label: INVOICE_STATUS_LABELS.emitiendo, tone: 'pending', icon: Clock },
  pendiente: { label: INVOICE_STATUS_LABELS.pendiente, tone: 'warn', icon: AlertCircle },
  rechazada: { label: INVOICE_STATUS_LABELS.rechazada, tone: 'danger', icon: XCircle },
  autorizada: { label: INVOICE_STATUS_LABELS.autorizada, tone: 'ok', icon: CheckCircle2 },
};

export type InvoiceMark = 'test' | 'simulated' | 'observations' | 'review';

/** Marcas derivadas de un comprobante (no son estados de la máquina). */
export const INVOICE_MARK_UI: Record<InvoiceMark, StatusUi> = {
  test: { label: 'Prueba (homologación)', tone: 'neutral', icon: FlaskConical },
  simulated: { label: 'Simulado', tone: 'warn', icon: MonitorPlay },
  observations: { label: 'Con observaciones', tone: 'warn', icon: AlertTriangle },
  review: { label: 'Revisar', tone: 'danger', icon: SearchCheck },
};

/** Marcas que corresponden a un comprobante según su estado, entorno y banderas. */
export function getInvoiceMarks(input: {
  status: invoice_status;
  simulated: boolean;
  environment: arca_environment;
  hasObservations?: boolean;
  needsReview?: boolean;
}): InvoiceMark[] {
  const marks: InvoiceMark[] = [];
  if (input.simulated) marks.push('simulated');
  else if (input.environment === 'homologacion') marks.push('test');
  if (input.hasObservations && input.status === 'autorizada') marks.push('observations');
  if (input.needsReview) marks.push('review');
  return marks;
}
