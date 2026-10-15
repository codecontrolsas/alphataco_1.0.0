'use client';

import { Badge } from '@/components/ui/badge';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { getModuleIcon } from '@/shared/constants/module-icons';
import type { ReactNode } from 'react';
import { MODULE_STATUS_LABEL, type ModuleSummary } from '../../lib/permission-summary';

interface RoleSummaryProps {
  summaries: ModuleSummary[];
  totalModules: number;
  emptyTitle: string;
  /** Línea arriba de todo (ej. diferencias del usuario con sus roles) */
  lead?: ReactNode;
  onOpenModule: (moduleId: string) => void;
}

/** "Qué puede hacer": lo que habilitan los permisos, en lenguaje natural y por módulo. */
export function RoleSummary({ summaries, totalModules, emptyTitle, lead, onOpenModule }: RoleSummaryProps) {
  return (
    <div className="space-y-4">
      {lead}
      {summaries.length === 0 ? (
        <StateBlock
          variant="empty"
          title={emptyTitle}
          description={`Sin acceso a ninguno de los ${totalModules} módulos.`}
          className="rounded-lg border border-dashed"
        />
      ) : (
        <>
          <p className="text-muted-foreground text-sm tabular-nums">
            Acceso a {summaries.length} de {totalModules} módulos.
          </p>
          <ul className="divide-y rounded-lg border">
            {summaries.map(({ module, access, lines }) => {
              const Icon = getModuleIcon(module.slug);
              return (
                <li key={module.id} className="space-y-2 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
                    <button
                      type="button"
                      onClick={() => onOpenModule(module.id)}
                      className="focus-visible:ring-ring rounded-sm text-sm font-semibold underline-offset-4 outline-none hover:underline focus-visible:ring-2"
                    >
                      {module.name}
                    </button>
                    <Badge variant="outline" className="text-xs font-normal tabular-nums">
                      {MODULE_STATUS_LABEL[access.status]} · {access.granted}/{access.total}
                    </Badge>
                  </div>
                  <ul className="space-y-1 pl-6 text-sm">
                    {lines.map((line) => (
                      <li key={line.tabId} className="text-pretty">
                        <span className="font-medium">{line.path}:</span>{' '}
                        <span className="text-muted-foreground">{line.text}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
