import { Badge } from '@/components/ui/badge';
import { ACTIVE_STATUS_UI, TONE_TO_BADGE, UNASSIGNED_STATUS_UI } from '../lib/active-status';

/** Pastilla de estado activo/inactivo (nunca solo color: lleva ícono y texto). */
export function ActiveStatusBadge({ value }: { value: boolean | null | undefined }) {
  const ui = value === null || value === undefined ? UNASSIGNED_STATUS_UI : ACTIVE_STATUS_UI[value ? 'true' : 'false'];
  const Icon = ui.icon;

  return (
    <Badge variant={TONE_TO_BADGE[ui.tone]} className="gap-1">
      <Icon className="size-3" aria-hidden="true" />
      {ui.label}
    </Badge>
  );
}

/** Pastilla sí/no con etiquetas propias (ícono + texto), con el mismo tono e íconos que el estado activo. */
export function BooleanBadge({
  value,
  trueLabel,
  falseLabel,
}: {
  value: boolean;
  trueLabel: string;
  falseLabel: string;
}) {
  const ui = ACTIVE_STATUS_UI[value ? 'true' : 'false'];
  const Icon = ui.icon;

  return (
    <Badge variant={TONE_TO_BADGE[ui.tone]} className="gap-1">
      <Icon className="size-3" aria-hidden="true" />
      {value ? trueLabel : falseLabel}
    </Badge>
  );
}
