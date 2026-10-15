import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { TONE_TO_BADGE, type StatusUi } from '../lib/status-presentation';

/** Estado de Tesorería como pastilla con ícono y texto: nunca solo color. */
export function TreasuryStatusBadge({ ui, className, title }: { ui: StatusUi; className?: string; title?: string }) {
  const Icon = ui.icon;
  return (
    <Badge variant={TONE_TO_BADGE[ui.tone]} className={cn('whitespace-nowrap', className)} title={title}>
      <Icon aria-hidden="true" />
      {ui.label}
    </Badge>
  );
}
