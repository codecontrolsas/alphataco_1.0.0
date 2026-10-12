'use client';

import { Button } from '@/components/ui/button';
import { unwrapAction } from '@/features/Warehouses/lib/unwrap-action';
import { DownloadPdfButton } from '@/shared/components/common/DownloadPdfButton';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, CheckCheck, FilePlus2, Pencil, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createPurchaseOrderFromQuote } from '../../actions/orders.server';
import {
  cancelPurchaseQuote,
  declinePurchaseQuote,
  getPurchaseQuotePdf,
  markPurchaseQuoteSent,
  sendPurchaseQuote,
  type PurchaseQuoteDetail,
} from '../../actions/quotes.server';
import { ConfirmAction } from '../../components/ConfirmAction';
import { SendToSupplierDialog } from '../../components/SendToSupplierDialog';
import { invalidatePurchases } from '../../lib/invalidate';
import { QuoteResponseDialog } from './QuoteResponseDialog';

/** Botones del detalle del pedido de cotizacion segun su estado y los permisos. */
export function PurchaseQuoteActions({ quote }: { quote: PurchaseQuoteDetail }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const order = useMutation({
    mutationFn: async () => unwrapAction(await createPurchaseOrderFromQuote(quote.id)),
    onSuccess: ({ id, number, skipped }) => {
      toast.success(`Se creó la orden de compra ${number}`, {
        description:
          skipped > 0
            ? `Se omitieron ${skipped} líneas que ya estaban pedidas.`
            : 'Quedó en borrador: revisala y enviala a aprobación.',
      });
      invalidatePurchases(queryClient);
      router.push(`/dashboard/purchases/orders/${id}/edit`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo generar la orden de compra'),
  });

  const { can } = quote;
  return (
    <div className="flex flex-wrap gap-2">
      {can.edit && (
        <Button asChild size="sm" variant="outline">
          <Link href={`/dashboard/purchases/quotes/${quote.id}/edit`}>
            <Pencil className="mr-1 h-4 w-4" />
            Editar
          </Link>
        </Button>
      )}
      {can.send && (
        <>
          <SendToSupplierDialog
            documentLabel={`el pedido de cotización ${quote.number}`}
            recipients={quote.recipients}
            send={(values) => sendPurchaseQuote(quote.id, values)}
            loadPdf={() => getPurchaseQuotePdf(quote.id)}
          />
          <ConfirmAction
            icon={CheckCheck}
            label="Marcar como enviado"
            title={`¿Marcar ${quote.number} como enviado?`}
            description="Para cuando se lo pediste al proveedor por otro medio (teléfono, WhatsApp). No se manda ningún mail."
            confirmLabel="Marcar como enviado"
            successMessage={`Pedido ${quote.number} marcado como enviado`}
            run={() => markPurchaseQuoteSent(quote.id)}
          />
        </>
      )}
      {can.receive && <QuoteResponseDialog quote={quote} />}
      {can.order && (
        <Button type="button" size="sm" onClick={() => order.mutate()} disabled={order.isPending}>
          <FilePlus2 className="mr-1 h-4 w-4" />
          {order.isPending ? 'Generando…' : 'Generar OC'}
        </Button>
      )}
      {can.decline && (
        <ConfirmAction
          icon={XCircle}
          label="No cotiza"
          title={`¿${quote.supplier.name} no cotiza?`}
          description="El pedido queda cerrado como 'No cotiza' y no se puede generar una orden de compra desde él."
          confirmLabel="No cotiza"
          successMessage={`Pedido ${quote.number} marcado como "no cotiza"`}
          run={() => declinePurchaseQuote(quote.id)}
        />
      )}
      <DownloadPdfButton load={() => getPurchaseQuotePdf(quote.id)} />
      {can.cancel && (
        <ConfirmAction
          icon={Ban}
          label="Anular"
          title={`¿Anular ${quote.number}?`}
          description={
            quote.status === 'SENT'
              ? 'Ya se le pidió al proveedor: avisale que queda sin efecto.'
              : 'El pedido queda anulado.'
          }
          confirmLabel="Anular"
          successMessage={`Pedido ${quote.number} anulado`}
          motive={{ label: 'Motivo', placeholder: 'Obligatorio', required: true }}
          run={(notes) => cancelPurchaseQuote(quote.id, notes)}
        />
      )}
    </div>
  );
}
