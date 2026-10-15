import { getPurchaseOrderDetail } from '@/features/Purchases/actions/order-queries.server';
import { EditPurchaseOrderPage } from '@/features/Purchases/Orders/PurchaseOrderPages';
import { notFound } from 'next/navigation';

export const metadata = { title: 'Editar orden de compra | Compras' };

export default async function EditPurchaseOrderRoute({ params }: { params: Promise<{ id: string }> }) {
  const order = await getPurchaseOrderDetail((await params).id);
  if (!order || !order.can.edit) notFound();
  return <EditPurchaseOrderPage order={order} />;
}
