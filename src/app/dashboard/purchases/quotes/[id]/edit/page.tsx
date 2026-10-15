import { getPurchaseQuoteDetail } from '@/features/Purchases/actions/quote-queries.server';
import { EditPurchaseQuotePage } from '@/features/Purchases/Quotes/PurchaseQuotePages';
import { notFound } from 'next/navigation';

export const metadata = { title: 'Editar pedido de cotización | Compras' };

export default async function EditPurchaseQuoteRoute({ params }: { params: Promise<{ id: string }> }) {
  const quote = await getPurchaseQuoteDetail((await params).id);
  if (!quote || !quote.can.edit) notFound();
  return <EditPurchaseQuotePage quote={quote} />;
}
