import { Badge } from '@/components/ui/badge';
import { getTireServiceOrderStatusUi, getTireStatusUi, toBadgeVariant } from './tire-status-presentation';

/** Estado de una cubierta como pastilla con ícono y texto (nunca solo color). */
export function TireStatusPill({ status }: { status: string | null }) {
  const ui = getTireStatusUi(status);
  const Icon = ui.icon;
  return (
    <Badge variant={toBadgeVariant(ui.tone)}>
      <Icon aria-hidden="true" />
      {ui.label}
    </Badge>
  );
}

/** Estado de una orden de gomería como pastilla con ícono y texto. */
export function TireServiceOrderStatusPill({ status }: { status: string | null }) {
  const ui = getTireServiceOrderStatusUi(status);
  const Icon = ui.icon;
  return (
    <Badge variant={toBadgeVariant(ui.tone)}>
      <Icon aria-hidden="true" />
      {ui.label}
    </Badge>
  );
}
