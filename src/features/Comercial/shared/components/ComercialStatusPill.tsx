import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { TONE_TO_BADGE, type StatusUi } from '../../lib/status-presentation';

interface ComercialStatusPillProps {
  ui: StatusUi;
  size?: 'sm' | 'md';
  className?: string;
}

/** Estado como pastilla con ícono y texto: nunca solo color. La presentación sale de `status-presentation`. */
export function ComercialStatusPill({ ui, size = 'md', className }: ComercialStatusPillProps) {
  const Icon = ui.icon;

  return (
    <Badge
      variant={TONE_TO_BADGE[ui.tone]}
      className={cn('whitespace-nowrap', size === 'sm' && 'px-2 py-0 text-[11px]', className)}
    >
      <Icon aria-hidden="true" />
      {ui.label}
    </Badge>
  );
}
