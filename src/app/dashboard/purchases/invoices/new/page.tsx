import { getSupplierInvoiceFormData } from '@/features/Purchases/actions/invoice-queries.server';
import { NewSupplierInvoicePage } from '@/features/Purchases/Invoices/InvoicePages';
import { notFound } from 'next/navigation';

export const metadata = { title: 'Cargar comprobante | Compras' };

export default async function NewSupplierInvoiceRoute() {
  const data = await getSupplierInvoiceFormData();
  if (!data) notFound();
  return <NewSupplierInvoicePage data={data} />;
}
