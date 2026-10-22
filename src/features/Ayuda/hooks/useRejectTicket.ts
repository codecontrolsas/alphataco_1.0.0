'use client';

import { rejectSupportTicket } from '../actions/support-approval';
import { useApprovalDecision } from './useApprovalDecision';

export function useRejectTicket(ticketId: number) {
  return useApprovalDecision(ticketId, rejectSupportTicket);
}
