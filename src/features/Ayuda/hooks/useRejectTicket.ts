'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { rejectSupportTicket } from '../actions/support-approval';
import { MY_TICKETS_PAGE_QUERY_KEY, MY_TICKETS_QUERY_KEY } from './queryKeys';
import { APPROVER_TICKETS_QUERY_KEY } from './useApproverTickets';
import { ticketDetailKey } from './useTicketDetail';

export function useRejectTicket(ticketId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => rejectSupportTicket(ticketId),
    onSuccess: (updated) => {
      queryClient.setQueryData(ticketDetailKey(ticketId), updated);
      queryClient.invalidateQueries({ queryKey: MY_TICKETS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: MY_TICKETS_PAGE_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: APPROVER_TICKETS_QUERY_KEY });
    },
  });
}
