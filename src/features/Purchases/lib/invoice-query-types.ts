import type { getSupplierInvoiceDetail } from '../actions/invoice-detail.server';
import type { getSupplierInvoiceFormData } from '../actions/invoice-queries.server';

export type SupplierInvoiceFormData = NonNullable<Awaited<ReturnType<typeof getSupplierInvoiceFormData>>>;
export type SupplierInvoiceDetail = NonNullable<Awaited<ReturnType<typeof getSupplierInvoiceDetail>>>;
