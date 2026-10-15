import { PurchasesPageShell } from '../components/PurchasesPageShell';
import type { OrderableRequestLineOption } from '../lib/order-query-types';
import type { PurchaseQuoteDetail } from '../lib/quote-query-types';
import { PurchaseQuoteDetailView } from './components/PurchaseQuoteDetailView';
import { PurchaseQuoteForm } from './components/PurchaseQuoteForm';

const BACK_TO_LIST = { href: '/dashboard/purchases?tab=cotizaciones', label: 'Cotizaciones' };

export function NewPurchaseQuotePage() {
  return (
    <PurchasesPageShell title="Nuevo pedido de cotización" back={BACK_TO_LIST}>
      <PurchaseQuoteForm
        mode={{ kind: 'create' }}
        defaultValues={{ supplierId: '', requestLineIds: [], notes: '' }}
        initialSupplierLabel={null}
        initialLines={{}}
      />
    </PurchasesPageShell>
  );
}

export function EditPurchaseQuotePage({ quote }: { quote: PurchaseQuoteDetail }) {
  // Las lineas del borrador, con la cantidad pedida como referencia (el servidor recalcula lo que falta).
  const lines: Record<string, OrderableRequestLineOption> = Object.fromEntries(
    quote.lines.map((line) => [
      line.requestLineId,
      {
        requestLineId: line.requestLineId,
        requestId: line.request.id,
        requestNumber: line.request.number,
        position: line.requestPosition,
        itemLabel: line.itemLabel,
        unitAbbr: line.unitAbbr,
        requested: line.quantity,
        remaining: line.quantity,
        suggestedSupplierId: null,
      },
    ])
  );
  return (
    <PurchasesPageShell title={`Editar ${quote.number}`} back={{ href: `/dashboard/purchases/quotes/${quote.id}`, label: quote.number }}>
      <PurchaseQuoteForm
        mode={{ kind: 'edit', quoteId: quote.id, number: quote.number }}
        defaultValues={quote.form}
        initialSupplierLabel={quote.supplier.name}
        initialLines={lines}
      />
    </PurchasesPageShell>
  );
}

export function PurchaseQuotePage({ quote }: { quote: PurchaseQuoteDetail }) {
  return (
    <PurchasesPageShell back={BACK_TO_LIST}>
      <PurchaseQuoteDetailView quote={quote} />
    </PurchasesPageShell>
  );
}
