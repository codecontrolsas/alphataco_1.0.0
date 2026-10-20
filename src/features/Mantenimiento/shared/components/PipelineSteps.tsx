'use client';

import { cn } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';
import type { PipelineStep } from '../../Pipeline/types';

interface PipelineStepsProps {
  steps: PipelineStep[];
  /** Pendientes por pestaña. `null` (o ausente) = no se pudo calcular: se muestra "—". */
  counts: Record<string, number | null>;
  /** Texto de atención por pestaña (por ejemplo "3 con más de 48 h"). `null` = nada que avisar. */
  attention?: Record<string, string | null>;
  activeStep: string;
  onStepClick: (id: string) => void;
  /** Prefijo de los `id` de pestaña y panel (`<prefix>-tab-<id>`, `<prefix>-panel-<id>`). */
  idPrefix: string;
}

/**
 * Pestañas del circuito con contador y aviso de atención (patrón APG de tabs: flechas, Inicio y Fin
 * mueven la selección; solo la pestaña activa entra en el orden de Tab).
 * La navegación (URL, mostrar/ocultar paneles) vive en `PipelineLayout`; esto solo dibuja.
 */
export function PipelineSteps({ steps, counts, attention, activeStep, onStepClick, idPrefix }: PipelineStepsProps) {
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = steps.length - 1;
    const target =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (target === null) return;

    event.preventDefault();
    const next = steps[target];
    onStepClick(next.id);
    tabRefs.current[next.id]?.focus();
  };

  return (
    <div role="tablist" aria-label="Secciones" className="border-border flex min-w-0 gap-1 overflow-x-auto border-b">
      {steps.map((step, index) => {
        const isActive = step.id === activeStep;
        const count = counts[step.id] ?? null;
        const warning = attention?.[step.id] ?? null;

        return (
          <button
            key={step.id}
            ref={(node) => {
              tabRefs.current[step.id] = node;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${step.id}`}
            aria-selected={isActive}
            aria-controls={`${idPrefix}-panel-${step.id}`}
            tabIndex={isActive ? 0 : -1}
            title={step.description}
            onClick={() => onStepClick(step.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              '-mb-px flex shrink-0 cursor-pointer items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
              'focus-visible:outline-ring focus-visible:outline-2 focus-visible:-outline-offset-2',
              isActive
                ? 'border-brand text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:border-border border-transparent'
            )}
          >
            {step.label}
            <span
              className={cn(
                'min-w-6 rounded-full px-1.5 py-px text-center font-mono text-xs font-semibold tabular-nums',
                isActive ? 'bg-brand-subtle text-brand-subtle-foreground' : 'bg-muted text-muted-foreground'
              )}
            >
              {count == null ? (
                <span role="img" aria-label="sin datos">
                  —
                </span>
              ) : (
                count
              )}
            </span>
            {warning ? (
              <span className="bg-danger-subtle text-danger-subtle-foreground inline-flex max-w-48 items-center gap-1 rounded-full px-2 py-px text-xs font-semibold">
                <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{warning}</span>
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
