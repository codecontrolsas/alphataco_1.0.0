import { Badge } from '@/components/ui/badge';
import { Ban, CheckCircle2, CircleCheck, Clock, Lock, PackageCheck, XCircle, type LucideIcon } from 'lucide-react';
import { REQUEST_STATUS_LABELS } from '../../lib/labels';
import type { MaterialRequestStatus } from '../../lib/request-state-machine';

/** Icono por estado: lo comparten la celda, el filtro de la tabla y el detalle del pedido. */
export const requestStatusIcons: Record<MaterialRequestStatus, LucideIcon> = {
  PENDING_APPROVAL: Clock,
  APPROVED: CheckCircle2,
  PARTIALLY_DELIVERED: PackageCheck,
  DELIVERED: CircleCheck,
  REJECTED: XCircle,
  CLOSED: Lock,
  CANCELLED: Ban,
};

const VARIANTS: Record<MaterialRequestStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING_APPROVAL: 'secondary',
  APPROVED: 'outline',
  PARTIALLY_DELIVERED: 'outline',
  DELIVERED: 'default',
  REJECTED: 'destructive',
  CLOSED: 'secondary',
  CANCELLED: 'destructive',
};

const CLASSES: Partial<Record<MaterialRequestStatus, string>> = {
  PENDING_APPROVAL: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  PARTIALLY_DELIVERED: 'border-amber-300 text-amber-700 dark:text-amber-300',
  DELIVERED: 'bg-green-600 text-white hover:bg-green-600/90',
  CLOSED: 'text-muted-foreground',
};

export function RequestStatusBadge({ status }: { status: MaterialRequestStatus }) {
  const Icon = requestStatusIcons[status];
  return (
    <Badge variant={VARIANTS[status]} className={`gap-1 ${CLASSES[status] ?? ''}`}>
      <Icon className="h-3 w-3" />
      {REQUEST_STATUS_LABELS[status]}
    </Badge>
  );
}
