import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { NewPurchaseQuotePage } from '@/features/Purchases/Quotes/PurchaseQuotePages';
import { notFound } from 'next/navigation';

export const metadata = { title: 'Nuevo pedido de cotización | Compras' };

export default async function NewPurchaseQuoteRoute() {
  if (!(await checkPermissionServer('compras', 'cotizaciones', 'create'))) notFound();
  return <NewPurchaseQuotePage />;
}
