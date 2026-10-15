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
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ActivityHistoryModal } from '@/features/Mantenimiento/components/ActivityHistoryModal';
import { MaintenanceStatusPill } from '@/features/Mantenimiento/shared/components/MaintenanceStatusPill';
import { ResourceCell } from '@/features/Mantenimiento/shared/components/ResourceCell';
import { invalidateAllMaintenanceQueries } from '@/features/Mantenimiento/utils/queryInvalidation';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { Logger } from '@/lib/logger';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Clock, Wrench, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { approveTask, rejectTask, type PendingTaskData } from '../actions/actionsServer';
import { getTaskInfo } from '../utils/task-info';

const logger = new Logger('ApprovalInbox/AuthorizationList');

function getAddedByName(task: PendingTaskData): string | null {
  const user = task.added_by_user;
  return user?.fullname || user?.email || null;
}

interface AuthorizationCardProps {
  task: PendingTaskData;
  onApprove: (task: PendingTaskData) => void;
  onShowHistory: (workOrderId: string) => void;
}

function AuthorizationCard({ task, onApprove, onShowHistory }: AuthorizationCardProps) {
  const queryClient = useQueryClient();
  const info = getTaskInfo(task);
  const addedBy = getAddedByName(task);
  const quote = task.technician_notes || info.driverComment;

  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  const reasonId = `reject-reason-${task.id}`;
  const canSubmit = reason.trim().length > 0 && !isRejecting;

  const handleReject = async () => {
    if (!reason.trim()) return;
    setIsRejecting(true);
    try {
      await rejectTask(task.id, reason.trim());
      toast.success('Tarea rechazada');
      invalidateAllMaintenanceQueries(queryClient);
      setRejecting(false);
      setReason('');
    } catch (error) {
      logger.error('Error rechazando tarea', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'Error al rechazar');
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <li className="bg-card rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <ResourceCell resource={info.resource} />
          {info.orderNumber ? <span className="font-mono text-sm font-semibold">{info.orderNumber}</span> : null}
          {info.sectorName ? <Badge variant="secondary">{info.sectorName}</Badge> : null}
          <MaintenanceStatusPill entity="repair" status={task.status} size="sm" />
        </div>
        <div className="flex flex-wrap items-center gap-2 max-sm:w-full">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9"
            aria-label="Ver historial de la OT"
            title="Ver historial"
            disabled={!info.workOrderId}
            onClick={() => info.workOrderId && onShowHistory(info.workOrderId)}
          >
            <Clock className="size-4" aria-hidden="true" />
          </Button>
          <PermissionGuard module="mantenimiento" tab="bandeja_aprobaciones" action="update">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={rejecting}
              aria-controls={reasonId}
              onClick={() => setRejecting((open) => !open)}
            >
              <X className="size-4" aria-hidden="true" />
              Rechazar tarea
            </Button>
            <Button type="button" size="sm" onClick={() => onApprove(task)}>
              <Check className="size-4" aria-hidden="true" />
              Aprobar tarea
            </Button>
          </PermissionGuard>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Wrench className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        <p className="font-semibold">{info.repairTypeName}</p>
        <Badge variant="warning">Autorizable</Badge>
      </div>
      {info.itemDescription ? <p className="text-muted-foreground mt-1 text-sm">{info.itemDescription}</p> : null}
      {addedBy ? (
        <p className="text-muted-foreground mt-1 text-sm">
          Solicitada por {addedBy}
          {task.created_at ? ` · ${formatArgentinaDateTime(task.created_at)}` : ''}
        </p>
      ) : null}
      {quote ? (
        <blockquote className="border-warn/35 bg-warn-subtle text-warn-subtle-foreground mt-3 rounded-md border px-3 py-2 text-sm">
          <span className="font-medium">{task.technician_notes ? 'Operario: ' : 'Chofer: '}</span>
          {quote}
        </blockquote>
      ) : null}

      {rejecting ? (
        <div id={reasonId} className="mt-3 space-y-2">
          <Label htmlFor={`${reasonId}-input`}>Motivo del rechazo (obligatorio)</Label>
          <Textarea
            id={`${reasonId}-input`}
            autoFocus
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Indicar el motivo del rechazo..."
            aria-describedby={`${reasonId}-hint`}
          />
          <p id={`${reasonId}-hint`} className="text-muted-foreground text-xs">
            {reason.trim() ? 'El operario lo ve en su panel.' : 'Escribí el motivo para poder rechazar.'}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setRejecting(false);
                setReason('');
              }}
            >
              Cancelar
            </Button>
            <Button type="button" variant="destructive" size="sm" disabled={!canSubmit} onClick={handleReject}>
              {isRejecting ? 'Rechazando...' : 'Confirmar rechazo'}
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

interface AuthorizationListProps {
  tasks: PendingTaskData[];
}

/** Tareas agregadas por un operario que esperan autorización. Aprobar/rechazar exige `bandeja_aprobaciones:update`. */
export function AuthorizationList({ tasks }: AuthorizationListProps) {
  const queryClient = useQueryClient();
  const [historyWoId, setHistoryWoId] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<PendingTaskData | null>(null);
  const [isApproving, setIsApproving] = useState(false);

  const handleApprove = async () => {
    if (!approveTarget) return;
    setIsApproving(true);
    try {
      await approveTask(approveTarget.id);
      toast.success('Tarea aprobada');
      invalidateAllMaintenanceQueries(queryClient);
    } catch (error) {
      logger.error('Error aprobando tarea', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'Error al aprobar');
    } finally {
      setIsApproving(false);
      setApproveTarget(null);
    }
  };

  return (
    <>
      <ul className="space-y-3">
        {tasks.map((task) => (
          <AuthorizationCard key={task.id} task={task} onApprove={setApproveTarget} onShowHistory={setHistoryWoId} />
        ))}
      </ul>

      <AlertDialog open={!!approveTarget} onOpenChange={(open) => !open && setApproveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprobar tarea</AlertDialogTitle>
            <AlertDialogDescription>
              La tarea de tipo &quot;{approveTarget ? getTaskInfo(approveTarget).repairTypeName : ''}&quot; sera
              aprobada y pasara a estado pendiente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleApprove} disabled={isApproving}>
              {isApproving ? 'Aprobando...' : 'Aprobar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ActivityHistoryModal
        open={!!historyWoId}
        onClose={() => setHistoryWoId(null)}
        workOrderId={historyWoId}
        title="Historial de OT"
      />
    </>
  );
}
