'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createSupportTicket } from '../actions/support-tickets';
import { MY_TICKETS_PAGE_QUERY_KEY, MY_TICKETS_QUERY_KEY } from './queryKeys';
import { APPROVER_TICKETS_QUERY_KEY } from './useApproverTickets';
import { MY_TICKETS_WITH_UNREAD_QUERY_KEY } from './useMyTicketsWithUnread';

export function useCreateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createSupportTicket,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MY_TICKETS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: MY_TICKETS_PAGE_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: MY_TICKETS_WITH_UNREAD_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: APPROVER_TICKETS_QUERY_KEY });
    },
  });
}
