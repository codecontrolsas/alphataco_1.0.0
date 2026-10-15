import { getSupplierInvoiceDetail } from '@/features/Purchases/actions/invoice-queries.server';
import { SupplierInvoicePage } from '@/features/Purchases/Invoices/InvoicePages';
import { notFound } from 'next/navigation';
import { cache } from 'react';

// Una sola lectura para la pagina y el titulo.
const getInvoice = cache(getSupplierInvoiceDetail);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const invoice = await getInvoice((await params).id);
  return { title: invoice ? `${invoice.label} | Compras` : 'Comprobante | Compras' };
}

export default async function SupplierInvoiceRoute({ params }: { params: Promise<{ id: string }> }) {
  const invoice = await getInvoice((await params).id);
  if (!invoice) notFound();
  return <SupplierInvoicePage invoice={invoice} />;
}
