import { z } from 'zod';
import { isSupportedCurrency } from '@/shared/lib/arca/catalogs';

/**
 * Schemas de Facturación. Módulo sin directiva: lo importan el editor (cliente) y las server
 * actions (servidor). Cantidades e importes viajan como TEXTO (los convierte `invoice-math`).
 */

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');

export const invoiceLineInputSchema = z.object({
  /** Id de una línea existente. Las que vienen de certificaciones se identifican así. */
  id: z.string().uuid().optional(),
  description: z.string().trim().min(1, 'Escribí la descripción').max(500, 'Máximo 500 caracteres'),
  quantity: z.string().trim(),
  unitPrice: z.string().trim(),
  vatRateId: z.number().int().nullable(),
  serviceItemId: z.string().uuid().nullable().optional(),
});

/**
 * Guardado del borrador: valida FORMATO, no completitud (se puede guardar a medias). La
 * completitud la revisa `validateInvoiceForIssue` antes de emitir.
 */
export const invoiceDraftSchema = z.object({
  salesPointId: z.string().uuid('Elegí un punto de venta'),
  issueDate: dateOnly,
  concept: z.number().int().min(1).max(3),
  serviceFrom: dateOnly.nullable(),
  serviceTo: dateOnly.nullable(),
  paymentDueDate: dateOnly.nullable(),
  notes: z.string().trim().max(1000, 'Máximo 1000 caracteres').nullable(),
  lines: z.array(invoiceLineInputSchema).max(300, 'Máximo 300 líneas'),
});

export type InvoiceDraftInput = z.infer<typeof invoiceDraftSchema>;

export const manualInvoiceSchema = z.object({
  customerId: z.string().uuid('Elegí un cliente'),
  currency: z.string().refine(isSupportedCurrency, 'Moneda no soportada'),
});

export type ManualInvoiceInput = z.infer<typeof manualInvoiceSchema>;

export const adjustmentSchema = z.object({
  originalInvoiceId: z.string().uuid(),
  kind: z.enum(['credit_note', 'debit_note']),
  /** Total: copia todas las líneas del comprobante original (solo NC). Parcial: líneas libres. */
  mode: z.enum(['total', 'partial']),
});

export type AdjustmentInput = z.infer<typeof adjustmentSchema>;
