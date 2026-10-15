'use client';

import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

interface WizardStep {
  number: number;
  label: string;
}

const STEPS: WizardStep[] = [
  { number: 1, label: 'Desvíos' },
  { number: 2, label: 'Sectores' },
  { number: 3, label: 'Orden' },
  { number: 4, label: 'Confirmar' },
];

interface WizardStepIndicatorProps {
  currentStep: number;
}

export function WizardStepIndicator({ currentStep }: WizardStepIndicatorProps) {
  return (
    <nav aria-label="Pasos de la gestión de la orden">
      <ol className="mx-auto flex w-full max-w-md items-center justify-between">
        {STEPS.map((step, index) => {
          const isCompleted = currentStep > step.number;
          const isCurrent = currentStep === step.number;
          const isUpcoming = currentStep < step.number;
          const stateText = isCompleted ? 'completado' : isCurrent ? 'paso actual' : 'pendiente';

          return (
            <li
              key={step.number}
              aria-current={isCurrent ? 'step' : undefined}
              className="flex flex-1 items-center last:flex-none"
            >
              <div className="flex flex-col items-center gap-1">
                <div
                  aria-hidden="true"
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-all',
                    isCompleted && 'border-primary bg-primary text-primary-foreground',
                    isCurrent && 'border-primary bg-primary/10 text-primary',
                    isUpcoming && 'border-muted-foreground/30 text-muted-foreground'
                  )}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : step.number}
                </div>
                <span
                  className={cn(
                    'whitespace-nowrap text-[11px] font-medium',
                    isUpcoming ? 'text-muted-foreground' : 'text-primary'
                  )}
                >
                  {step.label}
                  <span className="sr-only"> ({stateText})</span>
                </span>
              </div>

              {index < STEPS.length - 1 && (
                <div
                  aria-hidden="true"
                  className={cn('mx-2 -mt-4 h-0.5 flex-1', isCompleted ? 'bg-primary' : 'bg-muted-foreground/20')}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
