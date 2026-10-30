import type { StatusUi } from '@/features/Mantenimiento/lib/status-presentation';
import type { PortalHseTraining } from '@/features/Portal/actions/hse-trainings.queries';
import { formatArgentinaDay, formatDateAr } from '@/shared/lib/argentina-time';
import { CheckCircle2, FileSignature, XCircle } from 'lucide-react';

/** Aprobada con la constancia todavía sin firmar (no es un estado de la base: se deriva de la aprobación vigente). */
export const CERTIFICATE_PENDING_UI: StatusUi = { label: 'Constancia por firmar', tone: 'brand', icon: FileSignature };

/** Resultado de un intento cerrado (la base guarda `passed`; no hay mapa de estados para esto en HSE). */
export const ATTEMPT_RESULT_UI = {
  passed: { label: 'Aprobado', tone: 'ok', icon: CheckCircle2 },
  failed: { label: 'Desaprobado', tone: 'danger', icon: XCircle },
} as const satisfies Record<string, StatusUi>;

/** Qué tiene que hacer el empleado con esta capacitación, en una línea (listas e inicio). */
export function trainingNextStep(t: PortalHseTraining): string {
  switch (t.status) {
    case 'passed':
      if (t.certificatePending) return 'Aprobada · falta firmar tu constancia';
      return t.validUntil
        ? `Aprobada · vigente hasta el ${formatDateAr(t.validUntil)}`
        : `Aprobada${t.passedAt ? ` el ${formatArgentinaDay(t.passedAt)}` : ''}`;
    case 'expired':
      return 'Tu aprobación venció: tenés que volver a rendir';
    case 'in_progress':
      return 'Tenés un examen empezado: retomalo';
    case 'failed':
      return 'No te quedan intentos: consultá con el área de HSE';
    default:
      if (t.requiredMaterials > t.requiredRead) {
        const left = t.requiredMaterials - t.requiredRead;
        return left === 1 ? 'Falta leer 1 material obligatorio' : `Faltan leer ${left} materiales obligatorios`;
      }
      return `Lista para rendir · ${t.attemptsLeft === 1 ? 'te queda 1 intento' : `te quedan ${t.attemptsLeft} intentos`}`;
  }
}
