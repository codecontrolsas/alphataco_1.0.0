import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Check, Plus } from 'lucide-react';
import type { WizardStep } from '../../lib/steps';

interface WizardProgressProps {
  steps: WizardStep[];
  currentStep: number;
}

/** Progreso en móvil: un paso por pantalla, con barra accesible. */
export function WizardProgressBar({ steps, currentStep }: WizardProgressProps) {
  return (
    <div className="space-y-2 lg:hidden">
      <div
        role="progressbar"
        aria-label="Progreso del pedido"
        aria-valuemin={1}
        aria-valuemax={steps.length}
        aria-valuenow={currentStep + 1}
        aria-valuetext={`Paso ${currentStep + 1} de ${steps.length}: ${steps[currentStep].title}`}
        className="flex gap-1"
      >
        {steps.map((step, index) => (
          <span
            key={step.key}
            className={cn('h-1.5 flex-1 rounded-full', index <= currentStep ? 'bg-primary' : 'bg-muted')}
          />
        ))}
      </div>
      <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
        Paso {currentStep + 1} de {steps.length} · {steps[currentStep].title}
      </p>
    </div>
  );
}

/** Stepper lateral (escritorio). */
export function WizardStepper({ steps, currentStep }: WizardProgressProps) {
  return (
    <Card className="hidden h-fit lg:col-span-1 lg:block">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus aria-hidden="true" className="h-5 w-5" />
          Nuevo Pedido
        </CardTitle>
        <CardDescription>Crea un pedido desde items de checklist</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2">
          {steps.map((step, index) => {
            const StepIcon = step.icon;
            const isCompleted = index < currentStep;
            const isCurrent = index === currentStep;

            return (
              <li
                key={step.key}
                aria-current={isCurrent ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-3 p-2 rounded-lg transition-all',
                  isCurrent && 'bg-primary/10',
                  isCompleted && 'text-primary'
                )}
              >
                <div
                  className={cn(
                    'h-8 w-8 rounded-full flex items-center justify-center border-2',
                    isCurrent && 'border-primary bg-primary text-primary-foreground',
                    isCompleted && 'border-primary bg-primary text-primary-foreground',
                    !isCurrent && !isCompleted && 'border-muted-foreground/30'
                  )}
                >
                  {isCompleted ? (
                    <Check aria-hidden="true" className="h-4 w-4" />
                  ) : (
                    <StepIcon aria-hidden="true" className="h-4 w-4" />
                  )}
                </div>
                <span className={cn('text-sm font-medium', !isCurrent && !isCompleted && 'text-muted-foreground')}>
                  {step.title}
                  {isCompleted && <span className="sr-only"> (completado)</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
