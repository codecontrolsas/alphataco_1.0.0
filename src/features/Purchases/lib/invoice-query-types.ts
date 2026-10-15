import type { getSupplierInvoiceDetail, getSupplierInvoiceFormData } from '../actions/invoice-queries.server';

export type SupplierInvoiceFormData = NonNullable<Awaited<ReturnType<typeof getSupplierInvoiceFormData>>>;
export type SupplierInvoiceDetail = NonNullable<Awaited<ReturnType<typeof getSupplierInvoiceDetail>>>;
