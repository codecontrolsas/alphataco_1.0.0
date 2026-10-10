import { getPaymentOrderDetail } from '@/features/Purchases/actions/payment-orders.server';
import { getTreasuryAccounts } from '@/features/Treasury/actions/accounts.server';
import { PaymentOrderPage } from '@/features/Purchases/Payments/PaymentPages';
import { notFound } from 'next/navigation';
import { cache } from 'react';

// Una sola lectura para la pagina y el titulo.
const getOrder = cache(getPaymentOrderDetail);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const order = await getOrder((await params).id);
  return { title: order ? `${order.number} | Compras` : 'Orden de pago | Compras' };
}

export default async function PaymentOrderRoute({ params }: { params: Promise<{ id: string }> }) {
  const order = await getOrder((await params).id);
  if (!order) notFound();
  const accounts = order.can.pay ? await getTreasuryAccounts() : [];
  return <PaymentOrderPage order={order} accounts={accounts} />;
}
