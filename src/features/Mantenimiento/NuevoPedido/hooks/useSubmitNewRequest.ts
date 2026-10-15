import type { PreventiveType } from '@/features/Mantenimiento/shared/preventive-maintenance';
import { uploadRepairImages } from '@/features/Mantenimiento/shared/utils/uploadRepairImages';
import { invalidateAllMaintenanceQueries } from '@/features/Mantenimiento/utils/queryInvalidation';
import { Logger } from '@/lib/logger';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createMaintenanceOrderFromDeviations } from '../actions/orders.server';
import { createMaintenanceRequestPendingApproval, createManualMaintenanceRequest } from '../actions/requests.server';
import type { NewRequestData } from './useNewRequestData';
import type { NewRequestState } from './useNewRequestState';

const logger = new Logger('NuevoPedidoChecklistForm');

interface SubmitParams {
  state: NewRequestState;
  data: NewRequestData;
  defaultEquipmentId?: string;
  driverEmployeeId?: string;
  skipSupervisorQuestion: boolean;
  onSuccess?: () => void;
}

/** Validación + creación del pedido (o de la solicitud pendiente de aprobación) y reinicio del asistente. */
export function useSubmitNewRequest({
  state,
  data,
  defaultEquipmentId,
  driverEmployeeId,
  skipSupervisorQuestion,
  onSuccess,
}: SubmitParams) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { selectedEquipment, currentUser, selectedSupervisor } = data;

  const handleSubmit = async () => {
    const {
      isSubmitting,
      selectedEquipmentId,
      requestType,
      selectedDeviations,
      manualItems,
      manualRepairs,
      selectedPreventiveType,
      preventiveDescription,
      kilometer,
      engineHours,
      resourceKind,
      isCurrentUserSupervisor,
      selectedSupervisorId,
      selectedTemplateId,
      deviationComments,
    } = state;
    if (isSubmitting) return;

    // Validar datos según el flujo
    if (!selectedEquipmentId) {
      toast.error('Faltan datos requeridos');
      return;
    }
    if (requestType === 'checklist' && selectedDeviations.length === 0 && manualItems.length === 0) {
      toast.error('Debes seleccionar al menos un desvío o agregar un ítem manual');
      return;
    }
    if (requestType === 'preventive' && !selectedPreventiveType) {
      toast.error('Debes seleccionar un programa de mantenimiento preventivo');
      return;
    }
    if (requestType === 'manual' && manualRepairs.length === 0) {
      toast.error('Debes agregar al menos una reparación');
      return;
    }

    // Validar que el kilometraje no sea menor al actual
    if (kilometer) {
      const currentKm = Number(selectedEquipment?.kilometer) || 0;
      if (Number(kilometer) < currentKm) {
        toast.error(`El kilometraje no puede ser menor al actual (${currentKm} km)`);
        return;
      }
    }

    // Si es supervisor actual, usar su ID; si no, usar el seleccionado
    const supervisorId = isCurrentUserSupervisor ? currentUser?.id : selectedSupervisorId;

    if (!supervisorId) {
      toast.error('Debes seleccionar un supervisor');
      return;
    }

    state.setIsSubmitting(true);

    // Campos comunes a los cuatro caminos de creación
    const base = {
      equipmentId: selectedEquipmentId,
      resourceKind,
      supervisorId,
      kilometer: kilometer || undefined,
      engine_hours: engineHours || undefined,
    };
    // Actualizar comentarios en los desvíos antes de enviar
    const deviationsToSend = selectedDeviations.map((d) => ({
      ...d,
      comment: deviationComments[d.itemId] || d.comment || undefined,
    }));

    try {
      if (requestType === 'manual') {
        // CARGA MANUAL: mismo criterio que los demás caminos — si quien carga es
        // el supervisor, el pedido queda aprobado; si no, va a validación.
        const repairs = await Promise.all(
          manualRepairs.map(async (repair) => ({
            repairTypeId: repair.repairTypeId,
            freeText: repair.freeText,
            description: repair.description,
            // El grupo se persiste para poder indicar el origen en todos los listados
            groupId: repair.groupId,
            images: await uploadRepairImages(repair.images, selectedEquipmentId),
          }))
        );

        await createManualMaintenanceRequest({
          ...base,
          driverEmployeeId: driverEmployeeId || undefined,
          autoApprove: isCurrentUserSupervisor === true,
          repairs,
        });

        const noun = repairs.length === 1 ? '1 reparación' : `${repairs.length} reparaciones`;
        toast.success(isCurrentUserSupervisor ? `Pedido creado con ${noun}` : `Solicitud creada con ${noun}`);
      } else if (isCurrentUserSupervisor) {
        // FLUJO 1: Usuario ES el supervisor → crear pedido directamente (aprobado automáticamente)
        if (requestType === 'preventive') {
          await createMaintenanceOrderFromDeviations({
            ...base,
            source: 'preventive',
            preventiveType: selectedPreventiveType as PreventiveType,
            driverEmployeeId: driverEmployeeId || undefined,
            description: preventiveDescription.trim() || undefined,
          });
        } else {
          await createMaintenanceOrderFromDeviations({
            ...base,
            deviations: deviationsToSend,
            templateId: selectedTemplateId || undefined,
            driverEmployeeId: driverEmployeeId || undefined,
            manualItems: manualItems.map((m) => ({ label: m.label })),
          });
        }

        toast.success('Pedido de mantenimiento creado exitosamente');
      } else {
        // FLUJO 2: Usuario NO es supervisor → crear solicitud pendiente de aprobación
        if (requestType === 'preventive') {
          await createMaintenanceRequestPendingApproval({
            ...base,
            source: 'preventive',
            preventiveType: selectedPreventiveType as PreventiveType,
            description: preventiveDescription.trim() || undefined,
          });
        } else {
          await createMaintenanceRequestPendingApproval({
            ...base,
            deviations: deviationsToSend,
            templateId: selectedTemplateId || undefined,
            driverEmployeeId: driverEmployeeId || undefined,
            manualItems: manualItems.map((m) => ({ label: m.label })),
          });
        }

        toast.success('Solicitud enviada. El supervisor debe aprobarla antes de que pase a Pedidos.');
      }

      // Invalidar todas las queries de mantenimiento
      invalidateAllMaintenanceQueries(queryClient);

      // Resumen para la pantalla final (antes del reset: sale del estado del formulario)
      const itemCount =
        requestType === 'manual'
          ? manualRepairs.length
          : requestType === 'preventive'
            ? 1
            : selectedDeviations.length + manualItems.length;
      const itemNoun =
        requestType === 'manual'
          ? itemCount === 1
            ? 'reparación'
            : 'reparaciones'
          : requestType === 'preventive'
            ? 'programa preventivo'
            : itemCount === 1
              ? 'ítem'
              : 'ítems';
      state.setCompletion({
        createdByCurrentSupervisor: isCurrentUserSupervisor === true,
        itemCount,
        itemNoun,
        equipmentLabel: selectedEquipment?.label ?? null,
        supervisorName: isCurrentUserSupervisor ? currentUser?.fullname ?? null : selectedSupervisor?.fullName ?? null,
      });

      // Reset form
      state.setCurrentStep(0);
      state.setSelectedEquipmentId(defaultEquipmentId || '');
      state.setKilometer('');
      state.setEngineHours('');
      state.setSelectedTemplateId('');
      state.setSelectedDeviations([]);
      state.setDeviationComments({});
      state.setManualItems([]);
      state.setManualRepairs([]);
      state.setSelectedSupervisorId('');
      state.setIsCurrentUserSupervisor(skipSupervisorQuestion ? false : null);
      state.setSelectedPreventiveType('');
      state.setPreventiveDescription('');
      state.setRequestType('checklist');

      // Las tablas de Mantenimiento corren con React Query: sin invalidar quedan con datos viejos
      queryClient.invalidateQueries();
      router.refresh();

      onSuccess?.();

      // Sin redirección automática: la pantalla final confirma lo que se registró y el operario
      // vuelve al equipo con su propio botón (antes el toast desaparecía con la pantalla).
    } catch (error) {
      logger.error('Error al crear pedido', { data: { error } });
      // Un "failed to fetch" generico no le dice al usuario que reintentar. Las fotos se suben al storage
      // ANTES de crear el pedido, asi que separar los dos casos evita que vuelva a cargar todo el formulario
      // cuando solo fallo la red subiendo una imagen.
      const message = error instanceof Error ? error.message : '';
      if (message.includes('imagen')) {
        toast.error(message, { description: 'El pedido no se creó. Revisá la conexión y probá de nuevo.' });
      } else if (/fetch|network|NetworkError/i.test(message)) {
        toast.error('Se perdió la conexión al crear el pedido', {
          description: 'No se guardó nada. Verificá la conexión y volvé a intentar.',
        });
      } else {
        toast.error('Error al crear el pedido de mantenimiento');
      }
    } finally {
      state.setIsSubmitting(false);
    }
  };

  return { handleSubmit };
}
