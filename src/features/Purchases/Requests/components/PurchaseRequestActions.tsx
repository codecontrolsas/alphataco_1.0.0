'use client';

import { Button } from '@/components/ui/button';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, Copy, FilePlus2, Lock, Pencil, Send, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  approvePurchaseRequest,
  cancelPurchaseRequest,
  closePurchaseRequest,
  copyPurchaseRequest,
  rejectPurchaseRequest,
  submitPurchaseRequest,
} from '../../actions/requests.server';
import { ConfirmAction } from '../../components/ConfirmAction';
import { PURCHASES_QUERY_KEYS } from '../../lib/query-keys';
import type { PurchaseRequestDetail } from '../../lib/request-query-types';
import { RequestQuotesDialog } from './RequestQuotesDialog';

/** Botones del detalle segun el estado de la solicitud y los permisos (vienen calculados del servidor). */
export function PurchaseRequestActions({ request }: { request: PurchaseRequestDetail }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const copy = useMutation({
    mutationFn: async () => unwrapAction(await copyPurchaseRequest(request.id)),
    onSuccess: ({ id, number }) => {
      toast.success(`Borrador ${number} creado a partir de ${request.number}`);
      void queryClient.invalidateQueries({ queryKey: PURCHASES_QUERY_KEYS.requests });
      router.push(`/dashboard/purchases/requests/${id}/edit`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo copiar la solicitud'),
  });

  const { can } = request;
  return (
    <div className="flex flex-wrap gap-2">
      {can.edit && (
        <Button asChild size="sm" variant="outline">
          <Link href={`/dashboard/purchases/requests/${request.id}/edit`}>
            <Pencil className="mr-1 h-4 w-4" />
            Editar
          </Link>
        </Button>
      )}
      {can.submit && (
        <ConfirmAction
          icon={Send}
          variant="default"
          label="Enviar a aprobación"
          title={`¿Enviar ${request.number} a aprobación?`}
          description="Después de enviarla ya no se puede editar: si hay que cambiar algo, se anula y se copia."
          confirmLabel="Enviar"
          successMessage={`Solicitud ${request.number} enviada a aprobación`}
          run={() => submitPurchaseRequest(request.id)}
        />
      )}
      {can.approve && (
        <>
          <ConfirmAction
            icon={Check}
            variant="default"
            label="Aprobar"
            title={`¿Aprobar ${request.number}?`}
            description="Se le avisa por mail a quien la pidió."
            confirmLabel="Aprobar"
            successMessage={`Solicitud ${request.number} aprobada`}
            motive={{ label: 'Comentario (opcional)', placeholder: 'Para quien la pidió', required: false }}
            run={(notes) => approvePurchaseRequest(request.id, notes)}
          />
          <ConfirmAction
            icon={X}
            variant="destructive"
            label="Rechazar"
            title={`¿Rechazar ${request.number}?`}
            description="El rechazo es final: para volver a pedirla se copia como una nueva. Se le avisa por mail a quien la pidió."
            confirmLabel="Rechazar"
            successMessage={`Solicitud ${request.number} rechazada`}
            motive={{ label: 'Motivo del rechazo', placeholder: 'Obligatorio', required: true }}
            run={(notes) => rejectPurchaseRequest(request.id, notes)}
          />
        </>
      )}
      {can.cancel && (
        <ConfirmAction
          icon={Ban}
          variant="outline"
          label="Anular"
          title={`¿Anular ${request.number}?`}
          description="La solicitud queda anulada y no se puede retomar; se puede copiar como una nueva."
          confirmLabel="Anular"
          successMessage={`Solicitud ${request.number} anulada`}
          motive={{ label: 'Motivo', placeholder: 'Obligatorio', required: true }}
          run={(notes) => cancelPurchaseRequest(request.id, notes)}
        />
      )}
      {can.requestQuote && <RequestQuotesDialog request={request} />}
      {can.createOrder && (
        <Button asChild size="sm" variant="outline">
          <Link href={`/dashboard/purchases/orders/new?fromRequest=${request.id}`}>
            <FilePlus2 className="mr-1 h-4 w-4" />
            Generar OC
          </Link>
        </Button>
      )}
      {can.close && (
        <ConfirmAction
          icon={Lock}
          variant="outline"
          label="Cerrar"
          title={`¿Cerrar ${request.number}?`}
          description="Se da por terminada sin comprar lo que falta. Lo ya pedido en órdenes de compra sigue su curso; las líneas dejan de ofrecerse para cotizar y pedir."
          confirmLabel="Cerrar solicitud"
          successMessage={`Solicitud ${request.number} cerrada`}
          motive={{ label: 'Motivo', placeholder: 'Obligatorio', required: true }}
          run={(notes) => closePurchaseRequest(request.id, notes)}
        />
      )}
      {can.copy && (
        <Button type="button" size="sm" variant="outline" onClick={() => copy.mutate()} disabled={copy.isPending}>
          <Copy className="mr-1 h-4 w-4" />
          {copy.isPending ? 'Copiando…' : 'Copiar como nueva'}
        </Button>
      )}
    </div>
  );
}
