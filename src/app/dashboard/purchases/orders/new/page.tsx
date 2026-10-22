import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { NewPurchaseOrderPage } from '@/features/Purchases/Orders/PurchaseOrderPages';
import { notFound } from 'next/navigation';

export const metadata = { title: 'Nueva orden de compra | Compras' };

export default async function NewPurchaseOrderRoute({ searchParams }: { searchParams: Promise<{ fromRequest?: string }> }) {
  if (!(await checkPermissionServer('compras', 'ordenes', 'create'))) notFound();
  const { fromRequest } = await searchParams;
  return <NewPurchaseOrderPage fromRequest={fromRequest} />;
}
