import { Badge } from '@/components/ui/badge';
import type { payment_order_status } from '@/generated/prisma/enums';
import type { LucideIcon } from 'lucide-react';
import { PAYMENT_ORDER_STATUS_UI, TONE_TO_BADGE } from '../../lib/status-presentation';

/** Icono por estado: lo comparten la celda, el filtro de la tabla y el detalle. */
export const paymentOrderStatusIcons = Object.fromEntries(
  Object.entries(PAYMENT_ORDER_STATUS_UI).map(([status, ui]) => [status, ui.icon])
) as Record<payment_order_status, LucideIcon>;

export function PaymentOrderStatusBadge({ status }: { status: payment_order_status }) {
  const ui = PAYMENT_ORDER_STATUS_UI[status];
  const Icon = ui.icon;
  return (
    <Badge variant={TONE_TO_BADGE[ui.tone]} className="gap-1 whitespace-nowrap">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {ui.label}
    </Badge>
  );
}
