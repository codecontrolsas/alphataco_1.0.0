import type { MaintenanceResourceKind } from '@/features/Mantenimiento/shared/maintenance-resource';
import { useCallback } from 'react';
import { toast } from 'sonner';
import type { RequestType } from '../components/nuevo-pedido/types';
import type { NewRequestData } from './useNewRequestData';
import type { NewRequestState } from './useNewRequestState';

interface ChecklistItemRef {
  id: string;
  code: string;
  label: string;
  is_critical: boolean | null;
}

/** Acciones del asistente que cambian de paso o reinician selecciones dependientes. */
export function useNewRequestHandlers(state: NewRequestState, data: NewRequestData) {
  const {
    requestType,
    deviationComments,
    manualRepairsRef,
    setCurrentStep,
    setSelectedEquipmentId,
    setKilometer,
    setEngineHours,
    setSelectedTemplateId,
    setSelectedDeviations,
    setDeviationComments,
    setManualItems,
    setManualRepairs,
    setSelectedSupervisorId,
    setEquipmentOpen,
    setResourceKind,
    setSearchTerm,
    setRequestType,
    setSelectedPreventiveType,
    setPreventiveDescription,
    setIsCurrentUserSupervisor,
  } = state;
  const { currentStepKey, resourceOptions } = data;

  /**
   * Avanza de paso guardando primero lo que quedo escrito en el formulario de reparaciones.
   * Antes, si el usuario escribia una reparacion y tocaba Siguiente sin "Agregar reparacion",
   * se perdia sin aviso.
   */
  const handleAdvanceStep = useCallback(() => {
    if (requestType === 'manual' && currentStepKey === 'items') {
      const result = manualRepairsRef.current?.commitPendingDraft();

      // Fotos (y/o descripcion) sin tarea ni texto libre: no se puede agregar la reparacion, pero
      // tampoco se descarta el trabajo en silencio. Se frena el avance y se dice que falta.
      if (result?.status === 'incomplete') {
        const cargado =
          result.imageCount > 0
            ? result.imageCount === 1
              ? 'Cargaste 1 foto'
              : `Cargaste ${result.imageCount} fotos`
            : 'Escribiste una descripción';
        toast.warning(`${cargado} pero falta elegir la tarea o escribir la reparación`, {
          description: 'Completala y tocá "Agregar reparación", o quitá lo cargado para continuar.',
        });
        return;
      }

      if (result?.status === 'added') {
        toast.info('Se agregó la reparación que habías escrito');
      }
    }
    setCurrentStep((prev) => prev + 1);
  }, [requestType, currentStepKey, manualRepairsRef, setCurrentStep]);

  const handleBackStep = useCallback(() => setCurrentStep((prev) => Math.max(0, prev - 1)), [setCurrentStep]);

  const handleSelectEquipment = useCallback(
    (equipId: string) => {
      // Se busca en la lista normalizada, no en `equipment`: esta última solo tiene vehículos y
      // dejaría sin efecto la selección de un equipamiento.
      const equip = resourceOptions.find((e) => e.id === equipId);
      if (equip) {
        setSelectedEquipmentId(equip.id);
        setKilometer(equip.kilometer || '');
        setEngineHours(equip.engineHours || '');
        // Reset estados posteriores
        setSelectedTemplateId('');
        setSelectedDeviations([]);
        setDeviationComments({});
        setManualItems([]);
        setManualRepairs([]);
        setSelectedSupervisorId('');
      }
      setEquipmentOpen(false);
    },
    [
      resourceOptions,
      setSelectedEquipmentId,
      setKilometer,
      setEngineHours,
      setSelectedTemplateId,
      setSelectedDeviations,
      setDeviationComments,
      setManualItems,
      setManualRepairs,
      setSelectedSupervisorId,
      setEquipmentOpen,
    ]
  );

  const handleSelectTemplate = useCallback(
    (templateId: string) => {
      setSelectedTemplateId(templateId);
      // Reset selecciones de desvíos
      setSelectedDeviations([]);
      setDeviationComments({});
      setManualItems([]);
    },
    [setSelectedTemplateId, setSelectedDeviations, setDeviationComments, setManualItems]
  );

  const handleToggleDeviation = useCallback(
    (item: ChecklistItemRef, sectionCode: string) => {
      setSelectedDeviations((prev) => {
        const exists = prev.find((d) => d.itemId === item.id);
        if (exists) {
          return prev.filter((d) => d.itemId !== item.id);
        }
        return [
          ...prev,
          {
            itemId: item.id,
            itemCode: item.code,
            itemLabel: item.label,
            sectionCode,
            isCritical: item.is_critical || false,
            comment: deviationComments[item.id] || undefined,
          },
        ];
      });
    },
    [deviationComments, setSelectedDeviations]
  );

  const handleUpdateComment = useCallback(
    (itemId: string, comment: string) => {
      setDeviationComments((prev) => ({ ...prev, [itemId]: comment }));
      // Actualizar también en selectedDeviations si existe
      setSelectedDeviations((prev) =>
        prev.map((d) => (d.itemId === itemId ? { ...d, comment: comment || undefined } : d))
      );
    },
    [setDeviationComments, setSelectedDeviations]
  );

  /**
   * Cambia entre equipo y equipamiento (ticket 596).
   *
   * Descarta la selección de recurso: el equipo elegido no existe en la otra lista. Y si el camino era
   * "Checklist" o "Mant. Preventivo" (que los equipamientos no tienen, ticket 654) se mueve la selección
   * a "Carga Manual", para que el radiogroup nunca quede anclado en una tarjeta bloqueada o inexistente.
   */
  const handleChangeResourceKind = useCallback(
    (kind: MaintenanceResourceKind) => {
      setResourceKind((current) => {
        if (current === kind) return current;
        setSelectedEquipmentId('');
        setKilometer('');
        setEngineHours('');
        setSearchTerm('');
        setSelectedTemplateId('');
        setSelectedDeviations([]);
        setDeviationComments({});
        setManualItems([]);
        if (kind === 'other_equipment') {
          setRequestType('manual');
          setSelectedPreventiveType('');
          setPreventiveDescription('');
        }
        return kind;
      });
    },
    [
      setResourceKind,
      setSelectedEquipmentId,
      setKilometer,
      setEngineHours,
      setSearchTerm,
      setSelectedTemplateId,
      setSelectedDeviations,
      setDeviationComments,
      setManualItems,
      setRequestType,
      setSelectedPreventiveType,
      setPreventiveDescription,
    ]
  );

  const handleChangeRequestType = useCallback(
    (type: RequestType) => {
      if (type === requestType) return;
      setRequestType(type);
      setSelectedTemplateId('');
      setSelectedPreventiveType('');
      setPreventiveDescription('');
      setSelectedDeviations([]);
      setDeviationComments({});
      setManualItems([]);
      setManualRepairs([]);
      setSelectedSupervisorId('');
      setIsCurrentUserSupervisor(null);
    },
    [
      requestType,
      setRequestType,
      setSelectedTemplateId,
      setSelectedPreventiveType,
      setPreventiveDescription,
      setSelectedDeviations,
      setDeviationComments,
      setManualItems,
      setManualRepairs,
      setSelectedSupervisorId,
      setIsCurrentUserSupervisor,
    ]
  );

  return {
    handleAdvanceStep,
    handleBackStep,
    handleSelectEquipment,
    handleSelectTemplate,
    handleToggleDeviation,
    handleUpdateComment,
    handleChangeResourceKind,
    handleChangeRequestType,
  };
}

export type NewRequestHandlers = ReturnType<typeof useNewRequestHandlers>;
