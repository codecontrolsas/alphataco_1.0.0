'use client';

import { Button } from '@/components/ui/button';
import { joinList } from '@/features/Empresa/General/FiscalData/utils/format';
import { formatCuitText } from '@/shared/utils/cuit-text';
import { ExternalLink, RefreshCw, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import type { InvoiceView } from '../../actions/invoices.server';
import { customerHref } from '../../utils/invoice-links';

/**
 * Receptor, de solo lectura: los datos fiscales se editan en la ficha del cliente (no se edita un
 * form dentro de otro form). Si falta algo para emitir, se dice qué y dónde se carga; la ficha se
 * abre en otra pestaña para no perder el borrador, y "Ya los completé" vuelve a leer sin recargar.
 */
export function InvoiceReceiver({ customer }: { customer: InvoiceView['customer'] }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();

  const missing: string[] = [];
  if (customer.vatConditionId === null) missing.push('la condición frente al IVA');
  if (!customer.street || !customer.city || !customer.postalCode) missing.push('el domicilio fiscal');

  const address = [customer.street, customer.city, customer.province, customer.postalCode].filter(Boolean).join(', ');

  return (
    <section
      aria-labelledby="invoice-receiver-title"
      className="flex flex-col gap-2"
      data-field="customer"
      tabIndex={-1}
    >
      <h2 id="invoice-receiver-title" className="text-lg font-semibold">
        Receptor
      </h2>
      <p className="text-sm text-pretty">
        <span className="font-medium break-words">{customer.name}</span>
        <span className="text-muted-foreground">
          {' · '}
          <span className="tabular-nums whitespace-nowrap">CUIT {formatCuitText(customer.cuit)}</span>
          {customer.vatConditionLabel && ` · ${customer.vatConditionLabel}`}
          {address && ` · ${address}`}
        </span>
      </p>

      {missing.length > 0 && (
        <div className="border-destructive/40 text-destructive flex items-start gap-3 border px-4 py-3 text-sm">
          <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-pretty">
              A {customer.name} le falta {joinList(missing)}. Sin esos datos no se puede determinar el tipo de factura
              ni emitirla.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={customerHref(customer.id)}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1 font-medium underline underline-offset-4"
              >
                Completar datos fiscales del cliente
                <ExternalLink className="size-3.5" aria-hidden />
                <span className="sr-only">(se abre en otra pestaña)</span>
              </Link>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={refreshing}
                onClick={() => startRefresh(() => router.refresh())}
              >
                <RefreshCw className={refreshing ? 'animate-spin' : undefined} aria-hidden />
                Ya los completé, actualizar
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
