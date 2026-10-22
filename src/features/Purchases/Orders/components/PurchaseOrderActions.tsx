'use client';

import { Button } from '@/components/ui/button';
import { DownloadPdfButton } from '@/shared/components/common/DownloadPdfButton';
import { Ban, Check, CheckCheck, Lock, PackageCheck, Pencil, Send, X } from 'lucide-react';
import Link from 'next/link';
import { getPurchaseOrderPdf, markPurchaseOrderSent, sendPurchaseOrder } from '../../actions/order-send.server';
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  closePurchaseOrder,
  rejectPurchaseOrder,
  submitPurchaseOrder,
} from '../../actions/orders.server';
import { ConfirmAction } from '../../components/ConfirmAction';
import { ExpiredSupplierDocumentsAlert } from '../../components/ExpiredSupplierDocumentsAlert';
import { SendToSupplierDialog } from '../../components/SendToSupplierDialog';
import type { PurchaseOrderDetail } from '../../lib/order-query-types';

/** Botones del detalle de la OC segun su estado y los permisos (calculados en el servidor). */
export function PurchaseOrderActions({ order }: { order: PurchaseOrderDetail }) {
  const { can } = order;
  const expired = <ExpiredSupplierDocumentsAlert supplierId={order.supplier.id} documents={order.expiredDocuments} />;

  return (
    <div className="flex flex-wrap gap-2">
      {can.edit && (
        <Button asChild size="sm" variant="outline">
          <Link href={`/dashboard/purchases/orders/${order.id}/edit`}>
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
          title={`¿Enviar ${order.number} a aprobación?`}
          description="Se vuelven a revisar el proveedor y lo que falta de cada línea. Mientras espera la aprobación no se puede editar."
          confirmLabel="Enviar"
          successMessage={`Orden ${order.number} enviada a aprobación`}
          run={() => submitPurchaseOrder(order.id)}
        />
      )}
      {can.approve && (
        <>
          <ConfirmAction
            icon={Check}
            variant="default"
            label="Aprobar"
            title={`¿Aprobar ${order.number}?`}
            description={
              order.complements
                ? 'Queda recibida: el excedente ya está en el depósito. Se le avisa por mail a quien la creó.'
                : 'Queda lista para enviar al proveedor. Se le avisa por mail a quien la creó.'
            }
            confirmLabel="Aprobar"
            successMessage={`Orden ${order.number} aprobada`}
            run={() => approvePurchaseOrder(order.id)}
          >
            {expired}
          </ConfirmAction>
          <ConfirmAction
            icon={X}
            variant="destructive"
            label="Rechazar"
            title={`¿Rechazar ${order.number}?`}
            description="Vuelve a borrador para que la corrijan, con el motivo. Se le avisa por mail a quien la creó."
            confirmLabel="Rechazar"
            successMessage={`Orden ${order.number} devuelta a borrador`}
            motive={{ label: 'Motivo del rechazo', placeholder: 'Obligatorio', required: true }}
            run={(notes) => rejectPurchaseOrder(order.id, notes)}
          />
        </>
      )}
      {can.send && (
        <SendToSupplierDialog
          documentLabel={`la orden de compra ${order.number}`}
          recipients={order.recipients}
          send={(values) => sendPurchaseOrder(order.id, values)}
          loadPdf={() => getPurchaseOrderPdf(order.id)}
          warning={expired}
        />
      )}
      {can.markSent && (
        <ConfirmAction
          icon={CheckCheck}
          variant="outline"
          label="Marcar como enviada"
          title={`¿Marcar ${order.number} como enviada?`}
          description="Para cuando se la hiciste llegar al proveedor por otro medio (WhatsApp, en mano). No se manda ningún mail."
          confirmLabel="Marcar como enviada"
          successMessage={`Orden ${order.number} marcada como enviada`}
          run={() => markPurchaseOrderSent(order.id)}
        />
      )}
      {can.receive && (
        <Button asChild size="sm">
          <Link href={`/dashboard/purchases/receipts/new?order=${order.id}`}>
            <PackageCheck className="mr-1 h-4 w-4" />
            Registrar recepción
          </Link>
        </Button>
      )}
      {can.pdf && <DownloadPdfButton load={() => getPurchaseOrderPdf(order.id)} />}
      {can.close && (
        <ConfirmAction
          icon={Lock}
          variant="outline"
          label="Cerrar"
          title={`¿Cerrar ${order.number}?`}
          description="Se da por terminada sin recibir lo que falta. Lo no recibido vuelve a quedar pendiente en sus solicitudes, para pedirlo a otro proveedor."
          confirmLabel="Cerrar orden"
          successMessage={`Orden ${order.number} cerrada`}
          motive={{ label: 'Motivo', placeholder: 'Obligatorio', required: true }}
          run={(notes) => closePurchaseOrder(order.id, notes)}
        />
      )}
      {can.cancel && (
        <ConfirmAction
          icon={Ban}
          variant="outline"
          label="Anular"
          title={`¿Anular ${order.number}?`}
          description={
            order.status === 'SENT'
              ? 'La orden ya se le envió al proveedor: avisale que queda sin efecto. Lo que pedía vuelve a quedar pendiente en sus solicitudes.'
              : 'Lo que pedía vuelve a quedar pendiente en sus solicitudes.'
          }
          confirmLabel="Anular"
          successMessage={`Orden ${order.number} anulada`}
          motive={{ label: 'Motivo', placeholder: 'Obligatorio', required: true }}
          run={(notes) => cancelPurchaseOrder(order.id, notes)}
        />
      )}
    </div>
  );
}
