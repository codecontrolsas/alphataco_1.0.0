'use client';

import { Button } from '@/components/ui/button';
import { getMyHseEvaluationPdf } from '@/features/Portal/actions/hse-evaluations.server';
import { Download, Loader2 } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { getHseAttemptEvaluationPdf } from '../actions/trainings.server';
import { deliverHsePdf } from '../lib/pdf-delivery';

/**
 * Descarga la hoja de evaluación de un intento cerrado. `dashboard`: con el detalle por pregunta (permiso de
 * capacitaciones). `portal`: la constancia de resultado propia, sin detalle. El PDF se arma en el servidor.
 * Sin React Query a propósito: el portal no tiene el provider (usa transiciones, como la constancia).
 */
export function HseEvaluationPdfButton({
  attemptId,
  scope,
  label = 'Descargar PDF',
  accessibleLabel,
  variant = 'outline',
  size = 'default',
}: {
  attemptId: string;
  scope: 'dashboard' | 'portal';
  label?: string;
  /** Nombre accesible más específico (por ejemplo, el número de intento). */
  accessibleLabel?: string;
  variant?: 'outline' | 'ghost' | 'default';
  size?: 'default' | 'sm';
}) {
  const [isPending, startTransition] = useTransition();
  const download = () =>
    startTransition(async () => {
      const result =
        scope === 'dashboard'
          ? await getHseAttemptEvaluationPdf(attemptId)
          : await getMyHseEvaluationPdf({ attemptId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      deliverHsePdf(result.data);
    });
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={size === 'sm' ? 'min-h-11 sm:min-h-8' : 'min-h-11 sm:min-h-9'}
      disabled={isPending}
      aria-busy={isPending}
      aria-label={accessibleLabel}
      onClick={download}
    >
      {isPending ? (
        <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
      ) : (
        <Download aria-hidden="true" className="size-4" />
      )}
      {isPending ? 'Preparando…' : label}
    </Button>
  );
}
