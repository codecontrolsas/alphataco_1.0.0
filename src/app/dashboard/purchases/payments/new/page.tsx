import { getPaymentOrderFormData } from '@/features/Purchases/actions/payment-orders.server';
import { NewPaymentOrderPage } from '@/features/Purchases/Payments/PaymentPages';
import { notFound } from 'next/navigation';

export const metadata = { title: 'Nueva orden de pago | Compras' };

export default async function NewPaymentOrderRoute({ searchParams }: { searchParams: Promise<{ supplier?: string; invoices?: string; checks?: string }> }) {
  const { supplier, invoices, checks } = await searchParams;
  const data = await getPaymentOrderFormData(supplier);
  if (!data) notFound();
  return <NewPaymentOrderPage data={data} invoiceIds={(invoices ?? '').split(',').filter(Boolean)} checkIds={(checks ?? '').split(',').filter(Boolean)} />;
}
