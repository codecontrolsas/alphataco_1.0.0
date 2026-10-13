'use client';

import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { Check, ChevronDown, Lock } from 'lucide-react';
import type { ReactNode } from 'react';

export type StepStatus = 'done' | 'current' | 'locked';

/** Marcador del paso. Clases completas por estado (Tailwind v4). */
const MARKER_STYLES: Record<StepStatus, string> = {
  done: 'border-brand bg-brand text-brand-foreground',
  current: 'border-brand text-brand-ink',
  locked: 'border-border text-muted-foreground',
};

const STATUS_SR_TEXT: Record<StepStatus, string> = {
  done: '(completo)',
  current: '(paso actual)',
  locked: '(bloqueado)',
};

/**
 * Un paso del asistente del certificado, dentro de un `<ol>` (la secuencia es real). El paso
 * completo muestra su resumen y pliega el detalle; el bloqueado se ve con su motivo, no se oculta.
 * El título es enfocable (`tabIndex={-1}`) para mover el foco al paso siguiente al completar uno.
 */
export function CertificateWizardStep({
  number,
  total,
  title,
  headingId,
  status,
  lockedHint,
  summary,
  children,
  collapsedLabel,
  expandedLabel,
  open,
  onOpenChange,
  isLast,
}: {
  number: number;
  total: number;
  title: string;
  headingId: string;
  status: StepStatus;
  lockedHint: string;
  /** Lo que se ve siempre (si no está bloqueado). */
  summary?: ReactNode;
  /** Detalle del paso: abierto si es el actual, plegado si está completo. */
  children?: ReactNode;
  collapsedLabel?: string;
  expandedLabel?: string;
  /** Control externo del plegado (para "Renovar certificado"). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  isLast?: boolean;
}) {
  return (
    <li className="relative flex gap-4 pb-8 last:pb-0">
      {!isLast && <span aria-hidden className="bg-border absolute top-10 bottom-1 left-4 w-px" />}
      <span
        aria-hidden
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold tabular-nums',
          MARKER_STYLES[status]
        )}
      >
        {status === 'done' ? <Check className="size-4" /> : status === 'locked' ? <Lock className="size-4" /> : number}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-3 pt-1">
        <div className="flex flex-col gap-1">
          <h4
            id={headingId}
            tabIndex={-1}
            className={cn('font-semibold text-balance outline-none', status === 'locked' && 'text-muted-foreground')}
          >
            <span className="sr-only">
              Paso {number} de {total}:{' '}
            </span>
            {title} <span className="sr-only">{STATUS_SR_TEXT[status]}</span>
          </h4>
          {status === 'locked' && <p className="text-muted-foreground text-sm">{lockedHint}</p>}
        </div>

        {status !== 'locked' && summary}

        {status === 'current' && children}

        {status === 'done' && children && (
          <Collapsible open={open} onOpenChange={onOpenChange}>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="link" size="sm" className="group h-auto px-0">
                <span className="group-data-[state=open]:hidden">{collapsedLabel ?? 'Ver detalle'}</span>
                <span className="hidden group-data-[state=open]:inline">{expandedLabel ?? 'Ocultar detalle'}</span>
                <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" aria-hidden />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">{children}</CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </li>
  );
}
