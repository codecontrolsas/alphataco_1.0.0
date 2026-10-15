import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

const STEPS = [
  { label: 'Datos', value: 'form' },
  { label: 'Verificación', value: 'conflicts' },
  { label: 'Resultado', value: 'results' },
] as const;

interface Props {
  currentStep: (typeof STEPS)[number]['value'];
}

/** Pasos de la carga masiva: barra segmentada con el paso actual resaltado (entra en 390 px). */
export function StepIndicator({ currentStep }: Props) {
  const currentIndex = STEPS.findIndex((s) => s.value === currentStep);

  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Pasos de la carga masiva">
      {STEPS.map((step, index) => {
        const isActive = index === currentIndex;
        const isCompleted = index < currentIndex;
        return (
          <li key={step.value} aria-current={isActive ? 'step' : undefined} className="min-w-0 space-y-1.5">
            <span
              className={cn('block h-1.5 rounded-full', isActive ? 'bg-brand' : isCompleted ? 'bg-ok' : 'bg-muted')}
            />
            <span
              className={cn(
                'flex min-w-0 items-center gap-1 text-xs sm:text-sm',
                isActive ? 'text-foreground font-medium' : 'text-muted-foreground'
              )}
            >
              {isCompleted ? <Check aria-hidden="true" className="text-ok size-3.5 shrink-0" /> : null}
              <span className="truncate">
                {index + 1}. {step.label}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
