import type { arca_environment, invoice_status } from '@/generated/prisma/enums';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import { INVOICE_MARK_UI, INVOICE_STATUS_UI, getInvoiceMarks } from '../../lib/status-presentation';
import { ComercialStatusPill } from '../../shared/components/ComercialStatusPill';

/** Mismos iconos que el filtro de Estado del listado (`list/columns.tsx`): un estado, un icono. */
export const INVOICE_STATUS_ICONS: Record<invoice_status, LucideIcon> = {
  borrador: INVOICE_STATUS_UI.borrador.icon,
  emitiendo: INVOICE_STATUS_UI.emitiendo.icon,
  pendiente: INVOICE_STATUS_UI.pendiente.icon,
  rechazada: INVOICE_STATUS_UI.rechazada.icon,
  autorizada: INVOICE_STATUS_UI.autorizada.icon,
};

type Props = {
  status: invoice_status;
  simulated: boolean;
  environment: arca_environment;
  /** Autorizada con observaciones de ARCA (no es un rechazo). */
  hasObservations?: boolean;
  /** Quedó marcada para revisar a mano (`needs_review`). */
  needsReview?: boolean;
  className?: string;
};

/**
 * Badge del estado + marcas "Simulado" / "Prueba (homologación)" / "Con observaciones" / "Revisar".
 * Ícono + texto siempre: el estado nunca depende solo del color.
 */
export function InvoiceStatusBadge({ status, simulated, environment, hasObservations, needsReview, className }: Props) {
  const marks = getInvoiceMarks({ status, simulated, environment, hasObservations, needsReview });

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      <ComercialStatusPill ui={INVOICE_STATUS_UI[status]} />
      {marks.map((mark) => (
        <ComercialStatusPill key={mark} ui={INVOICE_MARK_UI[mark]} className="font-normal" />
      ))}
    </span>
  );
}
