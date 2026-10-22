import { fetchSupervisorsForResource } from '@/features/Checklists/actions/actionsServer';
import {
  fetchAllEquipmentBasicData,
  fetchAllOtherEquipmentBasicData,
} from '@/features/Mantenimiento/actions/equipment-basic';
import { normalizeSearchText } from '@/shared/utils/search-text';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getChecklistTemplatesForEquipment, getCurrentUserForSupervisorCheck } from '../actions/queries.server';
import { MAX_RESOURCE_RESULTS } from '../components/nuevo-pedido/SelectableCard';
import { REQUEST_TYPE_ORDER, type ResourceOption } from '../components/nuevo-pedido/types';
import { getWizardSteps } from '../lib/steps';
import type { NewRequestState } from './useNewRequestState';

interface NewRequestDataParams {
  state: NewRequestState;
  equipment: Awaited<ReturnType<typeof fetchAllEquipmentBasicData>>;
  defaultEquipmentId?: string;
}

/** Consultas y datos derivados del asistente: recursos elegibles, pasos, plantillas, usuario y supervisores. */
export function useNewRequestData({ state, equipment, defaultEquipmentId }: NewRequestDataParams) {
  const {
    resourceKind,
    requestType,
    searchTerm,
    selectedEquipmentId,
    selectedTemplateId,
    selectedSupervisorId,
    currentStep,
    isCurrentUserSupervisor,
  } = state;
  const isOtherEquipment = resourceKind === 'other_equipment';

  /**
   * Tarjetas de "Tipo de pedido" que se ofrecen para el recurso elegido.
   * Los equipamientos no tienen programa preventivo (ticket 654).
   */
  const visibleRequestTypes = useMemo(
    () => (isOtherEquipment ? REQUEST_TYPE_ORDER.filter((type) => type !== 'preventive') : REQUEST_TYPE_ORDER),
    [isOtherEquipment]
  );

  // Equipamientos (ticket 596). Solo se piden al elegir ese camino.
  const {
    data: otherEquipment = [],
    isLoading: isLoadingOtherEquipment,
    isError: hasOtherEquipmentError,
    refetch: refetchOtherEquipment,
  } = useQuery({
    queryKey: ['other-equipment-basic'],
    queryFn: () => fetchAllOtherEquipmentBasicData(),
    enabled: isOtherEquipment,
    staleTime: 5 * 60 * 1000,
  });

  /**
   * Lista normalizada de recursos elegibles.
   *
   * Vehículos y equipamientos se identifican distinto (dominio vs número de serie) y se miden
   * distinto (kilometraje vs solo horómetro). Normalizarlos acá evita repetir ese condicional
   * en el selector, en la tarjeta de resumen y en los campos de medición.
   */
  const resourceOptions = useMemo<ResourceOption[]>(() => {
    if (isOtherEquipment) {
      return otherEquipment.map((e) => ({
        id: e.id,
        label: e.serial_number || e.intern_number || 'Sin identificar',
        internNumber: e.intern_number,
        typeName: e.type_name,
        subTypeName: e.sub_type_name,
        unitTypeName: null as string | null,
        condition: e.condition,
        kilometer: null as string | null,
        engineHours: e.engine_hours,
      }));
    }
    return (equipment ?? []).map((e) => ({
      id: e.id,
      label: e.domain || e.serie || 'Sin identificar',
      internNumber: e.intern_number,
      typeName: e.type_name,
      subTypeName: e.sub_type_name,
      unitTypeName: e.types_of_vehicles?.name ?? null,
      condition: e.condition,
      kilometer: e.kilometer,
      engineHours: e.engine_hours,
    }));
  }, [isOtherEquipment, otherEquipment, equipment]);

  const selectedEquipment = useMemo(
    () => resourceOptions.find((e) => e.id === selectedEquipmentId),
    [resourceOptions, selectedEquipmentId]
  );

  /**
   * Búsqueda del selector de recursos (ticket 651): identificador, número interno y los campos de
   * descripción que la lista muestra (tipo, subtipo y tipo de unidad). Por tokens y sin tildes:
   * "grua hidro" encuentra "Grúa Hidráulica" aunque las palabras estén en campos distintos.
   */
  const { visible: filteredEquipment, total: totalMatchingResources } = useMemo(() => {
    const tokens = normalizeSearchText(searchTerm).split(/\s+/).filter(Boolean);
    const matches =
      tokens.length === 0
        ? resourceOptions
        : resourceOptions.filter((equip) => {
            const haystack = normalizeSearchText(
              [equip.label, equip.internNumber, equip.typeName, equip.subTypeName, equip.unitTypeName]
                .filter(Boolean)
                .join(' ')
            );
            return tokens.every((token) => haystack.includes(token));
          });
    // Se recorta para no renderizar cientos de filas de golpe; el total se conserva para avisar cuántas quedaron fuera.
    return { visible: matches.slice(0, MAX_RESOURCE_RESULTS), total: matches.length };
  }, [resourceOptions, searchTerm]);

  const steps = useMemo(() => getWizardSteps(requestType, !!defaultEquipmentId), [defaultEquipmentId, requestType]);
  const currentStepKey = steps[currentStep]?.key;
  const supervisorStepIndex = steps.findIndex((s) => s.key === 'supervisor');

  const {
    data: templates,
    isLoading: isLoadingTemplates,
    error: templatesError,
    refetch: refetchTemplates,
  } = useQuery({
    queryKey: ['checklist-templates-for-equipment', selectedEquipmentId],
    queryFn: () => getChecklistTemplatesForEquipment(selectedEquipmentId),
    enabled: !!selectedEquipmentId && currentStep >= 1,
  });

  const selectedTemplate = useMemo(
    () => templates?.find((t) => t.id === selectedTemplateId),
    [templates, selectedTemplateId]
  );

  // Usuario actual (para verificar si es supervisor)
  const { data: currentUser, isLoading: isLoadingCurrentUser } = useQuery({
    queryKey: ['current-user-for-supervisor'],
    queryFn: getCurrentUserForSupervisorCheck,
    enabled: supervisorStepIndex <= currentStep,
  });

  // Supervisores (solo cuando NO es supervisor). La lista sale de la empresa DEL RECURSO elegido, no de la
  // sesión: este formulario también se usa desde `/maintenance/equipment/[id]/request` (QR anónimo), donde no
  // hay empresa activa y resolverla por sesión dejaba el paso "Supervisor" vacío y sin poder avanzar.
  const {
    data: supervisors = [],
    isLoading: isLoadingSupervisors,
    isError: hasSupervisorsError,
    refetch: refetchSupervisors,
  } = useQuery({
    queryKey: ['supervisors-for-resource', resourceKind, selectedEquipmentId],
    queryFn: () => fetchSupervisorsForResource(resourceKind, selectedEquipmentId),
    enabled: !!selectedEquipmentId && supervisorStepIndex <= currentStep && isCurrentUserSupervisor === false,
  });

  const selectedSupervisor = useMemo(
    () => supervisors.find((s) => s.id === selectedSupervisorId),
    [supervisors, selectedSupervisorId]
  );

  return {
    isOtherEquipment,
    visibleRequestTypes,
    isLoadingOtherEquipment,
    hasOtherEquipmentError,
    refetchOtherEquipment,
    resourceOptions,
    selectedEquipment,
    filteredEquipment,
    totalMatchingResources,
    steps,
    currentStepKey,
    templates,
    isLoadingTemplates,
    templatesError,
    refetchTemplates,
    selectedTemplate,
    currentUser,
    isLoadingCurrentUser,
    supervisors,
    isLoadingSupervisors,
    hasSupervisorsError,
    refetchSupervisors,
    selectedSupervisor,
  };
}

export type NewRequestData = ReturnType<typeof useNewRequestData>;
