import { CBTE_TYPES, VAT_RATE_LABELS, isCbteTypeId, type VoucherLetter } from '@/shared/lib/arca/catalogs';
import moment from 'moment';
import { z } from 'zod';
import type { SupplierInvoiceFormData } from '../../lib/invoice-query-types';
import {
  INVOICE_ATTACHMENT_MAX_BYTES,
  INVOICE_ATTACHMENT_TYPES,
  supplierInvoiceFormSchema,
} from '../../schemas/invoices';

/** El comprobante + el PDF (opcional; se sube despues de guardar). */
export const formSchema = supplierInvoiceFormSchema.and(
  z.object({
    attachment: z
      .custom<File | null>((value) => value === null || value instanceof File)
      .refine((file) => !file || file.size <= INVOICE_ATTACHMENT_MAX_BYTES, 'El archivo supera los 10 MB')
      .refine((file) => !file || (INVOICE_ATTACHMENT_TYPES as readonly string[]).includes(file.type), 'Tiene que ser PDF o imagen'),
  })
);

export type FormValues = z.infer<typeof formSchema>;
export type OrderLineOption = SupplierInvoiceFormData['orders'][number]['lines'][number] & { orderId: string; orderNumber: string };
export const RATE_OPTIONS = Object.entries(VAT_RATE_LABELS).map(([id, label]) => ({ id, label }));

export const letterOf = (cbteType: number): VoucherLetter | null => (isCbteTypeId(cbteType) ? CBTE_TYPES[cbteType].letter : null);
export const kindOf = (cbteType: number) => (isCbteTypeId(cbteType) ? CBTE_TYPES[cbteType].kind : 'invoice');

export const emptyValues = (): FormValues => ({
  supplierId: '',
  cbteType: 1,
  salesPoint: '',
  number: '',
  issueDate: moment().format('YYYY-MM-DD'),
  dueDate: '',
  vatPeriod: moment().format('YYYY-MM'),
  cae: '',
  caeDueDate: '',
  relatedInvoiceId: '',
  notes: '',
  lines: [],
  vat: [],
  untaxed: '',
  exempt: '',
  taxes: [],
  attachment: null,
});
