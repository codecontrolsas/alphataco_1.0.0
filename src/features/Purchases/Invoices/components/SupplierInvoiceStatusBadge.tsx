import { Badge } from '@/components/ui/badge';
import type { SupplierInvoiceStatus } from '../../lib/invoice-status';
import type { LucideIcon } from 'lucide-react';
import { INVOICE_STATUS_UI, TONE_TO_BADGE } from '../../lib/status-presentation';

/** Icono por estado: lo comparten la celda, el filtro de la tabla y el detalle. */
export const supplierInvoiceStatusIcons = Object.fromEntries(
  Object.entries(INVOICE_STATUS_UI).map(([status, ui]) => [status, ui.icon])
) as Record<SupplierInvoiceStatus, LucideIcon>;

export function SupplierInvoiceStatusBadge({ status }: { status: SupplierInvoiceStatus }) {
  const ui = INVOICE_STATUS_UI[status];
  const Icon = ui.icon;
  return (
    <Badge variant={TONE_TO_BADGE[ui.tone]} className="gap-1 whitespace-nowrap">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {ui.label}
    </Badge>
  );
}
