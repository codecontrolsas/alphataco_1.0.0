'use client';

import { cn } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';
import type { PipelineStep } from '../../Pipeline/types';

interface PipelineStepsProps {
  steps: PipelineStep[];
  /** Pendientes por paso. `null` (o ausente) = no se pudo calcular: se muestra "—". */
  counts: Record<string, number | null>;
  /** Texto de atención por paso (por ejemplo "3 con más de 48 h"). `null` = nada que avisar. */
  attention?: Record<string, string | null>;
  activeStep: string;
  onStepClick: (id: string) => void;
}

/**
 * Pasos del circuito como tarjetas con número, nombre, descripción, contador y aviso de atención.
 * La navegación (URL, mostrar/ocultar) vive en `PipelineLayout`; esto solo dibuja.
 */
export function PipelineSteps({ steps, counts, attention, activeStep, onStepClick }: PipelineStepsProps) {
  return (
    <ul
      role="list"
      aria-label="Pasos del circuito"
      className="grid grid-cols-2 gap-2 max-md:gap-1.5 xl:auto-cols-fr xl:grid-flow-col xl:grid-cols-none"
    >
      {steps.map((step, index) => {
        const isActive = step.id === activeStep;
        const count = counts[step.id] ?? null;
        const warning = attention?.[step.id] ?? null;

        return (
          <li key={step.id} className="min-w-0">
            <button
              type="button"
              onClick={() => onStepClick(step.id)}
              aria-current={isActive ? 'step' : undefined}
              className={cn(
                'bg-card flex h-full w-full min-w-0 cursor-pointer items-start gap-3.5 rounded-xl border p-4 text-left transition-colors',
                'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
                'max-md:gap-2.5 max-md:p-3',
                isActive
                  ? 'border-brand bg-brand-subtle ring-brand/20 ring-[3px]'
                  : 'hover:border-brand/45'
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-[30px] shrink-0 items-center justify-center rounded-full font-mono text-[13px] font-semibold',
                  'max-md:size-6 max-md:text-xs',
                  isActive ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground'
                )}
              >
                {step.stepNumber ?? index + 1}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-sm leading-tight font-semibold max-md:text-[14px]">{step.label}</span>
                <span className="text-muted-foreground mt-0.5 block text-[13px] leading-snug max-md:hidden">
                  {step.description}
                </span>
                {warning ? (
                  <span className="bg-danger-subtle text-danger-subtle-foreground mt-2 inline-flex max-w-full items-center gap-1 rounded-full px-2 py-px text-xs font-semibold max-md:mt-1">
                    <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{warning}</span>
                  </span>
                ) : null}
              </span>

              <span className="ml-auto shrink-0 font-mono text-2xl leading-none font-semibold tabular-nums max-md:text-lg">
                {count == null ? (
                  <span role="img" aria-label="sin datos">
                    —
                  </span>
                ) : (
                  count
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
