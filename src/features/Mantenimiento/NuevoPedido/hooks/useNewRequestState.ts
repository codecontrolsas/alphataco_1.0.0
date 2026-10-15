import type { ManualItem } from '@/features/Mantenimiento/shared/components/ManualItemsInput';
import type {
  ManualRepair,
  ManualRepairDraftState,
  ManualRepairsInputHandle,
} from '@/features/Mantenimiento/shared/components/ManualRepairsInput';
import type { MaintenanceResourceKind } from '@/features/Mantenimiento/shared/maintenance-resource';
import type { PreventiveType } from '@/features/Mantenimiento/shared/preventive-maintenance';
import { useCallback, useRef, useState } from 'react';
import type { RequestType, SelectedDeviation } from '../components/nuevo-pedido/types';

/** Resultado de la última creación: lo que se registró, con números, para la pantalla final. */
export interface NewRequestCompletion {
  createdByCurrentSupervisor: boolean;
  itemCount: number;
  itemNoun: string;
  equipmentLabel: string | null;
  supervisorName: string | null;
}

export interface NewRequestStateParams {
  defaultEquipmentId?: string;
  defaultKilometer?: string | null;
  defaultEngineHours?: string | null;
  skipSupervisorQuestion: boolean;
}

/** Todo el estado del asistente "Nuevo Pedido" (los datos que se van cargando paso a paso). */
export function useNewRequestState({
  defaultEquipmentId,
  defaultKilometer,
  defaultEngineHours,
  skipSupervisorQuestion,
}: NewRequestStateParams) {
  // Estado del paso actual (0-indexed)
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Se arma ANTES de reiniciar los pasos, porque el resumen sale del estado del formulario.
  const [completion, setCompletion] = useState<NewRequestCompletion | null>(null);

  // Tipo de recurso (ticket 596): define qué se lista en el selector del paso Equipo
  const [resourceKind, setResourceKind] = useState<MaintenanceResourceKind>('vehicle');

  // Tipo de pedido
  const [requestType, setRequestType] = useState<RequestType>('checklist');
  const [selectedPreventiveType, setSelectedPreventiveType] = useState<PreventiveType | ''>('');
  const [preventiveDescription, setPreventiveDescription] = useState<string>('');

  // Paso 1: Selección de equipo
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string>(defaultEquipmentId || '');
  const [equipmentOpen, setEquipmentOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [kilometer, setKilometer] = useState(defaultKilometer || '');
  const [engineHours, setEngineHours] = useState(defaultEngineHours || '');

  // Paso 2: Selección de checklist
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  // Paso 3: Selección de items/desvíos
  const [selectedDeviations, setSelectedDeviations] = useState<SelectedDeviation[]>([]);
  const [deviationComments, setDeviationComments] = useState<Record<string, string>>({});
  const [manualItems, setManualItems] = useState<ManualItem[]>([]);

  // Paso 3 (carga manual): reparaciones cargadas directamente, sin checklist
  const [manualRepairs, setManualRepairs] = useState<ManualRepair[]>([]);
  // El borrador de reparacion vive dentro de ManualRepairsInput; este ref permite
  // guardarlo al avanzar en vez de descartarlo en silencio.
  const manualRepairsRef = useRef<ManualRepairsInputHandle>(null);
  // Habilita "Siguiente" cuando hay una reparacion escrita sin agregar: al avanzar se guarda sola.
  const [hasPendingManualDraft, setHasPendingManualDraft] = useState(false);
  // Hay fotos/descripcion cargadas sin titulo. Tambien habilita "Siguiente", pero
  // para poder EXPLICAR por que no avanza: con el boton deshabilitado el click no llegaba.
  const [hasOrphanManualDraft, setHasOrphanManualDraft] = useState(false);

  const handleManualDraftStateChange = useCallback((state: ManualRepairDraftState) => {
    setHasPendingManualDraft(state.canAdd);
    setHasOrphanManualDraft(state.hasOrphanContent);
  }, []);

  // Paso 4: Selección de supervisor
  const [selectedSupervisorId, setSelectedSupervisorId] = useState<string>('');
  const [supervisorOpen, setSupervisorOpen] = useState(false);
  // Indica si el usuario actual es el supervisor
  const [isCurrentUserSupervisor, setIsCurrentUserSupervisor] = useState<boolean | null>(
    skipSupervisorQuestion ? false : null
  );

  return {
    currentStep,
    setCurrentStep,
    isSubmitting,
    setIsSubmitting,
    completion,
    setCompletion,
    resourceKind,
    setResourceKind,
    requestType,
    setRequestType,
    selectedPreventiveType,
    setSelectedPreventiveType,
    preventiveDescription,
    setPreventiveDescription,
    selectedEquipmentId,
    setSelectedEquipmentId,
    equipmentOpen,
    setEquipmentOpen,
    searchTerm,
    setSearchTerm,
    kilometer,
    setKilometer,
    engineHours,
    setEngineHours,
    selectedTemplateId,
    setSelectedTemplateId,
    selectedDeviations,
    setSelectedDeviations,
    deviationComments,
    setDeviationComments,
    manualItems,
    setManualItems,
    manualRepairs,
    setManualRepairs,
    manualRepairsRef,
    hasPendingManualDraft,
    hasOrphanManualDraft,
    handleManualDraftStateChange,
    selectedSupervisorId,
    setSelectedSupervisorId,
    supervisorOpen,
    setSupervisorOpen,
    isCurrentUserSupervisor,
    setIsCurrentUserSupervisor,
  };
}

export type NewRequestState = ReturnType<typeof useNewRequestState>;
