'use client';

import { cn } from '@/lib/utils';
import { Calendar, CheckCircle, ClipboardCheck, Clock, Eye, Inbox, Warehouse, type LucideIcon } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback } from 'react';
import type { PipelineCounts, PipelineStep } from '../types';

/** Mapa de nombres de iconos a componentes Lucide (resueltos en el cliente) */
const ICON_MAP: Record<string, LucideIcon> = {
  ClipboardCheck,
  Calendar,
  Warehouse,
  Eye,
  Clock,
  CheckCircle,
  Inbox,
};

interface WorkflowPipelineProps {
  steps: PipelineStep[];
  counts: PipelineCounts;
  activeStep: string;
  paramName: string;
  searchParams: Record<string, string | string[] | undefined>;
}

/**
 * Prefijos de parámetros de URL relacionados con tablas paginadas.
 * Al cambiar de paso se eliminan para evitar estado obsoleto entre pasos.
 */
const TABLE_PARAM_PREFIXES = ['page', 'pageSize', 'sort', 'filter', 'search', 'col', 'visibility'];

function hasTablePrefix(key: string): boolean {
  return TABLE_PARAM_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function buildStepUrl(
  pathname: string,
  searchParams: Record<string, string | string[] | undefined>,
  paramName: string,
  stepId: string
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (key === paramName) continue;
    if (hasTablePrefix(key)) continue;
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      value.forEach((v) => params.append(key, v));
    } else {
      params.set(key, value);
    }
  }

  params.set(paramName, stepId);

  const queryString = params.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}

function getChevronClipPath(index: number, total: number): string | undefined {
  if (total === 1) return undefined;
  if (index === 0) return 'polygon(0 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 0 100%)';
  if (index === total - 1) return 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 16px 50%)';
  return 'polygon(0 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 0 100%, 16px 50%)';
}

export function WorkflowPipeline({ steps, counts, activeStep, paramName, searchParams }: WorkflowPipelineProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleStepClick = useCallback(
    (stepId: string) => {
      if (stepId === activeStep) return;
      const url = buildStepUrl(pathname, searchParams, paramName, stepId);
      router.push(url, { scroll: false });
    },
    [activeStep, paramName, pathname, router, searchParams]
  );

  return (
    <div className="w-full overflow-x-auto snap-x snap-mandatory md:overflow-x-visible">
      <div className="flex md:grid md:grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-0 min-w-max md:min-w-0">
        {steps.map((step, index) => {
          const isActive = step.id === activeStep;
          const count = counts[step.id] ?? 0;
          const clipPath = getChevronClipPath(index, steps.length);
          const Icon = ICON_MAP[step.iconName];

          return (
            <button
              key={step.id}
              type="button"
              onClick={() => handleStepClick(step.id)}
              style={{ clipPath }}
              className={cn(
                'relative flex flex-col justify-center px-6 py-4 text-left transition-colors duration-150',
                'min-w-[200px] md:min-w-0',
                'snap-start',
                index > 0 && '-ml-3',
                isActive ? 'z-10' : 'z-0 hover:z-5',
                isActive ? 'bg-brand text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80 cursor-pointer'
              )}
              aria-current={isActive ? 'step' : undefined}
              aria-label={`Paso ${step.stepNumber}: ${step.label}`}
            >
              {/* Fila superior: número + ícono + badge de conteo */}
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5">
                  {Icon && (
                    <Icon className={cn('shrink-0', isActive ? 'text-white' : 'text-muted-foreground')} size={14} />
                  )}
                  <span className={cn('text-xs font-medium', isActive ? 'text-white/80' : 'text-muted-foreground/70')}>
                    Paso {step.stepNumber}
                  </span>
                </div>

                {/* Badge de conteo */}
                <span
                  className={cn(
                    'shrink-0 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold min-w-[24px]',
                    isActive ? 'bg-white text-brand-ink' : 'bg-brand text-white'
                  )}
                >
                  {count}
                </span>
              </div>

              {/* Etiqueta principal */}
              <span className={cn('font-bold text-sm leading-tight', isActive ? 'text-white' : '')}>{step.label}</span>

              {/* Descripción */}
              <span
                className={cn('text-xs mt-0.5 leading-tight', isActive ? 'text-white/80' : 'text-muted-foreground/70')}
              >
                {step.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
