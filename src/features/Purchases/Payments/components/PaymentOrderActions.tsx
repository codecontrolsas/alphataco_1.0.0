'use client';

import { Button } from '@/components/ui/button';
import type { TreasuryAccountRow } from '@/features/Treasury/actions/accounts.server';
import { DownloadPdfButton } from '@/shared/components/common/DownloadPdfButton';
import { Ban, CheckCircle2, CircleX, Pencil, SendHorizontal, Undo2 } from 'lucide-react';
import Link from 'next/link';
import {
  approvePaymentOrder,
  backToDraftPaymentOrder,
  getPaymentOrderPdf,
  rejectPaymentOrder,
  sendPaymentOrder,
  submitPaymentOrder,
} from '../../actions/payment-orders.server';
import { cancelPaymentOrder } from '../../actions/payment-register.server';
import type { PaymentOrderDetail } from '../../lib/payment-query-types';
import { ConfirmAction } from '../../components/ConfirmAction';
import { SendToSupplierDialog } from '../../components/SendToSupplierDialog';
import { RegisterPaymentDialog } from './RegisterPaymentDialog';

/** Botones del detalle de la orden de pago segun su estado y los permisos (calculados en el servidor). */
export function PaymentOrderActions({
  order,
  accounts,
}: {
  order: PaymentOrderDetail;
  accounts: TreasuryAccountRow[];
}) {
  const { can } = order;
  return (
    <div className="flex flex-wrap gap-2">
      {can.edit && (
        <Button asChild size="sm" variant="outline">
          <Link href={`/dashboard/purchases/payments/${order.id}/edit`}>
            <Pencil className="mr-1 h-4 w-4" />
            Editar
          </Link>
        </Button>
      )}
      {can.submit && (
        <ConfirmAction
          icon={SendHorizontal}
          variant="default"
          label="Enviar a aprobación"
          title={`¿Enviar ${order.number} a aprobación?`}
          description="Las retenciones quedan como están calculadas. Si hay que cambiar algo, se vuelve a borrador."
          confirmLabel="Enviar a aprobación"
          successMessage={`${order.number} enviada a aprobación`}
          run={() => submitPaymentOrder(order.id)}
        />
      )}
      {can.approve && (
        <>
          <ConfirmAction
            icon={CheckCircle2}
            variant="default"
            label="Aprobar"
            title={`¿Aprobar ${order.number}?`}
            description="Queda lista para pagar con estas retenciones."
            confirmLabel="Aprobar"
            successMessage={`${order.number} aprobada`}
            run={() => approvePaymentOrder(order.id)}
          />
          <ConfirmAction
            icon={CircleX}
            label="Rechazar"
            title={`¿Rechazar ${order.number}?`}
            description="Vuelve a borrador para que la corrijan."
            confirmLabel="Rechazar"
            successMessage={`${order.number} rechazada`}
            motive={{ label: 'Motivo', placeholder: 'Obligatorio', required: true }}
            run={(notes) => rejectPaymentOrder(order.id, notes)}
          />
        </>
      )}
      {can.pay && (
        <RegisterPaymentDialog
          orderId={order.id}
          number={order.number}
          netTotal={order.totals.netTotal}
          plannedOn={order.plannedOn}
          accounts={accounts}
        />
      )}
      {can.backToDraft && (
        <ConfirmAction
          icon={Undo2}
          label="Volver a borrador"
          title={`¿Volver ${order.number} a borrador?`}
          description="Se puede editar y las retenciones se recalculan al guardar. Después hay que volver a aprobarla."
          confirmLabel="Volver a borrador"
          successMessage={`${order.number} volvió a borrador`}
          run={() => backToDraftPaymentOrder(order.id)}
        />
      )}
      {can.send && (
        <SendToSupplierDialog
          documentLabel={`la orden de pago ${order.number}`}
          recipients={order.recipients}
          send={(values) => sendPaymentOrder(order.id, values)}
          loadPdf={() => getPaymentOrderPdf(order.id)}
        />
      )}
      <DownloadPdfButton load={() => getPaymentOrderPdf(order.id)} />
      {can.cancel && (
        <ConfirmAction
          icon={Ban}
          variant="destructive"
          label="Anular"
          title={`¿Anular ${order.number}?`}
          description={
            order.status === 'PAID'
              ? 'Libera lo que pagaba y sus certificados de retención quedan anulados (los números no se reusan). Usalo si el pago no se hizo o se revirtió.'
              : 'Libera los comprobantes y anticipos que tenía.'
          }
          confirmLabel="Anular orden"
          successMessage={`${order.number} anulada`}
          motive={{ label: 'Motivo', placeholder: 'Obligatorio', required: true }}
          run={(notes) => cancelPaymentOrder(order.id, notes)}
        />
      )}
    </div>
  );
}
