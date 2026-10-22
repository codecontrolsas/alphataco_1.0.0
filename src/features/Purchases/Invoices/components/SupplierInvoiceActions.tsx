'use client';

import { Button } from '@/components/ui/button';
import { Logger } from '@/lib/logger';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Ban, CircleX, Pencil, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { checkSupplierInvoiceInArca } from '../../actions/invoice-arca.server';
import { approveSupplierInvoice, cancelSupplierInvoice, rejectSupplierInvoice } from '../../actions/invoices.server';
import { ConfirmAction } from '../../components/ConfirmAction';
import { invalidatePurchases } from '../../lib/invalidate';
import type { SupplierInvoiceDetail } from '../../lib/invoice-query-types';

const logger = new Logger('Purchases/SupplierInvoiceActions');

/** Editar, constatar en ARCA, aprobar o rechazar (observadas) y anular un comprobante. */
export function SupplierInvoiceActions({ invoice }: { invoice: SupplierInvoiceDetail }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const check = useMutation({
    mutationFn: async () => unwrapAction(await checkSupplierInvoiceInArca(invoice.id)),
    onSuccess: ({ result, message }) => {
      if (result === 'APPROVED') toast.success(message);
      else toast.warning(message);
      invalidatePurchases(queryClient);
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al constatar en ARCA', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo constatar el comprobante');
    },
  });

  const { can } = invoice;
  if (!can.edit && !can.approve && !can.cancel && !can.check) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {can.edit && (
        <Button asChild size="sm" variant="outline">
          <Link href={`/dashboard/purchases/invoices/${invoice.id}/edit`}>
            <Pencil className="mr-1 h-4 w-4" />
            Editar
          </Link>
        </Button>
      )}
      {can.check && (
        <Button type="button" size="sm" variant="outline" disabled={check.isPending} onClick={() => check.mutate()}>
          <ShieldCheck className="mr-1 h-4 w-4" />
          {check.isPending ? 'Consultando ARCA…' : 'Constatar en ARCA'}
        </Button>
      )}
      {can.approve && (
        <>
          <ConfirmAction
            icon={BadgeCheck}
            variant="default"
            label="Aprobar"
            title={`¿Aprobar ${invoice.label}?`}
            description="Queda a pagar con las diferencias que tiene. Dejá asentado por qué se acepta."
            confirmLabel="Aprobar"
            successMessage={`${invoice.label} aprobada`}
            motive={{ label: 'Comentario', placeholder: 'Obligatorio: por qué se acepta', required: true }}
            run={(notes) => approveSupplierInvoice(invoice.id, notes)}
          />
          <ConfirmAction
            icon={CircleX}
            label="Rechazar"
            title={`¿Rechazar ${invoice.label}?`}
            description="No se paga tal cual y deja de contar como facturado contra la OC. Pedile al proveedor la nota de crédito o el comprobante correcto."
            confirmLabel="Rechazar"
            successMessage={`${invoice.label} rechazada`}
            motive={{ label: 'Motivo', placeholder: 'Obligatorio', required: true }}
            run={(notes) => rejectSupplierInvoice(invoice.id, notes)}
          />
        </>
      )}
      {can.cancel && (
        <ConfirmAction
          icon={Ban}
          variant="destructive"
          label="Anular"
          title={`¿Anular ${invoice.label}?`}
          description="Sale del Libro IVA y libera lo facturado contra la OC. Usalo para un comprobante mal cargado; se puede volver a cargar."
          confirmLabel="Anular comprobante"
          successMessage={`${invoice.label} anulada`}
          motive={{ label: 'Motivo', placeholder: 'Obligatorio', required: true }}
          run={(notes) => cancelSupplierInvoice(invoice.id, notes)}
        />
      )}
    </div>
  );
}
