'use client';

import { CertificationAmount } from '@/features/Comercial/Certificaciones/components/CertificationAmount';
import { VAT_RATE_LABELS, type VoucherLetter } from '@/shared/lib/arca/catalogs';
import { formatAmountText } from '@/shared/utils/amount-text';
import { useDeferredValue, useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { countLabel } from '../../utils/invoice-links';
import { previewTotals, type EditorValues } from './editor-form';

/**
 * Totales del borrador, calculados en el navegador con la misma fórmula que el servidor. Lee las
 * líneas con `useWatch` + `useDeferredValue`: con muchas líneas el input no se traba y el total se
 * pone al día un instante después. La región `role="status"` existe siempre (si se montara recién
 * al cambiar, el lector de pantalla no la anunciaría).
 */
export function InvoiceTotals({ letter, currency }: { letter: VoucherLetter; currency: string }) {
  const { control } = useFormContext<EditorValues>();
  const lines = useWatch({ control, name: 'lines' });
  const deferredLines = useDeferredValue(lines);
  const { totals, skipped } = useMemo(() => previewTotals(deferredLines, letter), [deferredLines, letter]);

  return (
    <section aria-labelledby="invoice-totals-title" className="flex flex-col gap-2" data-field="total" tabIndex={-1}>
      <h2 id="invoice-totals-title" className="sr-only">
        Totales
      </h2>
      <dl className="flex flex-col gap-1.5 text-sm">
        {letter !== 'C' && (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground font-medium">Neto gravado</dt>
              <dd className="text-right whitespace-nowrap tabular-nums">
                <CertificationAmount value={totals.netTaxed} currency={currency} />
              </dd>
            </div>
            {totals.vatBreakdown.map((vat) => (
              <div key={vat.vatRateId} className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground font-medium">IVA {VAT_RATE_LABELS[vat.vatRateId]}</dt>
                <dd className="text-right whitespace-nowrap tabular-nums">
                  <CertificationAmount value={vat.amount} currency={currency} />
                </dd>
              </div>
            ))}
          </>
        )}
        <div className="border-foreground mt-1 flex items-baseline justify-between gap-3 border-t pt-2">
          <dt className="font-semibold">Total</dt>
          <dd className="text-right text-xl font-semibold whitespace-nowrap tabular-nums">
            <CertificationAmount value={totals.total} currency={currency} />
          </dd>
        </div>
      </dl>
      {letter === 'C' && <p className="text-muted-foreground text-xs">La Factura C no discrimina IVA.</p>}
      {skipped > 0 && (
        <p className="text-xs text-warn-subtle-foreground">
          {countLabel(skipped, 'línea incompleta no suma', 'líneas incompletas no suman')} al total.
        </p>
      )}
      <p role="status" className="sr-only">
        Total {currency} {formatAmountText(totals.total)}
      </p>
    </section>
  );
}
