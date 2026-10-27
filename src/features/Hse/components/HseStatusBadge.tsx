import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { TONE_TO_BADGE, type StatusUi } from '../lib/status-presentation';

/** Estado de HSE como pastilla con ícono y texto. */
export function HseStatusBadge({ ui, className }: { ui: StatusUi; className?: string }) {
  const Icon = ui.icon;
  return (
    <Badge variant={TONE_TO_BADGE[ui.tone]} className={cn('whitespace-nowrap', className)}>
      <Icon aria-hidden="true" />
      {ui.label}
    </Badge>
  );
}
