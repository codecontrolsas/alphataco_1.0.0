import { Badge } from '@/components/ui/badge';
import { RECEIPT_STATUS_UI, TONE_TO_BADGE } from '../../lib/status-presentation';

/** Estado de la recepción: Vigente o Anulada. */
export function PurchaseReceiptStatusBadge({ cancelled }: { cancelled: boolean }) {
  const ui = RECEIPT_STATUS_UI[cancelled ? 'cancelled' : 'active'];
  const Icon = ui.icon;
  return (
    <Badge variant={TONE_TO_BADGE[ui.tone]} className="gap-1 whitespace-nowrap">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {ui.label}
    </Badge>
  );
}
