'use client';

import { invalidateAllMaintenanceQueries } from '@/features/Mantenimiento/utils/queryInvalidation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { completeExternalWorkOrder, updateSectorExecutionOrder } from '../../actions/mutations.server';
import type { MaintenanceOrderData } from '../../actions/queries.server';
import {
  operationsRejectItems,
  operationsRejectOrder,
  operationsValidateOrder,
} from '../../actions/operations-validations.server';
import {
  workshopChiefHandleOperationsRejection,
  workshopChiefRejectItems,
  workshopChiefReturnOrder,
  workshopChiefValidateOrder,
} from '../../actions/validations.server';
import type { SectorTimelineItem } from '../SectorTimeline';

/** Lo que el diálogo le presta al hook: el pedido, los textos de cada acción y sus setters. */
export interface OrderValidationMutationsParams {
  order: MaintenanceOrderData | null;
  onClose: () => void;
  validationNotes: string;
  setValidationNotes: (value: string) => void;
  selectedOperationsSupervisorId: string | undefined;
  returnReason: string;
  setReturnReason: (value: string) => void;
  setShowReturnDialog: (value: boolean) => void;
  setShowItemRejectDialog: (value: boolean) => void;
  operationsNotes: string;
  setOperationsNotes: (value: string) => void;
  operationsRejectionReason: string;
  setOperationsRejectionReason: (value: string) => void;
  setShowOperationsRejectDialog: (value: boolean) => void;
  setShowOpsItemRejectDialog: (value: boolean) => void;
  setOpsRejectionComment: (value: string) => void;
  setLocalTimelineData: (value: SectorTimelineItem[] | null) => void;
  resetRejectionState: () => void;
}

/**
 * Mutaciones del circuito de validación de una orden (taller y operaciones) más el
 * reordenamiento de sectores y el cierre de OTs externas.
 *
 * Se extrajo del diálogo para que el componente quede con estado + presentación: acá no
 * hay JSX, sólo `useMutation` con sus toasts e invalidaciones.
 */
export function useOrderValidationMutations({
  order,
  onClose,
  validationNotes,
  setValidationNotes,
  selectedOperationsSupervisorId,
  returnReason,
  setReturnReason,
  setShowReturnDialog,
  setShowItemRejectDialog,
  operationsNotes,
  setOperationsNotes,
  operationsRejectionReason,
  setOperationsRejectionReason,
  setShowOperationsRejectDialog,
  setShowOpsItemRejectDialog,
  setOpsRejectionComment,
  setLocalTimelineData,
  resetRejectionState,
}: OrderValidationMutationsParams) {
  const queryClient = useQueryClient();

  const workshopValidateMutation = useMutation({
    mutationFn: () =>
      workshopChiefValidateOrder(order!.id, validationNotes || undefined, selectedOperationsSupervisorId || undefined),
    onSuccess: () => {
      toast.success('Orden validada y enviada a operaciones');
      invalidateAllMaintenanceQueries(queryClient);
      setValidationNotes('');
      onClose();
    },
    onError: (error: Error) => {
      toast.error(`Error al validar orden: ${error.message}`);
    },
  });

  const workshopReturnMutation = useMutation({
    mutationFn: () => workshopChiefReturnOrder(order!.id, returnReason),
    onSuccess: () => {
      toast.success('Orden devuelta al taller');
      invalidateAllMaintenanceQueries(queryClient);
      setReturnReason('');
      setShowReturnDialog(false);
      onClose();
    },
    onError: (error: Error) => {
      toast.error(`Error al devolver orden: ${error.message}`);
    },
  });

  const workshopRejectItemsMutation = useMutation({
    mutationFn: (rejections: Array<{ repairId: string; comment: string }>) =>
      workshopChiefRejectItems(order!.id, rejections),
    onSuccess: () => {
      toast.success('Items rechazados y devueltos al operador');
      invalidateAllMaintenanceQueries(queryClient);
      resetRejectionState();
      setShowItemRejectDialog(false);
      onClose();
    },
    onError: (error: Error) => {
      toast.error(`Error al rechazar items: ${error.message}`);
    },
  });

  const completeExternalWOMutation = useMutation({
    mutationFn: (workOrderId: string) => completeExternalWorkOrder(workOrderId),
    onSuccess: () => {
      toast.success('OT externa marcada como completada');
      invalidateAllMaintenanceQueries(queryClient);
    },
    onError: (error: Error) => {
      toast.error(`Error al completar OT externa: ${error.message}`);
    },
  });

  const operationsValidateMutation = useMutation({
    mutationFn: () => operationsValidateOrder(order!.id, operationsNotes || undefined),
    onSuccess: () => {
      toast.success('Orden validada por operaciones. Equipo restaurado a operativo.');
      invalidateAllMaintenanceQueries(queryClient);
      setOperationsNotes('');
      onClose();
    },
    onError: (error: Error) => {
      toast.error(`Error al validar orden: ${error.message}`);
    },
  });

  const operationsRejectMutation = useMutation({
    mutationFn: () => operationsRejectOrder(order!.id, operationsRejectionReason),
    onSuccess: () => {
      toast.success('Orden devuelta a validacion de taller');
      invalidateAllMaintenanceQueries(queryClient);
      setOperationsRejectionReason('');
      setShowOperationsRejectDialog(false);
      onClose();
    },
    onError: (error: Error) => {
      toast.error(`Error al rechazar orden: ${error.message}`);
    },
  });

  const operationsRejectItemsMutation = useMutation({
    mutationFn: (rejections: Array<{ repairId: string; comment: string }>) =>
      operationsRejectItems(order!.id, rejections),
    onSuccess: () => {
      toast.success('Items rechazados por operaciones');
      invalidateAllMaintenanceQueries(queryClient);
      resetRejectionState();
      setShowOpsItemRejectDialog(false);
      onClose();
    },
    onError: (error: Error) => {
      toast.error(`Error al rechazar items: ${error.message}`);
    },
  });

  const handleOpsRejectionMutation = useMutation({
    mutationFn: ({ agree, comment }: { agree: boolean; comment?: string }) =>
      workshopChiefHandleOperationsRejection(order!.id, agree, comment),
    onSuccess: (_data, variables) => {
      toast.success(
        variables.agree
          ? 'Items enviados al operador para correccion'
          : 'Orden devuelta a operaciones para reconsideracion'
      );
      invalidateAllMaintenanceQueries(queryClient);
      setOpsRejectionComment('');
      onClose();
    },
    onError: (error: Error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (sectorOrders: Array<{ sectorId: string; sequenceOrder: number }>) =>
      updateSectorExecutionOrder(order!.id, sectorOrders),
    onSuccess: () => {
      toast.success('Orden de ejecucion actualizado');
      invalidateAllMaintenanceQueries(queryClient);
    },
    onError: (error: Error) => {
      // Revert local state on error
      setLocalTimelineData(null);
      toast.error(`Error al cambiar el orden: ${error.message}`);
    },
  });

  return {
    workshopValidateMutation,
    workshopReturnMutation,
    workshopRejectItemsMutation,
    completeExternalWOMutation,
    operationsValidateMutation,
    operationsRejectMutation,
    operationsRejectItemsMutation,
    handleOpsRejectionMutation,
    reorderMutation,
  };
}
