import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import type { PreEmployeeStatus } from '../lib/state-machine';

const STEPS = [
  { status: 'en_proceso', label: 'En proceso', hint: 'Datos y documentos' },
  { status: 'pre_ingreso', label: 'Pre ingreso', hint: 'A decidir' },
  { status: 'legajo', label: 'Legajo creado', hint: 'Empleado dado de alta' },
] as const satisfies readonly { status: PreEmployeeStatus; label: string; hint: string }[];

type StepState = 'done' | 'current' | 'rejected' | 'pending';

/** Estado de cada paso del circuito. Un rechazo se marca en el paso donde se decide (pre ingreso). */
function stepStates(status: PreEmployeeStatus): StepState[] {
  if (status === 'legajo') return ['done', 'done', 'done'];
  if (status === 'rechazado') return ['done', 'rejected', 'pending'];
  if (status === 'pre_ingreso') return ['done', 'current', 'pending'];
  return ['current', 'pending', 'pending'];
}

/** Circuito de ingreso: en qué etapa está el candidato y cuáles faltan. */
export function PreEmployeeStepper({ status }: { status: PreEmployeeStatus }) {
  const states = stepStates(status);

  return (
    <ol
      className="bg-card flex flex-wrap items-center gap-y-3 rounded-xl border px-5 py-4"
      aria-label="Circuito de ingreso"
    >
      {STEPS.map((step, index) => {
        const state = states[index];
        return (
          <li
            key={step.status}
            className="flex flex-1 items-center gap-3 last:flex-none"
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-full border-2 font-mono text-xs font-semibold',
                state === 'done' && 'border-ok bg-ok text-white',
                state === 'current' && 'border-brand bg-brand-subtle text-brand-subtle-foreground',
                state === 'rejected' && 'border-danger bg-danger-subtle text-danger-subtle-foreground',
                state === 'pending' && 'border-input bg-card text-muted-foreground'
              )}
            >
              {state === 'done' ? (
                <Check className="size-3.5" strokeWidth={3} />
              ) : state === 'rejected' ? (
                '!'
              ) : (
                index + 1
              )}
            </span>
            <span
              className={cn('text-sm leading-tight', state === 'pending' ? 'text-muted-foreground' : 'font-semibold')}
            >
              {state === 'rejected' ? 'Rechazado' : step.label}
              <span className="text-muted-foreground block font-normal">
                {state === 'rejected' ? 'No ingresó' : step.hint}
              </span>
            </span>
            {index < STEPS.length - 1 && (
              <span
                className={cn(
                  'mx-2 hidden h-0.5 min-w-8 flex-1 sm:block',
                  states[index + 1] === 'pending' || states[index + 1] === 'rejected' ? 'bg-border' : 'bg-ok'
                )}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
