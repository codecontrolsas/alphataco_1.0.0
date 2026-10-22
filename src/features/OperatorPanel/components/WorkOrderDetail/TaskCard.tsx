'use client';

import type { BadgeProps } from '@/components/ui/badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { REPAIR_STATUS_UI, TONE_TO_BADGE } from '@/features/Mantenimiento/lib/status-presentation';
import { RepairGroupBadge } from '@/features/Mantenimiento/shared/components/RepairGroupBadge';
import { RepairItemPhotos } from '@/features/Mantenimiento/shared/components/RepairItemPhotos';
import type { work_order_item_status } from '@/generated/prisma/client';
import { RotateCcw, UserPlus } from 'lucide-react';
import { TaskNotes } from './TaskNotes';

type BadgeVariant = NonNullable<BadgeProps['variant']>;

const criticityVariants: Record<string, BadgeVariant> = {
  critica: 'destructive',
  alta: 'warning',
  media: 'default',
  baja: 'secondary',
};

export interface RepairData {
  id: string;
  status: string | null;
  technician_notes: string | null;
  return_reason: string | null;
  rejection_reason: string | null;
  is_operator_added: boolean | null;
  is_diagnostico: boolean;
  types_of_repairs: {
    id: string;
    name: string | null;
    criticity: string | null;
    autorizable: boolean | null;
  } | null;
}

interface TaskCardProps {
  repair: RepairData;
  /**
   * Titulo del item ya resuelto (desvio de checklist, texto libre o tipo de
   * reparacion). Ticket 592: sin esto los items de carga manual sin tipo de
   * reparacion se veian como "Tarea sin tipo".
   */
  title: string;
  description: string | null;
  /** Fotos que cargo quien pidio la reparacion (ticket 592) */
  images: string[];
  /** Grupo de reparaciones del que salio el item, si vino de uno */
  groupName?: string | null;
  isBlockedByDiag: boolean;
  isBlockedByPending?: boolean;
  isMutating: boolean;
  localNotes: string;
  onToggle: (repairId: string, isCompleted: boolean) => void;
  onNotesChange: (repairId: string, notes: string) => void;
  onNotesSave: (repairId: string, notes: string) => void;
  onReturn: (repairId: string) => void;
}

export function TaskCard({
  repair,
  title,
  description,
  images,
  groupName,
  isBlockedByDiag,
  isBlockedByPending,
  isMutating,
  localNotes,
  onToggle,
  onNotesChange,
  onNotesSave,
  onReturn,
}: TaskCardProps) {
  const isCompleted = repair.status === 'completed';
  const isRejected = repair.status === 'rejected';
  const isReassignmentRequested = repair.status === 'reassignment_requested';
  const isPendingApproval = repair.status === 'pending_approval';
  const repairType = repair.types_of_repairs;

  const borderColor = isCompleted
    ? 'border-l-ok'
    : isRejected
      ? 'border-l-danger'
      : isReassignmentRequested
        ? 'border-l-danger'
        : isPendingApproval
          ? 'border-l-warn'
          : 'border-l-pending';

  const isBlocked = isBlockedByDiag || isBlockedByPending;
  const attentionStatusUi =
    isRejected || isPendingApproval || isReassignmentRequested
      ? REPAIR_STATUS_UI[repair.status as work_order_item_status]
      : null;

  /**
   * Atenuacion del contenido.
   *
   * NO puede vivir en el contenedor de la tarjeta: `opacity` crea un contexto de
   * composicion y ningun descendiente puede recuperar la opacidad 1 (el intento
   * anterior de envolver las fotos en un div con `opacity-100` no funciono por
   * eso). Se aplica bloque por bloque y se deja afuera el de las fotos, que el
   * mecanico necesita ver nitidas justo cuando la tarjeta esta bloqueada: es
   * cuando dimensiona el trabajo, antes de tocar "Iniciar OT".
   */
  const dimClass = isBlocked
    ? 'opacity-30'
    : isPendingApproval || isRejected
      ? 'opacity-50'
      : isCompleted
        ? 'opacity-60'
        : '';

  // El bloqueo de interaccion tambien va por bloque, no en la tarjeta entera
  const blockedClass = isBlocked ? `${dimClass} pointer-events-none` : dimClass;

  return (
    <div className={`rounded-lg border border-l-4 ${borderColor} bg-card transition-all duration-200`}>
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3.5">
          <div className={blockedClass}>
            <Checkbox
              id={`task-${repair.id}`}
              checked={isCompleted}
              onCheckedChange={() => onToggle(repair.id, isCompleted)}
              disabled={
                isBlockedByDiag ||
                isBlockedByPending ||
                isReassignmentRequested ||
                isPendingApproval ||
                isRejected ||
                isMutating
              }
              className="mt-0.5 size-6 rounded-md"
            />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className={`space-y-2 ${blockedClass}`}>
              {/* Task name */}
              <label
                htmlFor={`task-${repair.id}`}
                className={`text-base font-semibold cursor-pointer block leading-tight ${
                  isCompleted ? 'line-through text-muted-foreground' : ''
                }`}
              >
                {title}
              </label>

              {/* Badges - compact */}
              <div className="flex flex-wrap gap-1">
                <RepairGroupBadge groupName={groupName} />
                {repairType?.name && repairType.name !== title && (
                  <Badge variant="outline" className="text-xs px-1.5 py-0">
                    {repairType.name}
                  </Badge>
                )}
                {repairType?.criticity && (
                  <Badge variant={criticityVariants[repairType.criticity] || 'default'} className="text-xs px-1.5 py-0">
                    {repairType.criticity}
                  </Badge>
                )}
                {repairType?.autorizable && (
                  <Badge variant="outline" className="text-xs px-1.5 py-0">
                    Autorizable
                  </Badge>
                )}
                {repair.is_operator_added && (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0 gap-0.5">
                    <UserPlus aria-hidden="true" className="h-3 w-3" />
                    Operario
                  </Badge>
                )}
                {/* Estados que bloquean la tarea: etiqueta e ícono de la fuente única (nunca solo color) */}
                {attentionStatusUi && (
                  <Badge variant={TONE_TO_BADGE[attentionStatusUi.tone]} className="text-xs px-1.5 py-0 gap-0.5">
                    <attentionStatusUi.icon aria-hidden="true" className="h-3 w-3" />
                    {attentionStatusUi.label}
                  </Badge>
                )}
              </div>

              {/* Description */}
              {description && <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>}
            </div>

            {/* Fotos del pedido: HERMANAS del bloque atenuado, nunca descendientes.
                Se ven nitidas y siguen siendo clickeables aunque la OT no este
                iniciada, que es cuando el mecanico dimensiona el trabajo. */}
            {images.length > 0 && (
              <div className="space-y-1">
                {isBlocked && (
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Fotos del pedido</p>
                )}
                <RepairItemPhotos images={images} label={title} size="md" />
              </div>
            )}

            <div className={`space-y-2 ${blockedClass}`}>
              {/* Rejection reason (from validation) */}
              {isRejected && repair.rejection_reason && (
                <div className="p-2.5 bg-destructive/10 rounded-md border border-destructive/20">
                  <p className="text-xs font-semibold text-destructive uppercase tracking-wide">Motivo de rechazo</p>
                  <p className="text-sm text-destructive/80 mt-0.5">{repair.rejection_reason}</p>
                </div>
              )}

              {/* Return reason */}
              {repair.return_reason && !isRejected && (
                <div className="p-2.5 bg-destructive/10 rounded-md border border-destructive/20">
                  <p className="text-xs font-semibold text-destructive uppercase tracking-wide">Motivo de devolucion</p>
                  <p className="text-sm text-destructive/80 mt-0.5">{repair.return_reason}</p>
                </div>
              )}

              {/* Notes (collapsible) */}
              {!isBlockedByDiag && !isPendingApproval && !isRejected && (
                <TaskNotes
                  repairId={repair.id}
                  initialNotes={localNotes}
                  savedNotes={repair.technician_notes || ''}
                  onNotesChange={onNotesChange}
                  onNotesSave={onNotesSave}
                />
              )}

              {/* Return button */}
              {!isCompleted && !isRejected && !isReassignmentRequested && !isPendingApproval && !isBlockedByDiag && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onReturn(repair.id)}
                  className="min-h-11 gap-1.5 text-sm text-muted-foreground hover:text-destructive"
                >
                  <RotateCcw aria-hidden="true" className="h-4 w-4" />
                  Devolver tarea
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
