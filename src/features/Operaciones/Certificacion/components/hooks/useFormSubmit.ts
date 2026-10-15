import {
  createComercialDailyReportRow,
  updateComercialDailyReportRow,
} from '@/features/Operaciones/PartesDiarios/actions/comercial-rows.server';
import { createRemito } from '@/features/Operaciones/PartesDiarios/remitManager/actions/remitos.server';
import { logger } from '@/lib/logger';
import { QueryClient } from '@tanstack/react-query';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { DETAIL_QUERY_PREFIX } from '@/features/Operaciones/PartesDiarios/detail/constants';
import { CERTIFICATION_DETAIL_QUERY_KEY, CERTIFICATION_QUERY_KEY } from '../../list/constants';
import type { DailyReportRowFormValues } from '../form-types';

/**
 * Refresca todo lo que depende de las líneas: la tabla, los conteos de sus filtros (`datatable-facet`),
 * el historial de cambios y el detalle personal del modal.
 */
function invalidateCertificationQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: [...CERTIFICATION_QUERY_KEY] });
  queryClient.invalidateQueries({ queryKey: ['datatable-facet'] });
  queryClient.invalidateQueries({ queryKey: [DETAIL_QUERY_PREFIX, 'row-history'] });
  queryClient.invalidateQueries({ queryKey: [CERTIFICATION_DETAIL_QUERY_KEY] });
}

type ServiceItemFlag = {
  id: string;
  needs_personnel?: boolean | null;
  needs_equipment?: boolean | null;
};

export function useFormSubmit(
  isCreating: boolean,
  selectedRow: { id?: string; status?: string; data_to_clone?: { item_id?: string } } | null,
  refetchDailyReport: () => void,
  onClose: () => void,
  queryClient: QueryClient,
  serviceItems?: ServiceItemFlag[]
) {
  const router = useRouter();

  const handleCreate = useCallback(
    async (data: DailyReportRowFormValues) => {
      if (!data.date) {
        toast.error('Debe seleccionar una fecha.');
        return;
      }

      const formattedDate = moment(data.date).format('YYYY-MM-DD');

      // Determinar completed_day y completed_night según la jornada
      const is24Hours = data.working_day === 'jornada 24 horas';

      // Determinar el estado inicial según los flags del item seleccionado
      const selectedItem = serviceItems?.find((item) => item.id === data.item);
      const itemNeedsPersonnel = selectedItem?.needs_personnel ?? true;
      const itemNeedsEquipment = selectedItem?.needs_equipment ?? true;

      const hasEmployees = (data.employees ?? []).length > 0;
      const hasEquipment = (data.equipment ?? []).length > 0;

      // Solo considerar falta de recursos si el item los requiere
      const missingRequiredResources = (itemNeedsPersonnel && !hasEmployees) || (itemNeedsEquipment && !hasEquipment);

      const initialStatus = missingRequiredResources ? 'sin_recursos_asignados' : 'en_certificacion';

      // Una sola server action: crea el parte diario si falta, la línea y sus relaciones.
      const created = await createComercialDailyReportRow({
        date: formattedDate,
        customer_id: data.customer,
        service_id: data.services,
        item_id: data.item,
        working_day: data.working_day,
        employees: data.employees ?? [],
        equipment: data.equipment ?? [],
        customer_equipment: data.equipos_cliente ?? [],
        start_time: data.start_time || null,
        end_time: data.end_time || null,
        status: initialStatus,
        description: data.observations || null,
        sector_service_id: data.sector_service_id || null,
        areas_service_id: data.areas_service_id || null,
        type_service: data.type_service ?? null,
        completed_day: is24Hours ? true : null,
        completed_night: is24Hours ? true : null,
      });

      const newRowId = created.id;

      // 3.5. Crear remito en la tabla remitos (NUEVO)
      if (data.remit_number) {
        try {
          await createRemito(newRowId, data.remit_number);
        } catch (error) {
          logger.error('Error al crear remito', { data: { error } });
          toast.error('Error al crear el remito. La línea se creó pero sin remito.');
        }
      }

      toast.success('Línea creada exitosamente.');
      // Primero invalidar para marcar como stale
      invalidateCertificationQueries(queryClient);
      // Luego forzar refetch
      await queryClient.refetchQueries({
        queryKey: [...CERTIFICATION_QUERY_KEY],
        type: 'active',
      });
      onClose();

      // Refetch de los datos de la tabla
      await refetchDailyReport();

      router.refresh();
    },
    [refetchDailyReport, onClose, router, queryClient, serviceItems]
  );

  const handleUpdate = useCallback(
    async (data: DailyReportRowFormValues) => {
      if (!selectedRow?.id) {
        toast.error('No se encontró la línea del parte diario.');
        return;
      }

      const rowId = selectedRow.id;
      const currentStatusInRow = selectedRow?.status;
      const isChangingToCertificacion = data.status === 'en_certificacion';

      if (isChangingToCertificacion) {
        if (currentStatusInRow !== 'ejecutado') {
          toast.error('El estado solo puede cambiar a "en_certificacion" si el parte ya está en estado "ejecutado".');
          return;
        }
      }
      // Determinar el estado final basado en los recursos y los flags del item
      const hasEmployees = data.employees && data.employees.length > 0;
      const hasEquipment = data.equipment && data.equipment.length > 0;

      // Obtener los flags del item seleccionado (puede venir del selectedRow o de serviceItems)
      const itemId = data.item || selectedRow?.data_to_clone?.item_id;
      const selectedItem = serviceItems?.find((item) => item.id === itemId);
      const itemNeedsPersonnel = selectedItem?.needs_personnel ?? true;
      const itemNeedsEquipment = selectedItem?.needs_equipment ?? true;

      // Solo hay falta de recursos si el item los requiere y no están presentes
      const missingRequiredResources = (itemNeedsPersonnel && !hasEmployees) || (itemNeedsEquipment && !hasEquipment);

      // hasResources = tiene todos los recursos que el item requiere
      const hasRequiredResources = !missingRequiredResources;

      let finalStatus = data.status;

      // Lógica automática de cambio de estado
      if (missingRequiredResources && (data.status === 'pendiente' || data.status === 'sin_recursos_asignados')) {
        finalStatus = 'sin_recursos_asignados';
      } else if (hasRequiredResources && data.status === 'sin_recursos_asignados') {
        finalStatus = 'pendiente';
      }

      // Una sola server action: actualiza la línea y sincroniza sus relaciones.
      await updateComercialDailyReportRow(rowId, {
        status: finalStatus ?? 'pendiente',
        description: data.observations || null,
        start_time: data.start_time || null,
        end_time: data.end_time || null,
        working_day: data.working_day || null,
        sector_service_id: data.sector_service_id || null,
        areas_service_id: data.areas_service_id || null,
        ...(data.employees !== undefined ? { employees: data.employees ?? [] } : {}),
        ...(data.equipment !== undefined ? { equipment: data.equipment ?? [] } : {}),
        ...(data.equipos_cliente !== undefined ? { customer_equipment: data.equipos_cliente ?? [] } : {}),
      });

      // Crear remito en la tabla remitos si se está cambiando a certificación (NUEVO)
      if (isChangingToCertificacion && data.remit_number) {
        try {
          await createRemito(rowId, data.remit_number);
        } catch (error) {
          logger.error('Error al crear remito', { data: { error } });
          // Si el remito ya existe, no es un error crítico
          if (error instanceof Error && error.message.includes('Ya existe')) {
            toast.warning('El remito ya existe para esta línea.');
          } else {
            toast.error('Error al crear el remito.');
          }
        }
      }

      toast.success('Parte diario actualizado exitosamente.');

      // Refrescar la tabla, sus filtros y el historial
      invalidateCertificationQueries(queryClient);

      onClose();
      // refetchDailyReport();
      // router.refresh();
    },
    [selectedRow, refetchDailyReport, onClose, router, queryClient, serviceItems]
  );

  const onSubmit = useCallback(
    async (data: DailyReportRowFormValues) => {
      try {
        if (isCreating) {
          await handleCreate(data);
        } else {
          await handleUpdate(data);
        }
      } catch (error) {
        logger.error('Error en submit del parte diario', { data: { error } });
        toast.error(isCreating ? 'Error al crear la línea.' : 'Error al actualizar el parte diario.');
      }
    },
    [isCreating, handleCreate, handleUpdate]
  );

  return { onSubmit };
}
