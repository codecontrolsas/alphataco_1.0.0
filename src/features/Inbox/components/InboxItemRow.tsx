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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  approveTask,
  getApprovalSectors,
  reassignTaskToSector,
  rejectTask,
} from '@/features/Mantenimiento/ApprovalInbox/actions/actionsServer';
import { ResourceCell } from '@/features/Mantenimiento/shared/components/ResourceCell';
import { invalidateAllMaintenanceQueries } from '@/features/Mantenimiento/utils/queryInvalidation';
import { Logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, ClipboardCheck, Clock, Eye, Info, ShieldCheck, Shuffle, X, type LucideIcon } from 'lucide-react';
import { useId, useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { InboxAction, InboxItem } from '../lib/types';

const logger = new Logger('Inbox/InboxItemRow');

/** El tipo se distingue por ícono y texto, nunca solo por color. */
const TYPE_PRESENTATION: Record<string, { label: string; icon: LucideIcon }> = {
  task_authorization: { label: 'Autorizar tarea', icon: ShieldCheck },
  task_reassignment: { label: 'Reasignar tarea', icon: Shuffle },
  order_validation: { label: 'Validar cierre', icon: ClipboardCheck },
  order_returned: { label: 'Para tu información', icon: Info },
};

const QUOTE_TONE = {
  warn: 'border-warn/35 bg-warn-subtle text-warn-subtle-foreground',
  danger: 'border-danger/30 bg-danger-subtle text-danger-subtle-foreground',
} as const;

export interface InboxItemRowProps {
  item: InboxItem;
  onOpenOrder: (orderId: string) => void;
  onShowHistory: (workOrderId: string) => void;
}

function findAction(item: InboxItem, id: InboxAction['id']): InboxAction | undefined {
  return item.actions.find((action) => action.id === id);
}

/** Una fila de la bandeja: cabecera común (tipo, equipo, referencia, antigüedad) y las acciones de su tipo. */
export function InboxItemRow({ item, onOpenOrder, onShowHistory }: InboxItemRowProps) {
  const presentation = TYPE_PRESENTATION[item.type] ?? { label: item.type, icon: Info };
  const TypeIcon = presentation.icon;
  const titleId = useId();

  return (
    <li aria-labelledby={titleId} className="bg-card min-w-0 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <Badge variant={item.kind === 'info' ? 'outline' : 'secondary'} className="gap-1">
            <TypeIcon className="size-3.5" aria-hidden="true" />
            {presentation.label}
          </Badge>
          {item.resource ? (
            <ResourceCell resource={item.resource} />
          ) : null}
          {item.reference ? <span className="font-mono text-sm font-semibold">{item.reference}</span> : null}
          {item.badge ? (
            <Badge variant={item.type === 'task_reassignment' ? 'warning' : 'secondary'}>{item.badge}</Badge>
          ) : null}
        </div>
        {item.workOrderId ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9"
            aria-label="Ver historial de la OT"
            title="Ver historial"
            onClick={() => onShowHistory(item.workOrderId as string)}
          >
            <Clock className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      <p id={titleId} className="mt-3 min-w-0 truncate font-semibold" title={item.title}>
        {item.title}
      </p>
      {item.context ? <p className="text-muted-foreground mt-1 min-w-0 truncate text-sm" title={item.context}>{item.context}</p> : null}
      <p className="text-muted-foreground mt-1 text-sm">
        {item.requestedBy ? `${item.type === 'order_returned' ? 'Devuelta por' : 'Solicitada por'} ${item.requestedBy}` : ''}
        {item.requestedBy && item.createdAt ? ' · ' : ''}
        {item.createdAt ? formatArgentinaDateTime(item.createdAt) : ''}
      </p>

      {item.quote ? (
        <blockquote className={cn('mt-3 rounded-md border px-3 py-2 text-sm break-words', QUOTE_TONE[item.quote.tone])}>
          <span className="font-medium">{item.quote.label}: </span>
          {item.quote.text}
        </blockquote>
      ) : null}

      {item.type === 'task_authorization' ? <AuthorizationActions item={item} /> : null}
      {item.type === 'task_reassignment' ? <ReassignmentActions item={item} onOpenOrder={onOpenOrder} /> : null}
      {item.type === 'order_validation' || item.type === 'order_returned' ? (
        <OrderActions item={item} onOpenOrder={onOpenOrder} />
      ) : null}
    </li>
  );
}

/** Aprobar y Rechazar: solo se listan con `bandeja_aprobaciones:update`. El rechazo pide el motivo en la misma fila. */
function AuthorizationActions({ item }: { item: InboxItem }) {
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [isPending, startTransition] = useTransition();
  const reasonId = useId();

  if (!findAction(item, 'approve') && !findAction(item, 'reject')) return null;

  const run = (label: string, task: () => Promise<void>, done: string) =>
    startTransition(async () => {
      try {
        await task();
        toast.success(done);
        invalidateAllMaintenanceQueries(queryClient);
        setRejecting(false);
        setReason('');
      } catch (error) {
        logger.error(`Error al ${label}`, { data: { error } });
        toast.error(error instanceof Error ? error.message : `Error al ${label}`);
      }
    });

  return (
    <div className="mt-3">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          aria-expanded={rejecting}
          aria-controls={reasonId}
          onClick={() => setRejecting((open) => !open)}
        >
          <X className="size-4" aria-hidden="true" />
          Rechazar tarea
        </Button>
        <Button type="button" size="sm" disabled={isPending} onClick={() => setConfirmApprove(true)}>
          <Check className="size-4" aria-hidden="true" />
          Aprobar tarea
        </Button>
      </div>

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
              disabled={isPending}
              onClick={() => {
                setRejecting(false);
                setReason('');
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={!reason.trim() || isPending}
              onClick={() => run('rechazar', () => rejectTask(item.entityId, reason.trim()), 'Tarea rechazada')}
            >
              {isPending ? 'Rechazando...' : 'Confirmar rechazo'}
            </Button>
          </div>
        </div>
      ) : null}

      <AlertDialog open={confirmApprove} onOpenChange={setConfirmApprove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprobar tarea</AlertDialogTitle>
            <AlertDialogDescription>
              La tarea &quot;{item.title}&quot; será aprobada y pasará a estado pendiente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={() => {
                run('aprobar', () => approveTask(item.entityId), 'Tarea aprobada');
                setConfirmApprove(false);
              }}
            >
              Aprobar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Selector de sector + Reasignar: solo con `bandeja_aprobaciones:update`. Los sectores se piden una vez para todas las filas. */
function ReassignmentActions({ item, onOpenOrder }: { item: InboxItem; onOpenOrder: (orderId: string) => void }) {
  const queryClient = useQueryClient();
  const [sectorId, setSectorId] = useState('');
  const [isPending, startTransition] = useTransition();
  const selectId = useId();
  const reassign = findAction(item, 'reassign');
  const canReassign = Boolean(reassign);
  const blocked = reassign?.enabled === false;
  const reasonId = useId();
  const { data: sectors = [], isError } = useQuery({
    queryKey: ['maintenance', 'inbox-sectors'],
    queryFn: () => getApprovalSectors(),
    enabled: canReassign && !blocked,
    staleTime: 5 * 60 * 1000,
  });

  if (!canReassign) return null;

  const handleReassign = () =>
    startTransition(async () => {
      try {
        await reassignTaskToSector(item.entityId, sectorId);
        toast.success('Tarea reasignada');
        invalidateAllMaintenanceQueries(queryClient);
        setSectorId('');
      } catch (error) {
        logger.error('Error al reasignar', { data: { error } });
        toast.error(error instanceof Error ? error.message : 'Error al reasignar');
      }
    });

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1 space-y-1.5 sm:max-w-xs">
          <Label htmlFor={selectId}>Nuevo sector</Label>
          <Select value={sectorId} onValueChange={setSectorId} disabled={blocked || sectors.length === 0 || isPending}>
            <SelectTrigger id={selectId} className="w-full" aria-describedby={blocked ? reasonId : undefined}>
              <SelectValue
                placeholder={isError ? 'No se pudieron cargar los sectores' : sectors.length === 0 ? 'Sin sectores disponibles' : 'Seleccionar sector'}
              />
            </SelectTrigger>
            <SelectContent>
              {sectors.map((sector) => (
                <SelectItem key={sector.id} value={sector.id}>
                  {sector.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          onClick={handleReassign}
          disabled={blocked || isPending || !sectorId}
          aria-describedby={blocked ? reasonId : undefined}
        >
          <ArrowRight className="size-4" aria-hidden="true" />
          {isPending ? 'Reasignando...' : 'Reasignar'}
        </Button>
        {item.orderId && findAction(item, 'open') ? (
          <Button type="button" variant="outline" onClick={() => onOpenOrder(item.orderId as string)}>
            <Eye className="size-4" aria-hidden="true" />
            Ver orden
          </Button>
        ) : null}
      </div>
      {blocked && reassign?.disabledReason ? (
        <p id={reasonId} className="text-muted-foreground mt-2 text-xs">
          {reassign.disabledReason}
        </p>
      ) : null}
    </div>
  );
}

/**
 * «Ver orden» siempre. «Revisar y validar» abre el mismo panel; sin edición en Órdenes de mantenimiento queda
 * deshabilitado con el motivo a la vista (y asociado con `aria-describedby`).
 */
function OrderActions({ item, onOpenOrder }: { item: InboxItem; onOpenOrder: (orderId: string) => void }) {
  const reasonId = useId();
  const validate = findAction(item, 'validate');
  const orderId = item.orderId;
  if (!orderId) return null;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onOpenOrder(orderId)}>
          <Eye className="size-4" aria-hidden="true" />
          Ver orden
        </Button>
        {validate ? (
          <Button
            type="button"
            size="sm"
            disabled={!validate.enabled}
            aria-describedby={!validate.enabled ? reasonId : undefined}
            onClick={() => onOpenOrder(orderId)}
          >
            <ClipboardCheck className="size-4" aria-hidden="true" />
            Revisar y validar
          </Button>
        ) : null}
      </div>
      {validate && !validate.enabled && validate.disabledReason ? (
        <p id={reasonId} className="text-muted-foreground mt-2 text-right text-xs">
          {validate.disabledReason}
        </p>
      ) : null}
    </div>
  );
}
