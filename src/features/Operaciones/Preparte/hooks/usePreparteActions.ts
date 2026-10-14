'use client';

import {
  bulkReschedulePrepartes,
  confirmPreparteToDailyReport,
  updateMultiplePreparteStatus,
} from '@/features/Operaciones/Preparte/actions/bulk.server';
import {
  createPreparte,
  deletePreparte,
  movePreparteFile,
  updatePreparte,
} from '@/features/Operaciones/Preparte/actions/mutations.server';
import { updatePreparteImageByOrderNumber } from '@/features/Operaciones/Preparte/actions/mutations.server';
import type { Preparte } from '@/features/Operaciones/Preparte/types';
import { Logger } from '@/lib/logger';
import { formatCalendarDate } from '@/shared/utils/calendar-date';
import { useQueryClient } from '@tanstack/react-query';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import type { Cliente, Contrato, PreparteItem } from '../types/entities';
import type { PreparteFormData } from '../schemas/preparte-form';
import { expandPreparteItems } from '../lib/preparte-form-data';

const logger = new Logger('usePreparteActions');

export type SubmitPreparteTarget = { mode: 'create' } | { mode: 'edit'; item: PreparteItem };

export type ConfirmPreparteResult = 'ok' | 'needs-date' | 'error';

interface UsePreparteActionsOptions {
  customers: Cliente[];
  contratos: Contrato[];
}

/**
 * Acciones de pedidos (alta, edición, baja y cambios de estado) con su invalidación y sus toasts.
 * Todas devuelven si la operación tuvo éxito y nunca lanzan: los errores se informan por toast.
 */
export function usePreparteActions({ customers, contratos }: UsePreparteActionsOptions) {
  const queryClient = useQueryClient();
  const router = useRouter();

  // Invalida las queries de la tabla y refresca el Server Component (tarjetas de estadísticas)
  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['preparte-list'] });
    queryClient.invalidateQueries({ queryKey: ['preparte-list-facets'] });
    queryClient.invalidateQueries({ queryKey: ['prepartes'] });
    // Los logs de cambios, para que el detalle muestre datos actualizados
    queryClient.invalidateQueries({ queryKey: ['preparte-change-logs'] });
    queryClient.invalidateQueries({ queryKey: ['preparte-change-logs-order'] });
    router.refresh();
  }, [queryClient, router]);

  /** Crea o actualiza un pedido. Devuelve `true` si se guardó (el caller cierra y limpia el form). */
  const submitPreparte = useCallback(
    async (formData: PreparteFormData, target: SubmitPreparteTarget): Promise<boolean> => {
      try {
        if (target.mode === 'edit' && target.item.id) {
          const currentItem = target.item;
          // Manejar la imagen si está presente
          let imageUrl: string | null = currentItem.preparteImage || null;
          if (formData.image_url && formData.image_url !== currentItem.preparteImage) {
            const cliente = customers.find((c) => c.id === currentItem.cliente_id);
            const contrato = contratos.find((c) => c.id === currentItem.contrato_id);
            imageUrl = await movePreparteFile(
              formData.image_url,
              cliente?.name || 'empresa',
              contrato?.service_name || 'servicio',
              formData.numero_pedido || ''
            );
          }

          // PP-3: En edición solo hay un ítem; se usan los campos del primero
          const firstItem = formData.item[0];
          const itemExecutionDate = firstItem?.executionDate;
          const itemSubjectToAvailability = firstItem?.subject_to_availability ?? false;

          const updatedPreparte: Partial<Preparte> = {
            id: currentItem.id,
            cliente_id: formData.cliente_id,
            contrato_id: formData.contrato_id,
            solicitante: formData.solicitante,
            status: formData.status,
            item: firstItem?.id || null,
            quantity: firstItem?.quantity || 1,
            jornada: firstItem?.jornada || '',
            tipo: firstItem?.tipo || '',
            observaciones: firstItem?.observaciones || '',
            start_time: firstItem?.start_time || null,
            end_time: firstItem?.end_time || null,
            executionDate:
              itemExecutionDate && typeof itemExecutionDate === 'object' && itemExecutionDate.from
                ? moment(itemExecutionDate.from).format('YYYY-MM-DD')
                : null,
            subject_to_availability: itemSubjectToAvailability,
            updated_at: new Date().toISOString(),
            requestDate: moment(formData.requestDate).format('YYYY-MM-DD'),
            numero_pedido: formData.numero_pedido,
            // Si el estado es 'reprogramado', se guarda el ID del preparte original
            reprogram: formData.status === 'reprogramado' ? currentItem.id : undefined,
            // Motivo del cambio de estado (el actor lo setea el server desde la sesión)
            ...(formData.status === 'cancelado' ? { cancel_reason: formData.cancel_reason ?? null } : {}),
            ...(formData.status === 'rechazado' ? { rejected_reason: formData.rejected_reason ?? null } : {}),
            ...(formData.status === 'reprogramado' ? { reprogram_reason: formData.reprogram_reason ?? null } : {}),
            sector_service_id: formData.sector_service_id ?? '',
            areas_service_id: formData.areas_service_id ?? '',
            equipos_cliente: formData.equipos_cliente?.[0] || null,
            preparteImage: imageUrl,
          };

          await updatePreparte(currentItem.id, updatedPreparte);
          toast.success('Pedido actualizado correctamente');
          refresh();
          return true;
        }

        // Alta: primero se valida y expande; el archivo se mueve recién cuando el pedido ya existe
        const expanded = expandPreparteItems(formData);
        if ('error' in expanded) {
          toast.error(expanded.error);
          return false;
        }

        // El N° de pedido lo asigna el servidor en la misma transacción del alta.
        const prepartesToCreate: Omit<Preparte, 'id'>[] = expanded.map((order) => ({
          ...order,
          numero_pedido: '',
          preparteImage: null,
        }));

        const createdPrepartes = await createPreparte(prepartesToCreate);
        const numeroPedido = createdPrepartes[0]?.numero_pedido ?? '';

        // La imagen se mueve DESPUÉS de crear: si el alta falla, el archivo subido no se toca.
        let imageWarning = false;
        if (formData.image_url && numeroPedido) {
          try {
            const cliente = customers.find((c) => c.id === formData.cliente_id);
            const contrato = contratos.find((c) => c.id === formData.contrato_id);
            const movedUrl = await movePreparteFile(
              formData.image_url,
              cliente?.name || 'empresa',
              contrato?.service_name || 'servicio',
              numeroPedido
            );
            await updatePreparteImageByOrderNumber(numeroPedido, movedUrl);
          } catch (imageError) {
            logger.error('El pedido se creó pero no se pudo adjuntar la imagen', { data: { error: imageError } });
            imageWarning = true;
          }
        }

        const subjectToAvailabilityCount = prepartesToCreate.filter((p) => p.subject_to_availability).length;
        const withDateCount = prepartesToCreate.length - subjectToAvailabilityCount;

        let successMessage = `Se crearon ${createdPrepartes.length} pedidos con N° ${numeroPedido}`;
        if (subjectToAvailabilityCount > 0 && withDateCount > 0) {
          successMessage += ` (${withDateCount} con fecha, ${subjectToAvailabilityCount} pendientes de fecha)`;
        } else if (subjectToAvailabilityCount > 0) {
          successMessage += ` (pendientes de fecha)`;
        }

        toast.success(successMessage);
        if (imageWarning) {
          toast.warning('El pedido se creó, pero no se pudo adjuntar la imagen. Volvé a subirla editando el pedido.');
        }
        refresh();
        return true;
      } catch (error) {
        logger.error('Error saving preparte', { data: { error } });
        toast.error(error instanceof Error ? error.message : 'Error al guardar el pedido');
        return false;
      }
    },
    [customers, contratos, refresh]
  );

  /**
   * Confirma un pedido y lo migra al parte diario.
   * `needs-date`: está sujeto a disponibilidad y no tiene fecha; el caller debe abrir la edición.
   */
  const confirmPreparte = useCallback(
    async (
      item: PreparteItem,
      confirmation: { confirmedBy: string; executionDate?: string }
    ): Promise<ConfirmPreparteResult> => {
      try {
        const requestedDate = confirmation.executionDate || item.executionDate;
        const execDate = requestedDate ? moment.utc(requestedDate) : null;

        if (!execDate || !execDate.isValid()) {
          // Sujeto a disponibilidad sin fecha: el caller abre la edición para que se asigne
          if (item.subject_to_availability) {
            toast.error(
              'Este pedido está sujeto a disponibilidad operativa. Debe asignar una fecha de ejecución antes de confirmar.',
              { duration: 5000 }
            );
            return 'needs-date';
          }
          toast.error('El pedido debe tener una fecha de ejecución para poder confirmarse.');
          return 'error';
        }

        await confirmPreparteToDailyReport(item.id, execDate.format('YYYY-MM-DD'), confirmation.confirmedBy);

        refresh();
        toast.success('Pedido confirmado y enviado al parte diario');
        return 'ok';
      } catch (error) {
        logger.error('Error al confirmar el pedido', { data: { error } });
        toast.error(error instanceof Error ? error.message : 'Error al confirmar el pedido');
        return 'error';
      }
    },
    [refresh]
  );

  const removePreparte = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await deletePreparte(id);
        refresh();
        toast.success('Pedido eliminado correctamente');
        return true;
      } catch (error) {
        logger.error('Error al eliminar', { data: { error } });
        toast.error('Error al eliminar el pedido');
        return false;
      }
    },
    [refresh]
  );

  /** Rechaza un pedido (mismo payload que el modal de cambio de estado masivo, con un solo id). */
  const rejectPreparte = useCallback(
    async (id: string, reason: string): Promise<boolean> => {
      try {
        await updateMultiplePreparteStatus([id], { status: 'rechazado', rejected_reason: reason });
        toast.success('Se actualizó el estado de 1 pedido a "rechazado".');
        refresh();
        return true;
      } catch (error) {
        logger.error('Error al actualizar estados', { data: { error } });
        toast.error('Ocurrió un error al actualizar los estados.');
        return false;
      }
    },
    [refresh]
  );

  /** Cancela un pedido (mismo payload que el modal de cambio de estado masivo, con un solo id). */
  const cancelPreparte = useCallback(
    async (id: string, reason: string): Promise<boolean> => {
      try {
        await updateMultiplePreparteStatus([id], { status: 'cancelado', cancel_reason: reason });
        toast.success('Se actualizó el estado de 1 pedido a "cancelado".');
        refresh();
        return true;
      } catch (error) {
        logger.error('Error al actualizar estados', { data: { error } });
        toast.error('Ocurrió un error al actualizar los estados.');
        return false;
      }
    },
    [refresh]
  );

  /** Reprograma un pedido: clona como `pendiente` con la nueva fecha y marca el original `reprogramado`. */
  const reprogramPreparte = useCallback(
    async (id: string, newDate: string, reason: string): Promise<boolean> => {
      try {
        // `executionDate` es `@db.Date`: se envía la medianoche UTC del día elegido (en hora local correría el día)
        const date = new Date(`${newDate}T00:00:00.000Z`);
        const result = await bulkReschedulePrepartes([id], date, reason);
        toast.success(
          `Se reprogramaron ${result.succeeded} pedido${result.succeeded > 1 ? 's' : ''} para el ${formatCalendarDate(date)}.`
        );
        refresh();
        return true;
      } catch (error) {
        logger.error('Error al actualizar estados', { data: { error } });
        toast.error('Ocurrió un error al actualizar los estados.');
        return false;
      }
    },
    [refresh]
  );

  return useMemo(
    () => ({
      submitPreparte,
      confirmPreparte,
      removePreparte,
      rejectPreparte,
      cancelPreparte,
      reprogramPreparte,
      refresh,
    }),
    [submitPreparte, confirmPreparte, removePreparte, rejectPreparte, cancelPreparte, reprogramPreparte, refresh]
  );
}
