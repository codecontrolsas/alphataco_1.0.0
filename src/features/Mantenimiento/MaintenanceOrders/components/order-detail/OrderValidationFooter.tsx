'use client';

import { Button } from '@/components/ui/button';
import { SheetClose } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { Check, Undo2 } from 'lucide-react';
import { useId } from 'react';

interface OrderValidationFooterProps {
  status: string;
  context: 'workshop' | 'operations';
  /** Cantidad de OTs de la orden (para el aviso previo a la validación). */
  workOrderCount: number;
  validationNotes: string;
  onValidationNotesChange: (value: string) => void;
  /** Pedidos de materiales abiertos: impiden cerrar (el servidor lo vuelve a validar). */
  openRequestNumbers: string[];
  isValidating: boolean;
  isRejectingItems: boolean;
  isReturning: boolean;
  onValidate: () => void;
  onRejectItems: () => void;
  onReturn: () => void;
}

/**
 * Pie del panel. Cierre del taller solo en `pending_workshop_validation` + contexto taller; desde la
 * reunión del 31/08/2026 Operaciones no valida más: el taller cierra el circuito.
 */
export function OrderValidationFooter({
  status,
  context,
  workOrderCount,
  validationNotes,
  onValidationNotesChange,
  openRequestNumbers,
  isValidating,
  isRejectingItems,
  isReturning,
  onValidate,
  onRejectItems,
  onReturn,
}: OrderValidationFooterProps) {
  const notesId = useId();
  const hintId = useId();

  const closeButton = (
    <SheetClose asChild>
      <Button type="button" variant="outline">
        Cerrar
      </Button>
    </SheetClose>
  );

  if (context === 'workshop' && status === 'pending_workshop_validation') {
    const blockedByMaterials = openRequestNumbers.length > 0;
    return (
      <div className="shrink-0 space-y-3 border-t px-4 py-4 sm:px-6">
        <PermissionGuard
          module="mantenimiento"
          tab="ordenes_mantenimiento"
          action="update"
          fallback={
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-muted-foreground text-sm">No tenés permiso para validar ni cerrar órdenes.</p>
              {closeButton}
            </div>
          }
        >
          <label htmlFor={notesId} className="sr-only">
            Notas de validación (opcional)
          </label>
          <Textarea
            id={notesId}
            placeholder="Notas de validacion (opcional)"
            value={validationNotes}
            onChange={(e) => onValidationNotesChange(e.target.value)}
            rows={2}
          />

          {blockedByMaterials && (
            <p
              id={hintId}
              className="border-warn/40 bg-warn-subtle text-warn-subtle-foreground rounded-md border px-3 py-2 text-sm"
            >
              No se puede cerrar todavía:{' '}
              {openRequestNumbers.length === 1
                ? `${openRequestNumbers[0]} sigue abierto. Entregalo, cerralo o cancelalo`
                : `${openRequestNumbers.join(', ')} siguen abiertos. Entregalos, cerralos o cancelalos`}{' '}
              desde Almacenes → Pedidos.
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <Button type="button" variant="outline" onClick={onReturn} disabled={isReturning}>
              <Undo2 aria-hidden="true" className="mr-1 h-4 w-4" />
              Devolver Orden Completa al Taller
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row">
              <Button type="button" variant="outline" onClick={onRejectItems} disabled={isRejectingItems}>
                Rechazar Items Especificos
              </Button>
              <Button
                type="button"
                onClick={onValidate}
                disabled={isValidating || blockedByMaterials}
                aria-describedby={blockedByMaterials ? hintId : undefined}
              >
                <Check aria-hidden="true" className="mr-1 h-4 w-4" />
                {isValidating ? 'Cerrando...' : 'Validar y Cerrar Orden'}
              </Button>
            </div>
          </div>
        </PermissionGuard>
      </div>
    );
  }

  const waitingForWorkOrders = context === 'workshop' && status === 'in_workshop';
  return (
    <div className="flex shrink-0 flex-col gap-3 border-t px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      {waitingForWorkOrders ? (
        <p id={hintId} className="text-muted-foreground text-sm">
          {workOrderCount > 0
            ? `La validación se habilita cuando las ${workOrderCount} OTs estén cerradas.`
            : 'La validación se habilita cuando las OTs de la orden estén cerradas.'}
        </p>
      ) : (
        <span />
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        {closeButton}
        {waitingForWorkOrders && (
          <PermissionGuard module="mantenimiento" tab="ordenes_mantenimiento" action="update">
            <Button type="button" disabled aria-describedby={hintId}>
              Validar y Cerrar Orden
            </Button>
          </PermissionGuard>
        )}
      </div>
    </div>
  );
}
