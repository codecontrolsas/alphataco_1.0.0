import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { PaymentOrderDetail, PaymentOrderFormData } from '../actions/payment-orders.server';
import type { TreasuryAccountRow } from '@/features/Treasury/actions/accounts.server';
import type { PaymentOrderFormValues } from '../schemas/payment-orders';
import { PaymentOrderDetailView } from './components/PaymentOrderDetailView';
import { PaymentOrderForm } from './components/PaymentOrderForm';

function Shell({ title, back, children }: { title?: string; back: { href: string; label: string }; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={back.href}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          {back.label}
        </Link>
      </Button>
      {title && <h1 className="text-2xl font-semibold">{title}</h1>}
      {children}
    </div>
  );
}

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
    plannedOn: moment().format('YYYY-MM-DD'),
    notes: '',
    lines: [
      ...open.map((i) => ({ kind: i.isCredit ? ('CREDIT_NOTE' as const) : ('INVOICE' as const), invoiceId: i.id, sourceLineId: '', amount: i.pending })),
      ...debts.map((d) => ({ kind: 'REJECTED_CHECK' as const, invoiceId: '', sourceLineId: '', checkId: d.checkId, amount: d.pending })),
    ],
    advance: { amount: '', purchaseOrderId: '', description: '' },
    manualWithholdings: [],
  };
  return (
    <Shell title="Nueva orden de pago" back={LIST}>
      <PaymentOrderForm mode={{ kind: 'create' }} initialValues={values} initialData={data} initialSupplierLabel={data.supplier?.name ?? null} />
    </Shell>
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
    <Shell title={`Editar ${number}`} back={{ href: `/dashboard/purchases/payments/${orderId}`, label: number }}>
      <PaymentOrderForm mode={{ kind: 'edit', orderId, number }} initialValues={values} initialData={data} initialSupplierLabel={data.supplier?.name ?? null} />
    </Shell>
  );
}

export function PaymentOrderPage({ order, accounts }: { order: PaymentOrderDetail; accounts: TreasuryAccountRow[] }) {
  return (
    <Shell back={LIST}>
      <PaymentOrderDetailView order={order} accounts={accounts} />
    </Shell>
  );
}
