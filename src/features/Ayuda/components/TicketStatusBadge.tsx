import { Badge } from '@/components/ui/badge';
import { statusFor } from '../constants/ticket-status';

interface Props {
  slug: string | undefined;
}

export function TicketStatusBadge({ slug }: Props) {
  const def = statusFor(slug);
  return <Badge variant={def.badgeVariant}>{def.label}</Badge>;
}
