import { Badge } from '@/components/ui/badge';
import type { certification_status } from '@/generated/prisma/enums';
import { CERTIFICATION_STATUS_LABELS } from '../lib/state-machine';

/**
 * Colores por estado. Clases escritas completas: Tailwind v4 escanea el código como texto
 * plano y una clase armada por concatenación no se genera.
 */
const STYLES: Record<certification_status, string> = {
  borrador: 'bg-muted text-muted-foreground',
  emitida: 'bg-brand/10 text-brand-ink border-brand/30',
  confirmada: 'bg-brand text-brand-foreground',
  anulada: 'bg-destructive/10 text-destructive border-destructive/30',
  // Contorno de marca sin relleno: se distingue de Confirmada (relleno) y de Emitida (brand/10).
  facturada: 'border-brand text-brand-ink',
};

export function CertificationStatusBadge({ status }: { status: certification_status }) {
  return (
    <Badge variant="outline" className={STYLES[status]}>
      {CERTIFICATION_STATUS_LABELS[status]}
    </Badge>
  );
}
