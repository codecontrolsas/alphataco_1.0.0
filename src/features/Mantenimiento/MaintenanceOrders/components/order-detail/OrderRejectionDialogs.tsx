'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import type { SelectableRepair } from './types';

type Pending = { isPending: boolean };

interface RejectionDialogsProps {
  // Selector de ítems a rechazar
  selectableRepairs: SelectableRepair[];
  selectedRejections: Record<string, string>;
  onToggleRejection: (repairId: string) => void;
  onRejectionComment: (repairId: string, comment: string) => void;
  onResetRejections: () => void;
  canSubmitRejections: boolean;
  onSubmitRejections: (target: 'workshop' | 'operations') => void;

  // Taller: rechazo de ítems y devolución completa
  showItemReject: boolean;
  setShowItemReject: (value: boolean) => void;
  workshopRejectItems: Pending;
  showReturn: boolean;
  setShowReturn: (value: boolean) => void;
  returnReason: string;
  setReturnReason: (value: string) => void;
  workshopReturn: Pending & { mutate: () => void };

  // Operaciones: rechazo de ítems y rechazo completo
  showOpsItemReject: boolean;
  setShowOpsItemReject: (value: boolean) => void;
  operationsRejectItems: Pending;
  showOpsReject: boolean;
  setShowOpsReject: (value: boolean) => void;
  operationsRejectionReason: string;
  setOperationsRejectionReason: (value: string) => void;
  operationsReject: Pending & { mutate: () => void };
}

/**
 * Confirmaciones de rechazo y devolución del detalle. Son confirmaciones (`AlertDialog`), no formularios
 * largos: foco atrapado, Escape cancela y el foco vuelve al botón que las abrió.
 */
export function OrderRejectionDialogs(props: RejectionDialogsProps) {
  const {
    selectableRepairs,
    selectedRejections,
    onToggleRejection,
    onRejectionComment,
    onResetRejections,
    canSubmitRejections,
    onSubmitRejections,
  } = props;
  const selectedCount = Object.keys(selectedRejections).length;

  const bySector = new Map<string, SelectableRepair[]>();
  selectableRepairs.forEach((repair) => {
    const list = bySector.get(repair.sectorName) ?? [];
    list.push(repair);
    bySector.set(repair.sectorName, list);
  });

  const itemSelector =
    selectableRepairs.length === 0 ? (
      <p className="text-muted-foreground py-4 text-center text-sm">
        No hay items completados disponibles para rechazar.
      </p>
    ) : (
      <div className="max-h-[50vh] space-y-4 overflow-y-auto">
        {Array.from(bySector.entries()).map(([sectorName, repairs]) => (
          <div key={sectorName}>
            <h5 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">{sectorName}</h5>
            <div className="space-y-2">
              {repairs.map((repair) => {
                const isSelected = repair.repairId in selectedRejections;
                const checkboxId = `reject-${repair.repairId}`;
                return (
                  <div
                    key={repair.repairId}
                    className={`rounded-md border p-3 transition-colors ${isSelected ? 'border-destructive/50 bg-destructive/5' : 'border-border'}`}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id={checkboxId}
                        checked={isSelected}
                        onCheckedChange={() => onToggleRejection(repair.repairId)}
                      />
                      <label htmlFor={checkboxId} className="flex-1 text-sm font-medium">
                        {repair.repairName}
                      </label>
                      <Badge variant="success" className="text-[11px]">
                        Completada
                      </Badge>
                    </div>
                    {isSelected && (
                      <Textarea
                        aria-label={`Motivo del rechazo de ${repair.repairName}`}
                        placeholder="Motivo del rechazo (requerido)"
                        value={selectedRejections[repair.repairId]}
                        onChange={(e) => onRejectionComment(repair.repairId, e.target.value)}
                        className="mt-2 text-sm"
                        rows={2}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );

  const destructive = 'bg-destructive text-destructive-foreground hover:bg-destructive/90';
  const submitLabel = (pending: boolean) =>
    pending ? 'Rechazando...' : `Rechazar ${selectedCount} item${selectedCount !== 1 ? 's' : ''}`;

  return (
    <>
      <AlertDialog open={props.showItemReject} onOpenChange={props.setShowItemReject}>
        <AlertDialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Rechazar Items Especificos</AlertDialogTitle>
            <AlertDialogDescription>
              Selecciona los items que no fueron realizados correctamente. Cada item requiere un comentario.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {itemSelector}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onResetRejections}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                onSubmitRejections('workshop');
              }}
              disabled={!canSubmitRejections || props.workshopRejectItems.isPending}
              className={destructive}
            >
              {submitLabel(props.workshopRejectItems.isPending)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={props.showReturn} onOpenChange={props.setShowReturn}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Devolver Orden Completa al Taller</AlertDialogTitle>
            <AlertDialogDescription>
              Esta accion reabrira todas las ordenes de trabajo completadas. Indica el motivo:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            aria-label="Motivo de devolución"
            placeholder="Motivo de devolucion (requerido)"
            value={props.returnReason}
            onChange={(e) => props.setReturnReason(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => props.setReturnReason('')}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                props.workshopReturn.mutate();
              }}
              disabled={!props.returnReason.trim() || props.workshopReturn.isPending}
            >
              {props.workshopReturn.isPending ? 'Devolviendo...' : 'Devolver Todo'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={props.showOpsItemReject} onOpenChange={props.setShowOpsItemReject}>
        <AlertDialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Rechazar Items Especificos</AlertDialogTitle>
            <AlertDialogDescription>
              Selecciona los items que no cumplen con los requisitos. El jefe de taller decidira como proceder.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {itemSelector}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onResetRejections}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                onSubmitRejections('operations');
              }}
              disabled={!canSubmitRejections || props.operationsRejectItems.isPending}
              className={destructive}
            >
              {submitLabel(props.operationsRejectItems.isPending)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={props.showOpsReject} onOpenChange={props.setShowOpsReject}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rechazar Orden Completa</AlertDialogTitle>
            <AlertDialogDescription>
              La orden volvera al estado de validacion de taller. Indica el motivo:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            aria-label="Motivo de rechazo"
            placeholder="Motivo de rechazo (requerido)"
            value={props.operationsRejectionReason}
            onChange={(e) => props.setOperationsRejectionReason(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => props.setOperationsRejectionReason('')}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                props.operationsReject.mutate();
              }}
              disabled={!props.operationsRejectionReason.trim() || props.operationsReject.isPending}
            >
              {props.operationsReject.isPending ? 'Rechazando...' : 'Rechazar Todo'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
