import { DEFAULT_VAT_RATE_ID } from '@/shared/lib/arca/catalogs';
import { PurchasesPageShell } from '../components/PurchasesPageShell';
import { getSupplierPurchaseContext, searchOrderableRequestLines } from '../actions/order-queries.server';
import type { PurchaseOrderDetail } from '../lib/order-query-types';
import { emptyPurchaseOrderLine, type PurchaseOrderFormValues } from '../schemas/orders';
import { PurchaseOrderDetailView } from './components/PurchaseOrderDetailView';
import { trimDecimals } from '../lib/quantity-format';
import { PurchaseOrderForm, type LineOptions } from './components/PurchaseOrderForm';

const BACK_TO_LIST = { href: '/dashboard/purchases?tab=ordenes', label: 'Órdenes de compra' };

/** El proveedor sugerido mas repetido entre las lineas, para precargar la OC desde una solicitud. */
function mostSuggested(ids: readonly (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const id of ids) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Alta de una OC: en blanco, o con las lineas con faltante de una solicitud (`?fromRequest=`). */
export async function NewPurchaseOrderPage({ fromRequest }: { fromRequest?: string }) {
  const empty: PurchaseOrderFormValues = {
    supplierId: '',
    deliveryDate: '',
    deliveryPlace: '',
    paymentTermDays: '',
    notes: '',
    lines: [emptyPurchaseOrderLine()],
  };
  if (!fromRequest) {
    return (
      <PurchasesPageShell title="Nueva orden de compra" back={BACK_TO_LIST}>
        <PurchaseOrderForm mode={{ kind: 'create' }} defaultValues={empty} initialSupplierLabel={null} initialLineOptions={{}} />
      </PurchasesPageShell>
    );
  }

  const { items } = await searchOrderableRequestLines('', { requestId: fromRequest });
  const supplierId = mostSuggested(items.map((item) => item.suggestedSupplierId));
  const supplier = supplierId ? await getSupplierPurchaseContext(supplierId) : null;
  const usableSupplier = supplier?.isActive ? supplier : null;
  const defaultValues: PurchaseOrderFormValues = {
    ...empty,
    supplierId: usableSupplier?.id ?? '',
    lines:
      items.length > 0
        ? items.map((item) => ({
            requestLineId: item.requestLineId,
            quoteLineId: '',
            quantity: trimDecimals(item.remaining),
            unitPrice: '',
            vatRateId: DEFAULT_VAT_RATE_ID,
          }))
        : [emptyPurchaseOrderLine()],
  };
  const lineOptions: LineOptions = Object.fromEntries(items.map((item) => [item.requestLineId, item]));

  return (
    <PurchasesPageShell title="Nueva orden de compra" back={{ href: `/dashboard/purchases/requests/${fromRequest}`, label: 'Volver a la solicitud' }}>
      <PurchaseOrderForm
        mode={{ kind: 'create' }}
        defaultValues={defaultValues}
        initialSupplierLabel={usableSupplier?.name ?? null}
        initialLineOptions={lineOptions}
      />
    </PurchasesPageShell>
  );
}

export function EditPurchaseOrderPage({ order }: { order: PurchaseOrderDetail }) {
  const lineOptions: LineOptions = Object.fromEntries(order.lineOptions.map((option) => [option.requestLineId, option]));
  return (
    <PurchasesPageShell title={`Editar ${order.number}`} back={{ href: `/dashboard/purchases/orders/${order.id}`, label: order.number }}>
      <PurchaseOrderForm
        mode={{ kind: 'edit', orderId: order.id, number: order.number }}
        defaultValues={order.form}
        initialSupplierLabel={order.supplier.name}
        initialLineOptions={lineOptions}
        complement={order.complements !== null}
      />
    </PurchasesPageShell>
  );
}

export function PurchaseOrderPage({ order }: { order: PurchaseOrderDetail }) {
  return (
    <PurchasesPageShell back={BACK_TO_LIST}>
      <PurchaseOrderDetailView order={order} />
    </PurchasesPageShell>
  );
}
