'use client';

import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { Logger } from '@/lib/logger';
import { ConfirmReasonDialog } from '@/shared/components/common/ConfirmReasonDialog';
import { useQueryClient } from '@tanstack/react-query';
import { Ban, Check, Lock, PackageOpen, X, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import {
  approveRequestAction,
  cancelRequestAction,
  closeRequestAction,
  rejectRequestAction,
  type MaterialRequestDetail,
} from '../../actions/requests.server';
import { WAREHOUSE_QUERY_KEYS } from '../../lib/query-keys';

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
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant={destructive ? 'outline' : 'default'}
        className={destructive ? 'text-destructive hover:text-destructive' : undefined}
        onClick={() => setOpen(true)}
      >
        <Icon className="mr-2 h-4 w-4" />
        {text.label}
      </Button>
      <ConfirmReasonDialog
        open={open}
        onOpenChange={setOpen}
        title={text.title}
        description={text.description}
        confirmLabel={text.confirmLabel}
        pendingLabel={text.pendingLabel}
        motive={motive}
        destructive={destructive}
        run={run}
        onDone={() => {
          queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.requests });
          queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.requestsAttention });
          queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.requestDetail });
        }}
        messages={{
          success: text.successMessage,
          errorFallback: 'No se pudo actualizar el pedido',
          logError: 'Error al actualizar el pedido',
        }}
        logger={logger}
        resetOnClose
      />
    </>
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
