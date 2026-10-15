import { getPurchaseOrderDetail } from '@/features/Purchases/actions/order-queries.server';
import { PurchaseOrderPage } from '@/features/Purchases/Orders/PurchaseOrderPages';
import { notFound } from 'next/navigation';
import { cache } from 'react';

// Una sola lectura para la pagina y el titulo.
const getOrder = cache(getPurchaseOrderDetail);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const order = await getOrder((await params).id);
  return { title: order ? `${order.number} | Compras` : 'Orden de compra | Compras' };
}

export default async function PurchaseOrderRoute({ params }: { params: Promise<{ id: string }> }) {
  const order = await getOrder((await params).id);
  if (!order) notFound();
  return <PurchaseOrderPage order={order} />;
}
