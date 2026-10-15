import { Badge } from '@/components/ui/badge';
import { priorityFor } from '../constants/ticket-priority';

interface Props {
  slug: string | undefined;
  showIcon?: boolean;
}

export function TicketPriorityBadge({ slug, showIcon = true }: Props) {
  const def = priorityFor(slug);
  const Icon = def.icon;
  return (
    <Badge variant={def.badgeVariant}>
      {showIcon && <Icon className={`mr-1 h-3 w-3 ${def.iconClass}`} />}
      {def.label}
    </Badge>
  );
}
