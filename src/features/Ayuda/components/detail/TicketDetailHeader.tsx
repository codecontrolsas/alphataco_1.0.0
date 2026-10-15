import { SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import type { Ticket } from '@/shared/lib/taskapp/types';
import { Clock } from 'lucide-react';
import { parseCategoryFromTitle } from '../../constants/categories';
import { TicketCategoryBadge } from '../TicketCategoryBadge';
import { TicketPriorityBadge } from '../TicketPriorityBadge';
import { TicketStatusBadge } from '../TicketStatusBadge';

interface Props {
  ticket: Ticket;
}

export function TicketDetailHeader({ ticket }: Props) {
  const { categoryLabel, cleanTitle } = parseCategoryFromTitle(ticket.title);
  return (
    <SheetHeader className="border-b p-6">
      <SheetTitle className="text-lg leading-snug">{cleanTitle}</SheetTitle>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {categoryLabel && <TicketCategoryBadge label={categoryLabel} />}
        <TicketStatusBadge slug={ticket.status?.slug} />
        <TicketPriorityBadge slug={ticket.priority} />
        {ticket.estimated_hours != null && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {ticket.estimated_hours} hs estimadas
          </span>
        )}
        <span className="text-xs text-muted-foreground">Creado {formatArgentinaDateTime(ticket.created_at)}</span>
      </div>
    </SheetHeader>
  );
}
