import { Badge } from '@/components/ui/badge';
import type { PurchaseOrderStatus } from '../../lib/order-state-machine';
import type { LucideIcon } from 'lucide-react';
import { ORDER_STATUS_UI, TONE_TO_BADGE } from '../../lib/status-presentation';

/** Icono por estado: lo comparten la celda, el filtro de la tabla y el detalle. */
export const purchaseOrderStatusIcons = Object.fromEntries(
  Object.entries(ORDER_STATUS_UI).map(([status, ui]) => [status, ui.icon])
) as Record<PurchaseOrderStatus, LucideIcon>;

export function PurchaseOrderStatusBadge({ status }: { status: PurchaseOrderStatus }) {
  const ui = ORDER_STATUS_UI[status];
  const Icon = ui.icon;
  return (
    <Badge variant={TONE_TO_BADGE[ui.tone]} className="gap-1 whitespace-nowrap">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {ui.label}
    </Badge>
  );
}
