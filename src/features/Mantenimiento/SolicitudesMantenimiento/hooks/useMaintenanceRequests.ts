import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApproveRequestItemsInput } from '../../types';
import { invalidateAllMaintenanceQueries } from '../../utils/queryInvalidation';
import { approveMaintenanceRequestItems, rejectMaintenanceRequestItems } from '../actions/approvals.server';

/**
 * Hook para aprobar items de una solicitud
 */
export function useApproveMaintenanceRequestItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ApproveRequestItemsInput) => approveMaintenanceRequestItems(input),
    onSuccess: () => {
      invalidateAllMaintenanceQueries(queryClient);
    },
  });
}

/**
 * Hook para rechazar items específicos de una solicitud
 * Permite rechazo selectivo (item por item)
 */
export function useRejectMaintenanceRequestItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { requestId: string; itemIds: string[]; reason: string }) =>
      rejectMaintenanceRequestItems(input),
    onSuccess: () => {
      invalidateAllMaintenanceQueries(queryClient);
    },
  });
}
