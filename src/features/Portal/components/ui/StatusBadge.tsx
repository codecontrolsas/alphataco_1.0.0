import { Badge } from '@/components/ui/badge';
import { TONE_TO_BADGE, type StatusUi } from '@/features/Mantenimiento/lib/status-presentation';
import { cn } from '@/lib/utils';

/**
 * Estado como pastilla con ícono y texto (nunca solo color). Recibe un `StatusUi` (etiqueta, tono e ícono), el mismo
 * formato de los mapas de estados del sistema (`HSE_*_STATUS_UI`, mantenimiento…): una sección nueva del portal arma su
 * mapa y reusa este componente.
 */
export function StatusBadge({ ui, className }: { ui: StatusUi; className?: string }) {
  const Icon = ui.icon;
  return (
    <Badge variant={TONE_TO_BADGE[ui.tone]} className={cn('whitespace-nowrap', className)}>
      <Icon aria-hidden="true" />
      {ui.label}
    </Badge>
  );
}
