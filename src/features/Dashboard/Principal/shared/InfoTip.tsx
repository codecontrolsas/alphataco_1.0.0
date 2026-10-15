'use client';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import type { ReactNode } from 'react';

interface InfoTipProps {
  /** Nombre accesible del botón, p. ej. «Cómo se calcula Operatividad». */
  label: string;
  /** Texto de la explicación. */
  children: ReactNode;
}

/**
 * Explicación de cómo se calcula una cifra. El disparador es un botón real: se llega con Tab, abre
 * con el foco y cierra con Escape, a diferencia de un tooltip colgado de una tarjeta no enfocable.
 */
export function InfoTip({ label, children }: InfoTipProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex size-5 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2"
          >
            <Info className="size-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{children}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
