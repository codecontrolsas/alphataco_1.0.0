import { HseStatusBadge } from '@/features/Hse/components/HseStatusBadge';
import { HSE_TRAINING_KIND_LABELS } from '@/features/Hse/lib/constants';
import { HSE_ASSIGNMENT_STATUS_UI } from '@/features/Hse/lib/status-presentation';
import type { PortalHseTraining } from '@/features/Portal/actions/hse-trainings.queries';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { ChevronRight } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';

/** Qué tiene que hacer el empleado con esta capacitación, en una línea. */
function nextStep(t: PortalHseTraining): string {
  switch (t.status) {
    case 'passed':
      if (t.certificatePending) return 'Aprobada · falta firmar tu constancia';
      return t.validUntil
        ? `Aprobada · vigente hasta el ${moment(t.validUntil, 'YYYY-MM-DD').format('DD/MM/YYYY')}`
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
      return `Lista para rendir · ${t.attemptsLeft} intento${t.attemptsLeft === 1 ? '' : 's'}`;
  }
}

/** Tarjeta de una capacitación del empleado: toda la tarjeta es el enlace (área táctil grande). */
export function HseTrainingCard({ training }: { training: PortalHseTraining }) {
  return (
    <Link
      href={`/portal/trainings/${training.trainingId}`}
      className="bg-card hover:bg-muted/40 focus-visible:ring-ring flex min-h-16 items-center gap-3 rounded-xl border p-4 outline-none focus-visible:ring-2"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <HseStatusBadge ui={HSE_ASSIGNMENT_STATUS_UI[training.status]} />
        <p className="font-medium text-pretty break-words">{training.title}</p>
        <p className="text-muted-foreground text-sm text-pretty">
          {HSE_TRAINING_KIND_LABELS[training.kind]} · {nextStep(training)}
        </p>
      </div>
      <ChevronRight aria-hidden="true" className="text-muted-foreground size-5 shrink-0" />
    </Link>
  );
}
