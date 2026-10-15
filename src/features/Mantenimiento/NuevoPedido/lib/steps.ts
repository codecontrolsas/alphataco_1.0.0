import { AlertTriangle, Boxes, CheckCircle, ClipboardList, Truck, User, Wrench, type LucideIcon } from 'lucide-react';
import type { RequestType } from '../components/nuevo-pedido/types';

export type StepKey = 'resource' | 'equipment' | 'type' | 'items' | 'supervisor' | 'confirm';

export interface WizardStep {
  key: StepKey;
  title: string;
  icon: LucideIcon;
}

// El paso 'resource' (ticket 596) define qué se lista en el paso siguiente.
// El paso 'type' ya no se llama "Checklist": desde el ticket 592 también permite
// mantenimiento preventivo y carga manual.
const CHECKLIST_STEPS: WizardStep[] = [
  { key: 'resource', title: 'Recurso', icon: Boxes },
  { key: 'equipment', title: 'Equipo', icon: Truck },
  { key: 'type', title: 'Tipo', icon: ClipboardList },
  { key: 'items', title: 'Items', icon: AlertTriangle },
  { key: 'supervisor', title: 'Supervisor', icon: User },
  { key: 'confirm', title: 'Confirmar', icon: CheckCircle },
];

const PREVENTIVE_STEPS: WizardStep[] = [
  { key: 'resource', title: 'Recurso', icon: Boxes },
  { key: 'equipment', title: 'Equipo', icon: Truck },
  { key: 'type', title: 'Preventivo', icon: Wrench },
  { key: 'supervisor', title: 'Supervisor', icon: User },
  { key: 'confirm', title: 'Confirmar', icon: CheckCircle },
];

const MANUAL_STEPS: WizardStep[] = [
  { key: 'resource', title: 'Recurso', icon: Boxes },
  { key: 'equipment', title: 'Equipo', icon: Truck },
  { key: 'type', title: 'Tipo', icon: ClipboardList },
  { key: 'items', title: 'Reparaciones', icon: Wrench },
  { key: 'supervisor', title: 'Supervisor', icon: User },
  { key: 'confirm', title: 'Confirmar', icon: CheckCircle },
];

/**
 * Pasos del asistente según el camino elegido. Con el equipo ya fijado por prop (flujo QR:
 * se escanea el equipo y se entra directo) el paso "Recurso" se omite: la respuesta ya está implícita.
 */
export function getWizardSteps(requestType: RequestType, hasDefaultEquipment: boolean): WizardStep[] {
  const steps =
    requestType === 'preventive' ? PREVENTIVE_STEPS : requestType === 'manual' ? MANUAL_STEPS : CHECKLIST_STEPS;
  return hasDefaultEquipment ? steps.filter((step) => step.key !== 'resource') : steps;
}
