'use client';

import { SectionErrorBoundary } from '@/shared/components/common/SectionErrorBoundary';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { PipelineSteps } from '../../shared/components/PipelineSteps';
import type { PipelineStep, PipelineSummary } from '../types';

/**
 * Prefijos de parámetros de URL relacionados con tablas paginadas.
 * Al cambiar de paso se eliminan para evitar estado obsoleto entre pasos.
 */
const TABLE_PARAM_PREFIXES = ['page', 'pageSize', 'sort', 'filter', 'search', 'col', 'visibility'];

function hasTablePrefix(key: string): boolean {
  return TABLE_PARAM_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export interface PipelineStepEntry {
  id: string;
  content: ReactNode;
}

/** Contadores y atención de la cabecera: se hidratan con lo que calculó el servidor y se refrescan solos. */
export interface PipelineSummaryQuery {
  queryKey: readonly unknown[];
  queryFn: () => Promise<PipelineSummary>;
  initialData: PipelineSummary;
}

/** Los contadores se consideran frescos 30 s; `invalidateAllMaintenanceQueries` (prefijo `['maintenance']`) los fuerza. */
const SUMMARY_STALE_TIME_MS = 30_000;

interface PipelineLayoutProps {
  steps: PipelineStep[];
  summaryQuery: PipelineSummaryQuery;
  initialStep: string;
  paramName: string;
  stepContents: PipelineStepEntry[];
}

/**
 * Client component que gestiona la navegación del pipeline.
 *
 * Patrón:
 * - Paso inicial leído del servidor (searchParams)
 * - Estado local (useState) para cambios instantáneos
 * - replaceState para actualizar la URL sin navegación Next.js
 * - TODOS los pasos se renderizan simultáneamente, show/hide con CSS
 */
export function PipelineLayout({ steps, summaryQuery, initialStep, paramName, stepContents }: PipelineLayoutProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: summary } = useQuery({
    queryKey: summaryQuery.queryKey,
    // Arrow: React Query le pasa un contexto (con un AbortSignal) que no se puede serializar hacia la server action.
    queryFn: () => summaryQuery.queryFn(),
    initialData: summaryQuery.initialData,
    staleTime: SUMMARY_STALE_TIME_MS,
  });
  // Leer la URL actual al montar (fuente de verdad), no el prop del servidor que puede
  // estar stale si el componente se desmontó/remontó por cambio de sección.
  const [activeStep, setActiveStep] = useState(() => {
    if (typeof window !== 'undefined') {
      const urlStep = new URLSearchParams(window.location.search).get(paramName);
      if (urlStep && steps.some((s) => s.id === urlStep)) return urlStep;
    }
    return initialStep;
  });

  // Sincronizar si searchParams cambia externamente (botón atrás/adelante del browser)
  useEffect(() => {
    const urlStep = searchParams.get(paramName);
    if (urlStep && urlStep !== activeStep && steps.some((s) => s.id === urlStep)) {
      setActiveStep(urlStep);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleStepClick = useCallback(
    (stepId: string) => {
      if (stepId === activeStep) return;

      // 1. Actualización instantánea de UI
      setActiveStep(stepId);

      // 2. Actualización silenciosa de URL (sin roundtrip al servidor)
      const params = new URLSearchParams(window.location.search);

      // Limpiar params de tablas del paso anterior
      for (const key of Array.from(params.keys())) {
        if (hasTablePrefix(key)) params.delete(key);
      }

      params.set(paramName, stepId);
      window.history.replaceState(null, '', `${pathname}?${params.toString()}`);
    },
    [activeStep, paramName, pathname]
  );

  return (
    // pt-4: separa los pasos del encabezado de la sección.
    <div className="pt-4 space-y-6">
      <PipelineSteps
        steps={steps}
        counts={summary.counts}
        attention={summary.attention}
        activeStep={activeStep}
        onStepClick={handleStepClick}
      />

      {stepContents.map(({ id, content }) => (
        <div key={id} className={activeStep === id ? undefined : 'hidden'}>
          {/* Un error de render en un paso no tumba a los demás. */}
          <SectionErrorBoundary title={`No se pudo mostrar el paso "${steps.find((s) => s.id === id)?.label ?? id}"`}>
            {content}
          </SectionErrorBoundary>
        </div>
      ))}
    </div>
  );
}
