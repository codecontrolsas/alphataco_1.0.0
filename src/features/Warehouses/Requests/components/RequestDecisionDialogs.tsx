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
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { Logger } from '@/lib/logger';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, Lock, PackageOpen, X, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  approveRequestAction,
  cancelRequestAction,
  closeRequestAction,
  rejectRequestAction,
  type MaterialRequestDetail,
} from '../../actions/requests.server';
import { WAREHOUSE_QUERY_KEYS } from '../../lib/query-keys';
import { unwrapAction } from '../../lib/unwrap-action';

const logger = new Logger('Warehouses/RequestDecisionDialogs');

interface DecisionDialogProps {
  icon: LucideIcon;
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  successMessage: string;
  destructive?: boolean;
  /** Si pide motivo (obligatorio). */
  motive?: { label: string; placeholder: string };
  run: (notes: string) => Promise<ActionResult<{ number: string }>>;
}

/** Confirmacion de un cambio de estado del pedido, con motivo cuando corresponde. */
function DecisionDialog({ icon: Icon, destructive, motive, run, ...text }: DecisionDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: async () => unwrapAction(await run(notes)),
    onSuccess: () => {
      toast.success(text.successMessage);
      queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.requests });
      setOpen(false);
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al actualizar el pedido', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar el pedido');
    },
  });

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setNotes('');
      }}
    >
      <Button
        type="button"
        variant={destructive ? 'outline' : 'default'}
        className={destructive ? 'text-destructive hover:text-destructive' : undefined}
        onClick={() => setOpen(true)}
      >
        <Icon className="mr-2 h-4 w-4" />
        {text.label}
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{text.title}</AlertDialogTitle>
          <AlertDialogDescription>{text.description}</AlertDialogDescription>
        </AlertDialogHeader>
        {motive && (
          <div className="space-y-2">
            <Label htmlFor="request-decision-notes">{motive.label}</Label>
            <Textarea
              id="request-decision-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={motive.placeholder}
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Volver</AlertDialogCancel>
          <AlertDialogAction
            disabled={(motive && !notes.trim()) || mutation.isPending}
            className={destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
            onClick={(event) => {
              event.preventDefault();
              mutation.mutate();
            }}
          >
            {mutation.isPending ? text.pendingLabel : text.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Acciones del detalle segun estado y permisos (los calcula el servidor en `can`). */
export function RequestActions({ request }: { request: MaterialRequestDetail }) {
  const { id, number, can } = request;
  return (
    <div className="flex flex-wrap gap-2">
      {can.deliver && (
        <Button asChild>
          <Link href={`/dashboard/warehouse/requests/${id}/deliver`}>
            <PackageOpen className="mr-2 h-4 w-4" />
            Entregar
          </Link>
        </Button>
      )}
      {can.approve && (
        <DecisionDialog
          icon={Check}
          label="Aprobar"
          title={`¿Aprobar ${number}?`}
          description="Queda listo para que el almacén lo entregue."
          confirmLabel="Aprobar pedido"
          pendingLabel="Aprobando…"
          successMessage={`${number} aprobado`}
          run={() => approveRequestAction(id)}
        />
      )}
      {can.reject && (
        <DecisionDialog
          icon={X}
          destructive
          label="Rechazar"
          title={`¿Rechazar ${number}?`}
          description="El solicitante ve el motivo en el pedido. No se puede deshacer."
          confirmLabel="Rechazar pedido"
          pendingLabel="Rechazando…"
          successMessage={`${number} rechazado`}
          motive={{ label: 'Motivo del rechazo', placeholder: 'Ej.: ya se entregó la semana pasada' }}
          run={(notes) => rejectRequestAction({ requestId: id, notes })}
        />
      )}
      {can.close && (
        <DecisionDialog
          icon={Lock}
          destructive
          label="Cerrar"
          title={`¿Cerrar ${number}?`}
          description="Lo pendiente ya no se entrega. Las entregas hechas se mantienen."
          confirmLabel="Cerrar pedido"
          pendingLabel="Cerrando…"
          successMessage={`${number} cerrado`}
          motive={{ label: 'Motivo del cierre', placeholder: 'Ej.: el resto se compra directo al proveedor' }}
          run={(notes) => closeRequestAction({ requestId: id, notes })}
        />
      )}
      {can.cancel && (
        <DecisionDialog
          icon={Ban}
          destructive
          label="Cancelar pedido"
          title={`¿Cancelar ${number}?`}
          description="El pedido deja de esperar aprobación. Para pedir otra cosa, hacé uno nuevo."
          confirmLabel="Cancelar pedido"
          pendingLabel="Cancelando…"
          successMessage={`${number} cancelado`}
          run={() => cancelRequestAction(id)}
        />
      )}
    </div>
  );
}
