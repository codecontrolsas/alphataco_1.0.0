import { Badge } from '@/components/ui/badge';
import { CircleAlert, CircleCheck, Clock } from 'lucide-react';
import { fitStatusLabel, type CustomerFitStatus } from '../lib/customer-fit';

const VARIANT = { ok: 'success', expiring: 'warning', blocked: 'destructive' } as const;
const ICON = { ok: CircleCheck, expiring: Clock, blocked: CircleAlert } as const;

/** Estado del recurso frente a un cliente. Ícono + texto: no depende solo del color. */
export function FitStatusBadge({ status, hasWindow = false }: { status: CustomerFitStatus; hasWindow?: boolean }) {
  const Icon = ICON[status];
  return (
    <Badge variant={VARIANT[status]}>
      <Icon aria-hidden="true" />
      {fitStatusLabel(status, hasWindow)}
    </Badge>
  );
}
