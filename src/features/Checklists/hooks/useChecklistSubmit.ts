'use client';

import { CreateChecklistAnswer } from '@/features/Checklists';
import { fetchSupervisorsForEquipment } from '@/features/Checklists/actions/actionsServer';
import {
  buildAnswersBySection,
  collectItemObservations,
  computeDeviations,
  type ChecklistDeviation,
} from '@/features/Checklists/lib/checklist-evaluation';
import {
  ITEM_OBSERVATIONS_KEY,
  type ChecklistTemplate,
  type ChecklistTemplateSection,
  type generateChecklistSchema,
} from '@/features/Checklists/lib/checklist-form-schema';
import { getChecklistRedirectPath } from '@/features/Checklists/lib/checklist-redirect';
import { getPendingDeviations } from '@/features/Mantenimiento/actions/maintenance-actions';
import { logger } from '@/lib/logger';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import type { z } from 'zod';

type ChecklistFormData = z.infer<ReturnType<typeof generateChecklistSchema>>;

type Params = {
  canSubmit: boolean;
  template: NonNullable<ChecklistTemplate>;
  visibleSections: ChecklistTemplateSection[];
  hitchSectionCodes: Set<string>;
  defaultEmployeeId?: string;
  defaultEquipmentId?: string;
  selectedHitchEquipment: string | null;
  minKilometer: number | null;
  minEngineHours: number | null;
  setKilometerError: (value: string | null) => void;
  setEngineHoursError: (value: string | null) => void;
};

/**
 * Guardado del checklist (unidad tractora + enganche), desvíos y supervisores para el
 * modal de reparación. Compartido por el dashboard y el QR anónimo (sin sesión): la
 * empresa de los supervisores sale del equipo, no de la sesión.
 */
export function useChecklistSubmit({
  canSubmit,
  template,
  visibleSections,
  hitchSectionCodes,
  defaultEmployeeId,
  defaultEquipmentId,
  selectedHitchEquipment,
  minKilometer,
  minEngineHours,
  setKilometerError,
  setEngineHoursError,
}: Params) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [criticalItemsFailed, setCriticalItemsFailed] = useState<string[]>([]);
  const [showDeviationsModal, setShowDeviationsModal] = useState(false);
  const [pendingDeviations, setPendingDeviations] = useState<Awaited<ReturnType<typeof getPendingDeviations>>>([]);
  /**
   * IDs de los desvíos que pertenecen al equipo enganchado (ticket 677). Sirven para
   * mostrar en el modal a qué unidad se le va a imputar cada desvío.
   */
  const [hitchDeviationIds, setHitchDeviationIds] = useState<Set<string>>(new Set());
  const [, setSupervisors] = useState<Awaited<ReturnType<typeof fetchSupervisorsForEquipment>>>([]);
  const [showAllGoodPrompt, setShowAllGoodPrompt] = useState(false);
  const [currentEquipmentId, setCurrentEquipmentId] = useState<string | undefined>(defaultEquipmentId);
  const [createdAnswerId, setCreatedAnswerId] = useState<string | null>(null);

  const onSubmit = async (data: ChecklistFormData) => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setCriticalItemsFailed([]);
    setKilometerError(null);
    setEngineHoursError(null);

    // Validar que el kilometraje no sea menor al kilometraje actual del equipo
    if (minKilometer !== null && data.kilometraje) {
      const enteredKilometer = parseInt(data.kilometraje, 10);
      if (!isNaN(enteredKilometer) && enteredKilometer < minKilometer) {
        setKilometerError(
          `El kilometraje ingresado (${enteredKilometer.toLocaleString('es-AR')} km) no puede ser menor al kilometraje actual del equipo (${minKilometer.toLocaleString('es-AR')} km)`
        );
        setIsSubmitting(false);
        // Mostrar toast de error
        const { toast } = await import('sonner');
        toast.error('Error de validación', {
          description: `El kilometraje no puede ser menor a ${minKilometer.toLocaleString('es-AR')} km`,
        });
        return;
      }
    }

    // Validar que el horómetro no sea menor al horómetro actual del equipo
    if (minEngineHours !== null && data.horometro) {
      const enteredEngineHours = parseInt(data.horometro, 10);
      if (!isNaN(enteredEngineHours) && enteredEngineHours < minEngineHours) {
        setEngineHoursError(
          `El horómetro ingresado (${enteredEngineHours.toLocaleString('es-AR')} hs) no puede ser menor al horómetro actual del equipo (${minEngineHours.toLocaleString('es-AR')} hs)`
        );
        setIsSubmitting(false);
        const { toast } = await import('sonner');
        toast.error('Error de validación', {
          description: `El horómetro no puede ser menor a ${minEngineHours.toLocaleString('es-AR')} hs`,
        });
        return;
      }
    }

    try {
      // Qué ítems generan desvío y cuáles son críticos lo decide `lib/checklist-evaluation`
      // (módulo puro con tests): el componente sólo reparte el resultado entre la unidad
      // tractora y el acoplado (ticket 677), que se guardan en checklists distintos.
      const deviations = computeDeviations(data, { sections: visibleSections, hitchSectionCodes });
      const toFailedItem = ({ is_hitch: _isHitch, ...deviation }: ChecklistDeviation) => deviation;
      const failedItems = deviations.filter((deviation) => !deviation.is_hitch).map(toFailedItem);
      const hitchFailedItems = deviations.filter((deviation) => deviation.is_hitch).map(toFailedItem);

      // Para compatibilidad con el código existente, mantener la referencia a failedCriticalItems
      const failedCriticalItems = failedItems;

      /**
       * Observaciones por item, indexadas por nombre de campo.
       *
       * Van en una clave propia de `answer_data` y NO dentro de `answers`: el
       * cálculo del resultado recorre ese subárbol buscando el literal "M", así
       * que una observación que dijera "M" marcaría el checklist como fallido.
       */
      const itemObservations = collectItemObservations(data, visibleSections);

      // Estructurar las respuestas por sección
      const answersBySection = buildAnswersBySection(data, visibleSections);

      // Guardar en checklist_answers
      // NOTA: El kilometraje ya NO se actualiza directamente aquí.
      // Se actualizará cuando se apruebe la entrada a taller en el nuevo flujo de mantenimiento.

      // Guardar checklist para el equipo UT
      // NUEVO FLUJO: Usar failed_items que incluye TODOS los items con "M" (no solo críticos)
      const checklistAnswer = await CreateChecklistAnswer(template.id, {
        equipment_id: data.equipment_id,
        customer_id: data.customer_id || null,
        employee_id: defaultEmployeeId,
        // ID del empleado chofer — se guarda como columna FK directa en checklist_answers
        chofer_employee_id: (data as Record<string, unknown>).chofer_employee_id as string | null | undefined,
        chofer: data.chofer,
        fecha: data.fecha,
        hora: data.hora,
        kilometraje: data.kilometraje,
        horometro: data.horometro,
        observaciones: data.observaciones,
        answers: answersBySection,
        [ITEM_OBSERVATIONS_KEY]: itemObservations,
        failed_items: failedItems, // Nuevo formato con is_critical
        critical_items_failed: failedCriticalItems, // Mantener por compatibilidad
      });

      setCurrentEquipmentId(data.equipment_id);
      setCreatedAnswerId(checklistAnswer.id);

      // Si hay enganche seleccionado, guardar el mismo checklist para el equipo enganchado (COD-290)
      // IMPORTANTE (ticket 677): los desvíos de la sección del enganche se crean en ESTE
      // checklist, no en el de la unidad tractora, para que la solicitud de mantenimiento
      // (y por lo tanto el costo) se impute a la patente del acoplado.
      let hitchAnswerId: string | null = null;
      if (selectedHitchEquipment) {
        try {
          const hitchChecklistAnswer = await CreateChecklistAnswer(template.id, {
            equipment_id: selectedHitchEquipment,
            customer_id: data.customer_id || null,
            employee_id: defaultEmployeeId,
            // Mismo chofer que la UT
            chofer_employee_id: (data as Record<string, unknown>).chofer_employee_id as string | null | undefined,
            chofer: data.chofer,
            fecha: data.fecha,
            hora: data.hora,
            kilometraje: data.kilometraje,
            horometro: data.horometro,
            observaciones: data.observaciones,
            answers: answersBySection, // Mismo resultado para ambos equipos
            [ITEM_OBSERVATIONS_KEY]: itemObservations,
            // Solo los desvíos de la sección que describe al enganche
            failed_items: hitchFailedItems,
            ut_checklist_answer_id: checklistAnswer.id, // Vincular con el checklist del UT
          });

          hitchAnswerId = hitchChecklistAnswer.id;

          logger.info('[CHECKLIST] Created duplicate checklist answer for hitched equipment', {
            data: {
              hitchEquipmentId: selectedHitchEquipment,
              utAnswerId: checklistAnswer.id,
              hitchDeviations: hitchFailedItems.length,
            },
          });
        } catch (error) {
          logger.error('Error creating checklist answer for hitched equipment', { data: { error } });
          const { toast } = await import('sonner');
          toast.error('Error al guardar el checklist para el equipo enganchado');
          // No fallar completamente, pero loguear el error
        }
      }

      // NUEVO FLUJO: Mostrar modal si hay CUALQUIER item fallido (crítico o no),
      // sea de la unidad tractora o del enganche.
      const allFailedItems = [...failedItems, ...hitchFailedItems];
      if (allFailedItems.length > 0) {
        setCriticalItemsFailed(allFailedItems.map((item) => item.item_label));

        // Obtener los desvíos creados y los supervisores disponibles para el modal
        try {
          logger.info('[NormalizedChecklistForm] Obteniendo desvíos para equipment_id', {
            data: {
              equipmentId: data.equipment_id,
              checklistAnswerId: checklistAnswer.id,
              hitchEquipmentId: selectedHitchEquipment,
              hitchAnswerId,
            },
          });
          // Solo los desvíos de ESTE checklist: traer los de otros checklists hacía que la
          // solicitud se asociara al checklist equivocado y que los desvíos recién cargados
          // quedaran sin solicitud.
          // Los del enganche viven en su propio checklist y bajo su propia patente,
          // así que se piden por separado (ticket 677).
          const [utDeviations, hitchDeviations, supervisorsList] = await Promise.all([
            getPendingDeviations(data.equipment_id, {
              checklistAnswerId: checklistAnswer.id,
              onlyWithoutRequest: true,
            }),
            selectedHitchEquipment && hitchAnswerId
              ? getPendingDeviations(selectedHitchEquipment, {
                  checklistAnswerId: hitchAnswerId,
                  onlyWithoutRequest: true,
                })
              : Promise.resolve([]),
            // La empresa sale del equipo: este formulario corre también sin sesión (QR).
            fetchSupervisorsForEquipment(data.equipment_id),
          ]);

          const deviations = [...utDeviations, ...hitchDeviations];
          setHitchDeviationIds(new Set(hitchDeviations.map((deviation) => deviation.id)));

          logger.debug('[NormalizedChecklistForm] Desvíos obtenidos', {
            data: { count: deviations.length, hitchCount: hitchDeviations.length, deviations },
          });
          logger.debug('[NormalizedChecklistForm] Supervisores obtenidos', {
            data: { count: supervisorsList?.length || 0 },
          });

          setPendingDeviations(deviations);
          setSupervisors(supervisorsList);
          setShowDeviationsModal(true);
          // NO redirigir aquí, esperar a que el modal se cierre

          // Contar críticos vs no críticos para el mensaje
          const criticalCount = allFailedItems.filter((item) => item.is_critical).length;

          const { toast } = await import('sonner');
          toast.success('Checklist guardado', {
            description: `Se detectaron ${allFailedItems.length} item(s) con fallos${criticalCount > 0 ? ` (${criticalCount} crítico(s))` : ''}. Por favor, registra los desvíos.`,
          });
        } catch (error) {
          logger.error('Error fetching deviations or supervisors', { data: { error } });
          const { toast } = await import('sonner');
          toast.success('Checklist guardado', {
            description: `Se detectaron ${allFailedItems.length} item(s) con fallos`,
          });

          // Si no se puede cargar el modal, redirigir a la lista de respuestas
          setTimeout(() => {
            router.push(getChecklistRedirectPath(pathname, data.equipment_id));
            queryClient.invalidateQueries();
            router.refresh();
          }, 1500);
        }
      } else {
        const { toast } = await import('sonner');
        toast.success('Checklist guardado correctamente');
        setShowAllGoodPrompt(true);
      }
    } catch (error) {
      logger.error('Error al guardar el checklist', { data: { error } });
      // TODO: Mostrar toast de error
    } finally {
      setIsSubmitting(false);
    }
  };
  return {
    onSubmit,
    isSubmitting,
    criticalItemsFailed,
    setCriticalItemsFailed,
    showDeviationsModal,
    setShowDeviationsModal,
    pendingDeviations,
    setPendingDeviations,
    hitchDeviationIds,
    showAllGoodPrompt,
    setShowAllGoodPrompt,
    currentEquipmentId,
    setCurrentEquipmentId,
    createdAnswerId,
    setCreatedAnswerId,
  };
}
