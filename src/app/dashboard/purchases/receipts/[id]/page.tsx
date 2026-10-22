import { getPurchaseReceiptDetail } from '@/features/Purchases/actions/receipt-queries.server';
import { PurchaseReceiptPage } from '@/features/Purchases/Receipts/ReceiptPages';
import { notFound } from 'next/navigation';
import { cache } from 'react';

// Una sola lectura para la pagina y el titulo.
const getReceipt = cache(getPurchaseReceiptDetail);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const receipt = await getReceipt((await params).id);
  return { title: receipt ? `${receipt.number} | Compras` : 'Recepción | Compras' };
}

export default async function PurchaseReceiptRoute({ params }: { params: Promise<{ id: string }> }) {
  const receipt = await getReceipt((await params).id);
  if (!receipt) notFound();
  return <PurchaseReceiptPage receipt={receipt} />;
}
