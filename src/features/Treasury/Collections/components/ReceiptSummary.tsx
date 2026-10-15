'use client';

import { formatInCurrency } from '../../lib/currency-format';
import type { ReceiptPreview } from '../../lib/receipt-preview';

/**
 * Cierre del recibo: (comprobantes + a cuenta) contra (anticipos + retenciones + medios). En la
 * barra fija muestra solo el resultado; en la confirmación, el detalle.
 */
export function ReceiptSummary({ preview, detailed = false, empty = false }: { preview: ReceiptPreview; detailed?: boolean; empty?: boolean }) {
  const t = preview.totals;
  const pesos = (value: string) => formatInCurrency(value, 'ARS');
  const tone = preview.closes ? 'text-ok' : 'text-warn';

  if (!detailed) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm tabular-nums">
        <span className="text-muted-foreground">
          Se cobra {pesos(preview.charged)} · entrega {pesos(preview.delivered)}
        </span>
        <span role="status" className={`font-medium ${empty ? 'text-muted-foreground' : tone}`}>
          {empty ? 'Tildá un comprobante o cargá un cobro a cuenta' : preview.closing}
        </span>
        {preview.missingRates.length > 0 && <span className="text-warn">Falta la cotización del {preview.missingRates.join(' y del ')}</span>}
      </div>
    );
  }

  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm tabular-nums">
      <dt className="text-muted-foreground">Comprobantes</dt>
      <dd className="text-right">{pesos(t.invoices)}</dd>
      {t.advance !== '0.00' && (
        <>
          <dt className="text-muted-foreground">Cobro a cuenta</dt>
          <dd className="text-right">{pesos(t.advance)}</dd>
        </>
      )}
      {t.advancesApplied !== '0.00' && (
        <>
          <dt className="text-muted-foreground">Anticipos aplicados</dt>
          <dd className="text-right">−{pesos(t.advancesApplied)}</dd>
        </>
      )}
      {t.withholdings !== '0.00' && (
        <>
          <dt className="text-muted-foreground">Retenciones</dt>
          <dd className="text-right">−{pesos(t.withholdings)}</dd>
        </>
      )}
      <dt className="font-semibold">Recibido por los medios</dt>
      <dd className="text-right font-semibold">{pesos(t.received)}</dd>
      {t.fxDifference !== '0.00' && (
        <>
          <dt className="text-muted-foreground">Diferencia de cambio (informativa)</dt>
          <dd className="text-right">{pesos(t.fxDifference)}</dd>
        </>
      )}
    </dl>
  );
}
