import { PurchasesPageShell } from '../components/PurchasesPageShell';
import type { SupplierInvoiceDetail, SupplierInvoiceFormData } from '../lib/invoice-query-types';
import type { SupplierInvoiceFormValues } from '../schemas/invoices';
import { SupplierInvoiceDetailView } from './components/SupplierInvoiceDetailView';
import { SupplierInvoiceForm } from './components/SupplierInvoiceForm';

const LIST = { href: '/dashboard/purchases?tab=facturas', label: 'Facturas' };

export function NewSupplierInvoicePage({ data }: { data: SupplierInvoiceFormData }) {
  return (
    <PurchasesPageShell title="Cargar comprobante" back={LIST}>
      <SupplierInvoiceForm mode={{ kind: 'create' }} initialData={data} />
    </PurchasesPageShell>
  );
}

export function EditSupplierInvoicePage({
  invoiceId,
  label,
  values,
  data,
}: {
  invoiceId: string;
  label: string;
  values: SupplierInvoiceFormValues;
  data: SupplierInvoiceFormData;
}) {
  return (
    <PurchasesPageShell title={`Editar ${label}`} back={{ href: `/dashboard/purchases/invoices/${invoiceId}`, label }}>
      <SupplierInvoiceForm
        mode={{ kind: 'edit', invoiceId, label }}
        initialValues={values}
        initialData={data}
        initialSupplierLabel={data.supplier?.name ?? null}
      />
    </PurchasesPageShell>
  );
}

export function SupplierInvoicePage({ invoice }: { invoice: SupplierInvoiceDetail }) {
  return (
    <PurchasesPageShell back={LIST}>
      <SupplierInvoiceDetailView invoice={invoice} />
    </PurchasesPageShell>
  );
}
