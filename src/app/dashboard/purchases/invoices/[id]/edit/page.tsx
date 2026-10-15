import {
  getSupplierInvoiceDetail,
  getSupplierInvoiceEditValues,
  getSupplierInvoiceFormData,
} from '@/features/Purchases/actions/invoice-queries.server';
import { EditSupplierInvoicePage } from '@/features/Purchases/Invoices/InvoicePages';
import { notFound } from 'next/navigation';

export const metadata = { title: 'Editar comprobante | Compras' };

export default async function EditSupplierInvoiceRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [values, detail] = await Promise.all([getSupplierInvoiceEditValues(id), getSupplierInvoiceDetail(id)]);
  if (!values || !detail || !detail.can.edit) notFound();
  const data = await getSupplierInvoiceFormData(values.supplierId, { excludeInvoiceId: id });
  if (!data) notFound();
  return <EditSupplierInvoicePage invoiceId={id} label={detail.label} values={values} data={data} />;
}
