import { getPurchaseQuoteDetail } from '@/features/Purchases/actions/quote-queries.server';
import { PurchaseQuotePage } from '@/features/Purchases/Quotes/PurchaseQuotePages';
import { notFound } from 'next/navigation';
import { cache } from 'react';

// Una sola lectura para la pagina y el titulo.
const getQuote = cache(getPurchaseQuoteDetail);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const quote = await getQuote((await params).id);
  return { title: quote ? `${quote.number} | Compras` : 'Pedido de cotización | Compras' };
}

export default async function PurchaseQuoteRoute({ params }: { params: Promise<{ id: string }> }) {
  const quote = await getQuote((await params).id);
  if (!quote) notFound();
  return <PurchaseQuotePage quote={quote} />;
}
