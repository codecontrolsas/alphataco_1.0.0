import type { arca_check_result, supplier_invoice_status } from '@/generated/prisma/enums';

/** Estados de un comprobante de proveedor (spec Compras etapa 4 §2.2). */
export type SupplierInvoiceStatus = supplier_invoice_status;

export const SUPPLIER_INVOICE_STATUS_LABELS: Record<SupplierInvoiceStatus, string> = {
  CONFORMING: 'Conforme',
  OBSERVED: 'Observada',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  CANCELLED: 'Anulada',
};

export const ARCA_CHECK_LABELS: Record<arca_check_result, string> = {
  APPROVED: 'Constatada',
  REJECTED: 'Rechazada por ARCA',
  UNAVAILABLE: 'ARCA no respondió',
};

/** Cuenta como facturado contra la OC: vigente y no rechazado. */
export const INVOICED_STATUSES: SupplierInvoiceStatus[] = ['CONFORMING', 'OBSERVED', 'APPROVED'];

export const SUPPLIER_INVOICE_OBSERVATION_LABELS = {
  LETTER: 'letra',
  VAT: 'IVA',
  PRICE: 'precio',
  VAT_RATE: 'alícuota',
  QUANTITY: 'cantidad',
  ARCA: 'ARCA',
} as const;
