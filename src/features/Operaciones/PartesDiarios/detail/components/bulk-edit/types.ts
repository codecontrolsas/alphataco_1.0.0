export interface StatusOption {
  value: string;
  label: string;
}

export const BASE_OPTIONS: StatusOption[] = [
  { value: 'ejecutado', label: 'Ejecutado' },
  { value: 'cancelado', label: 'Cancelado' },
  { value: 'reprogramado', label: 'Reprogramado' },
];

export const OPT_DIURNO: StatusOption = { value: 'completar_diurno', label: 'Completar Diurno' };
export const OPT_NOCTURNO: StatusOption = { value: 'completar_nocturno', label: 'Completar Nocturno' };

export type SectionKey = '24hs' | 'completar-diurno' | 'completar-nocturno' | 'otras';

export interface SectionState {
  status: string;
  cancelReason: string;
  rescheduleDate: Date | undefined;
}

export const EMPTY_SECTION: SectionState = {
  status: '',
  cancelReason: '',
  rescheduleDate: undefined,
};

/** Validación por sección: estado elegido y, según el estado, motivo de cancelación o fecha de reprogramación. */
export function isSectionValid(section: SectionState) {
  if (!section.status) return false;
  if (section.status === 'cancelado' && !section.cancelReason.trim()) return false;
  if (section.status === 'reprogramado' && !section.rescheduleDate) return false;
  return true;
}
