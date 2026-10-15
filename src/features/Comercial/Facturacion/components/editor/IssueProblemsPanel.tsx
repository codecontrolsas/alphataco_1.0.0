'use client';

import { Button } from '@/components/ui/button';
import { AlertTriangle, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback } from 'react';
import type { IssueProblem } from '../../lib/invoice-validation';
import { FISCAL_DATA_HREF, countLabel } from '../../utils/invoice-links';
import { focusEditorField } from './editor-form';

/**
 * "Antes de emitir, corregí N cosas": checklist que aparece al tocar Emitir si falta algo. Recibe el
 * foco al montarse (`role="alert"`) y cada ítem lleva al campo. Los de configuración de la empresa
 * van a Datos fiscales.
 */
export function IssueProblemsPanel({ problems, onDismiss }: { problems: IssueProblem[]; onDismiss: () => void }) {
  // Callback estable: enfoca al montarse, no en cada render del padre. Para volver a enfocar con
  // una lista nueva, el padre le cambia la `key`.
  const focusOnMount = useCallback((node: HTMLDivElement | null) => node?.focus(), []);
  if (problems.length === 0) return null;
  return (
    <div
      role="alert"
      tabIndex={-1}
      ref={focusOnMount}
      className="flex flex-col gap-3 border border-warn/35 bg-warn-subtle px-4 py-3 text-sm text-warn-subtle-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-warn/40"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          Antes de emitir, corregí {countLabel(problems.length, 'cosa', 'cosas')}:
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Cerrar la lista de correcciones"
          onClick={onDismiss}
        >
          <X aria-hidden />
        </Button>
      </div>
      <ul className="flex list-disc flex-col gap-1 ps-5">
        {problems.map((problem, index) => (
          <li key={`${problem.field}-${index}`} className="text-pretty">
            {problem.field === 'company' ? (
              <Link href={FISCAL_DATA_HREF} className="underline underline-offset-4">
                {problem.message}
              </Link>
            ) : (
              <button
                type="button"
                className="text-left underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-warn/40"
                onClick={() => focusEditorField(problem.field)}
              >
                {problem.message}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
