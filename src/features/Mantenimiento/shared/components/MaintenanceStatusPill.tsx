import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { TONE_TO_BADGE, getStatusUi, type StatusEntity } from '../../lib/status-presentation';

interface MaintenanceStatusPillProps {
  entity: StatusEntity;
  status: string | null;
  size?: 'sm' | 'md';
}

/** Estado como pastilla con ícono y texto: nunca solo color. La presentación sale de `status-presentation`. */
export function MaintenanceStatusPill({ entity, status, size = 'md' }: MaintenanceStatusPillProps) {
  const ui = getStatusUi(entity, status);
  const Icon = ui.icon;

  return (
    <Badge variant={TONE_TO_BADGE[ui.tone]} className={cn(size === 'sm' && 'px-2 py-0 text-[11px]')}>
      <Icon aria-hidden="true" />
      {ui.label}
    </Badge>
  );
}
