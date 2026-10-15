import type { RequestType } from '../components/nuevo-pedido/types';
import type { StepKey } from './steps';

export interface CanAdvanceInput {
  stepKey: StepKey | undefined;
  requestType: RequestType;
  hasPendingManualDraft: boolean;
  hasOrphanManualDraft: boolean;
  selectedEquipmentId: string;
  selectedTemplateId: string;
  selectedPreventiveType: string;
  selectedDeviationCount: number;
  manualItemCount: number;
  manualRepairCount: number;
  selectedSupervisorId: string;
  isCurrentUserSupervisor: boolean | null;
}

/** Regla de "Siguiente" por paso: qué tiene que estar cargado para poder avanzar. */
export function canAdvanceStep(input: CanAdvanceInput): boolean {
  switch (input.stepKey) {
    case 'resource':
      // Siempre hay uno elegido (vehículo por defecto): el paso informa, no bloquea
      return true;
    case 'equipment':
      return !!input.selectedEquipmentId;
    case 'type':
      if (input.requestType === 'checklist') return !!input.selectedTemplateId;
      // La carga manual no elige nada en este paso: se avanza directo a cargar reparaciones
      if (input.requestType === 'manual') return true;
      return !!input.selectedPreventiveType;
    case 'items':
      // El borrador incompleto tambien habilita el boton: el click tiene que
      // llegar para poder avisar por que no se avanza (handleAdvanceStep).
      if (input.requestType === 'manual') {
        return input.manualRepairCount > 0 || input.hasPendingManualDraft || input.hasOrphanManualDraft;
      }
      return input.selectedDeviationCount > 0 || input.manualItemCount > 0;
    case 'supervisor':
      if (input.isCurrentUserSupervisor === null) return false;
      if (input.isCurrentUserSupervisor) return true;
      return !!input.selectedSupervisorId;
    default:
      return false;
  }
}
