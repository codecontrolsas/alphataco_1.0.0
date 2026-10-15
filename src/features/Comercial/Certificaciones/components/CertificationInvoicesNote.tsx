import { INVOICE_STATUS_LABELS } from '@/features/Comercial/Facturacion/lib/invoice-state-machine';
import { Receipt } from 'lucide-react';
import Link from 'next/link';
import type { CertificationDetail } from '../actions/certifications.server';

const INVOICE_LINK_CLASS =
  'font-medium whitespace-nowrap tabular-nums underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

/**
 * Comprobantes que facturan (o facturaron) la certificación. Los vigentes van primero: autorizado
 * = "Facturada en…"; en curso (borrador, pendiente…) = "Incluida en…", porque la certificación ya
 * quedó reservada. Los liberados por una nota de crédito total quedan como línea histórica.
 */
export function CertificationInvoicesNote({
  status,
  invoices,
}: {
  status: CertificationDetail['status'];
  invoices: CertificationDetail['invoices'];
}) {
  if (invoices.length === 0) return null;
  const current = invoices.filter((invoice) => !invoice.released);
  const released = invoices.filter((invoice) => invoice.released);

  return (
    <div role="note" className="flex items-start gap-3 rounded-md border px-4 py-3 text-sm">
      <Receipt className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-1 text-pretty">
        {current.map((invoice) =>
          invoice.status === 'autorizada' ? (
            <p key={invoice.id}>
              Facturada en{' '}
              <Link href={`/dashboard/comercial/facturacion/${invoice.id}`} className={INVOICE_LINK_CLASS}>
                {invoice.label}
              </Link>
              .
            </p>
          ) : (
            <p key={invoice.id}>
              Incluida en{' '}
              <Link href={`/dashboard/comercial/facturacion/${invoice.id}`} className={INVOICE_LINK_CLASS}>
                {invoice.label}
              </Link>{' '}
              ({INVOICE_STATUS_LABELS[invoice.status].toLowerCase()}): no se puede incluir en otra factura.
            </p>
          )
        )}
        {status === 'facturada' && (
          <p className="text-muted-foreground">
            Para anularla, primero emití una nota de crédito total sobre la factura.
          </p>
        )}
        {released.map((invoice) => (
          <p key={invoice.id} className="text-muted-foreground">
            Estuvo facturada en{' '}
            <Link href={`/dashboard/comercial/facturacion/${invoice.id}`} className={INVOICE_LINK_CLASS}>
              {invoice.label}
            </Link>{' '}
            (anulada con nota de crédito).
          </p>
        ))}
      </div>
    </div>
  );
}
