'use client';

import { approveSupportTicket } from '../actions/support-approval';
import { useApprovalDecision } from './useApprovalDecision';

export function useApproveTicket(ticketId: number) {
  return useApprovalDecision(ticketId, approveSupportTicket);
}
