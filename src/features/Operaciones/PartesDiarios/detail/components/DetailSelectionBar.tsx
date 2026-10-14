'use client';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CalendarCheck, Pencil, UserCog, X } from 'lucide-react';
import type { DailyReportDetailRow } from '../types';

interface Props {
  selectedRows: DailyReportDetailRow[];
  canUpdate: boolean;
  canAssignResources: boolean;
  /** Elegibilidad de asignar recursos para UNA línea (viene de `row-permissions`). */
  isAssignable: (row: DailyReportDetailRow) => boolean;
  onBulkEdit: () => void;
  onAssign: (row: DailyReportDetailRow) => void;
  onClone: () => void;
  onClear: () => void;
}

/** Botón deshabilitado que sigue explicando por qué (el `span` enfocable recibe el tooltip). */
function DisabledWithHint({ hint, children }: { hint: React.ReactNode; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="max-w-xs text-xs">{hint}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/** Acciones sobre las líneas seleccionadas. Sin eliminar en lote. */
export function DetailSelectionBar({
  selectedRows,
  canUpdate,
  canAssignResources,
  isAssignable,
  onBulkEdit,
  onAssign,
  onClone,
  onClear,
}: Props) {
  const count = selectedRows.length;
  const hasExecuted = selectedRows.some((row) => row.status === 'ejecutado');
  const singleRow = count === 1 ? selectedRows[0] : null;
  const assignable = singleRow !== null && isAssignable(singleRow);

  return (
    <div role="region" aria-label="Acciones sobre la selección">
      {/* Región viva SIEMPRE montada: una que aparece junto con su texto no se anuncia. */}
      <p role="status" className="sr-only">
        {count === 0 ? '' : count === 1 ? '1 línea seleccionada' : `${count} líneas seleccionadas`}
      </p>
      {count > 0 ? (
        <TooltipProvider delayDuration={150}>
          <div className="border-brand/40 bg-brand-subtle text-brand-subtle-foreground flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
            <span aria-hidden="true" className="mr-auto text-sm font-medium tabular-nums">
              {count === 1 ? '1 línea seleccionada' : `${count} líneas seleccionadas`}
            </span>

            {canUpdate ? (
              hasExecuted ? (
                <DisabledWithHint
                  hint={
                    <>
                      No se pueden editar líneas ejecutadas. Deseleccioná las que tienen estado{' '}
                      <span className="font-medium">Ejecutado</span> para continuar.
                    </>
                  }
                >
                  <Button type="button" variant="outline" size="sm" disabled>
                    <Pencil aria-hidden="true" />
                    Editar en lote
                  </Button>
                </DisabledWithHint>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={onBulkEdit}>
                  <Pencil aria-hidden="true" />
                  Editar en lote
                </Button>
              )
            ) : null}

            {canAssignResources ? (
              assignable && singleRow ? (
                <Button type="button" variant="outline" size="sm" onClick={() => onAssign(singleRow)}>
                  <UserCog aria-hidden="true" />
                  Asignar recursos
                </Button>
              ) : (
                <DisabledWithHint
                  hint={
                    count === 1
                      ? 'Esta línea no admite asignar recursos en su estado actual.'
                      : 'Seleccioná una sola línea para asignarle personal y equipos.'
                  }
                >
                  <Button type="button" variant="outline" size="sm" disabled>
                    <UserCog aria-hidden="true" />
                    Asignar recursos
                  </Button>
                </DisabledWithHint>
              )
            ) : null}

            {canUpdate ? (
              <Button type="button" variant="outline" size="sm" onClick={onClone}>
                <CalendarCheck aria-hidden="true" />
                Clonar
              </Button>
            ) : null}

            <Button type="button" variant="ghost" size="sm" onClick={onClear}>
              <X aria-hidden="true" />
              Deseleccionar
            </Button>
          </div>
        </TooltipProvider>
      ) : null}
    </div>
  );
}
