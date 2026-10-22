import { getReceiptFormData } from '@/features/Purchases/actions/receipt-queries.server';
import { NewPurchaseReceiptPage } from '@/features/Purchases/Receipts/ReceiptPages';
import { notFound } from 'next/navigation';

export const metadata = { title: 'Registrar recepción | Compras' };

export default async function NewPurchaseReceiptRoute({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { order } = await searchParams;
  const data = order ? await getReceiptFormData(order) : null;
  if (!data) notFound();
  return <NewPurchaseReceiptPage data={data} />;
}
