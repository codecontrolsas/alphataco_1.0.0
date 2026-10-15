'use client';

import { formatMoney } from '@/features/Warehouses/lib/format';
import { type VoucherLetter } from '@/shared/lib/arca/catalogs';
import { computeSupplierInvoiceTotals } from '../../lib/invoice-totals';

export function SupplierInvoiceTotals({
  letter,
  totals,
}: {
  letter: VoucherLetter | null;
  totals: ReturnType<typeof computeSupplierInvoiceTotals>;
}) {
  return (
  <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm tabular-nums">
    <dt className="text-muted-foreground">{letter === 'C' ? 'Importe de las líneas' : 'Neto gravado'}</dt>
    <dd className="text-right">{formatMoney(totals.netTaxed)}</dd>
    {letter !== 'C' && (
      <>
        <dt className="text-muted-foreground">IVA</dt>
        <dd className="text-right">{formatMoney(totals.vatTotal)}</dd>
      </>
    )}
    <dt className="text-muted-foreground">No gravado y exento</dt>
    <dd className="text-right">{formatMoney(String(Number(totals.netUntaxed) + Number(totals.exempt)))}</dd>
    <dt className="text-muted-foreground">Percepciones e impuestos</dt>
    <dd className="text-right">
      {formatMoney(String(Number(totals.vatPerceptions) + Number(totals.grossIncomePerceptions) + Number(totals.otherTaxes)))}
    </dd>
    <dt className="text-base font-semibold">Total</dt>
    <dd className="text-right text-base font-semibold">{formatMoney(totals.total)}</dd>
  </dl>
  );
}
