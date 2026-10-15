import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { TONE_TO_BADGE, WAREHOUSE_STATUS_UI, type StatusUi } from '../lib/status-presentation';

type Entity = keyof typeof WAREHOUSE_STATUS_UI;

type WarehouseStatusBadgeProps = {
  [E in Entity]: {
    entity: E;
    status: keyof (typeof WAREHOUSE_STATUS_UI)[E];
    size?: 'sm' | 'md';
    className?: string;
  };
}[Entity];

/** Estado de una entidad de Almacenes como pastilla con ícono y texto: nunca solo color. */
export function WarehouseStatusBadge({ entity, status, size = 'md', className }: WarehouseStatusBadgeProps) {
  const table: Record<string, StatusUi> = WAREHOUSE_STATUS_UI[entity];
  const ui = table[status as string];
  if (!ui) return null;
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
