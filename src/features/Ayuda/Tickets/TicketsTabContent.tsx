import { getReporterEmail } from '@/features/Ayuda/actions/getReporterEmail';
import { getMyTicketsWithUnread, getSupportTicketById } from '@/features/Ayuda/actions/support-tickets';
import { HelpCenter } from '@/features/Ayuda/components/HelpCenter';

interface Props {
  searchParams: { [key: string]: string | string[] | undefined };
}

/**
 * Tab "Tickets" de Ayuda: el Centro de Ayuda del módulo de soporte de TaskApp.
 *
 * Trae los datos acá y no en la página para que sólo se paguen cuando la sección activa es
 * Tickets: con el manual abierto no se consulta TaskApp.
 */
export async function TicketsTabContent({ searchParams }: Props) {
  const rawTicket = typeof searchParams.ticket === 'string' ? Number(searchParams.ticket) : null;
  const ticketId = rawTicket != null && Number.isFinite(rawTicket) ? rawTicket : null;

  const [initialTickets, initialTicket, reporter] = await Promise.all([
    getMyTicketsWithUnread(),
    ticketId != null ? getSupportTicketById(ticketId) : Promise.resolve(null),
    getReporterEmail(),
  ]);

  return (
    <HelpCenter
      initialTickets={initialTickets}
      initialTicket={initialTicket}
      currentUserEmail={reporter?.email ?? ''}
      currentUserName={reporter?.name ?? reporter?.email ?? 'Usuario'}
    />
  );
}
