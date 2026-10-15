import { argentinaDate } from '@/shared/lib/argentina-time';
import { PurchasesPageShell } from '../components/PurchasesPageShell';
import type { PaymentOrderDetail, PaymentOrderFormData } from '../lib/payment-query-types';
import type { TreasuryAccountRow } from '@/features/Treasury/actions/accounts.server';
import type { PaymentOrderFormValues } from '../schemas/payment-orders';
import { PaymentOrderDetailView } from './components/PaymentOrderDetailView';
import { PaymentOrderForm } from './components/PaymentOrderForm';

const LIST = { href: '/dashboard/purchases?tab=pagos', label: 'Pagos' };

/**
 * Alta: con proveedor, comprobantes y deudas de cheques rechazados precargados si viene de
 * Vencimientos (`?supplier=&invoices=&checks=`).
 */
export function NewPaymentOrderPage({ data, invoiceIds, checkIds = [] }: { data: PaymentOrderFormData; invoiceIds: string[]; checkIds?: string[] }) {
  const open = data.openItems.invoices.filter((i) => invoiceIds.includes(i.id));
  const debts = data.openItems.checkDebts.filter((d) => checkIds.includes(d.checkId));
  const values: PaymentOrderFormValues = {
    supplierId: data.supplier?.id ?? '',
    plannedOn: argentinaDate(),
    notes: '',
    lines: [
      ...open.map((i) => ({ kind: i.isCredit ? ('CREDIT_NOTE' as const) : ('INVOICE' as const), invoiceId: i.id, sourceLineId: '', amount: i.pending })),
      ...debts.map((d) => ({ kind: 'REJECTED_CHECK' as const, invoiceId: '', sourceLineId: '', checkId: d.checkId, amount: d.pending })),
    ],
    advance: { amount: '', purchaseOrderId: '', description: '' },
    manualWithholdings: [],
  };
  return (
    <PurchasesPageShell title="Nueva orden de pago" back={LIST}>
      <PaymentOrderForm mode={{ kind: 'create' }} initialValues={values} initialData={data} initialSupplierLabel={data.supplier?.name ?? null} />
    </PurchasesPageShell>
  );
}

export function EditPaymentOrderPage({
  orderId,
  number,
  values,
  data,
}: {
  orderId: string;
  number: string;
  values: PaymentOrderFormValues;
  data: PaymentOrderFormData;
}) {
  return (
    <PurchasesPageShell title={`Editar ${number}`} back={{ href: `/dashboard/purchases/payments/${orderId}`, label: number }}>
      <PaymentOrderForm mode={{ kind: 'edit', orderId, number }} initialValues={values} initialData={data} initialSupplierLabel={data.supplier?.name ?? null} />
    </PurchasesPageShell>
  );
}

export function PaymentOrderPage({ order, accounts }: { order: PaymentOrderDetail; accounts: TreasuryAccountRow[] }) {
  return (
    <PurchasesPageShell back={LIST}>
      <PaymentOrderDetailView order={order} accounts={accounts} />
    </PurchasesPageShell>
  );
}
