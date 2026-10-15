import type { LucideIcon } from 'lucide-react';
import { WarehouseStatusBadge } from '../../components/WarehouseStatusBadge';
import type { MaterialRequestStatus } from '../../lib/request-state-machine';
import { REQUEST_STATUS_UI } from '../../lib/status-presentation';

/** Icono por estado: lo comparten la celda, el filtro de la tabla y el detalle del pedido. */
export const requestStatusIcons: Record<MaterialRequestStatus, LucideIcon> = Object.fromEntries(
  Object.entries(REQUEST_STATUS_UI).map(([status, ui]) => [status, ui.icon])
) as Record<MaterialRequestStatus, LucideIcon>;

/** Estado del pedido: delega en la presentacion unica de Almacenes (etiqueta, tono e icono). */
export function RequestStatusBadge({ status }: { status: MaterialRequestStatus }) {
  return <WarehouseStatusBadge entity="request" status={status} />;
}
