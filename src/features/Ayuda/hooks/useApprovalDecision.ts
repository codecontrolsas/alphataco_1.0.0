'use client';

import type { Ticket } from '@/shared/lib/taskapp/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MY_TICKETS_PAGE_QUERY_KEY, MY_TICKETS_QUERY_KEY } from './queryKeys';
import { APPROVER_TICKETS_QUERY_KEY } from './useApproverTickets';
import { ticketDetailKey } from './useTicketDetail';

/** Decisión del aprobador sobre un ticket (aprobar o rechazar): actualiza el detalle e invalida las listas. */
export function useApprovalDecision(ticketId: number, decide: (ticketId: number) => Promise<Ticket>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => decide(ticketId),
    onSuccess: (updated) => {
      queryClient.setQueryData(ticketDetailKey(ticketId), updated);
      queryClient.invalidateQueries({ queryKey: MY_TICKETS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: MY_TICKETS_PAGE_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: APPROVER_TICKETS_QUERY_KEY });
    },
  });
}
