import { z } from 'zod';
import {
  DECIMAL_RE,
  MATERIAL_TRACKING_TYPES,
  destinationFieldsSchema,
  normalizeDecimal,
  refineDestination,
} from './stock-movement';

/** Schemas de pedidos de materiales. Modulo sin directiva: los usan form y action. */

export const quantityIssue = (raw: string): string | null => {
  if (!raw.trim()) return 'Indicá la cantidad';
  if (!DECIMAL_RE.test(raw.trim())) return 'Número inválido (hasta 4 decimales)';
  if (Number(normalizeDecimal(raw)) <= 0) return 'Tiene que ser mayor a 0';
  return null;
};

export const materialRequestSchema = z
  .object({
    ...destinationFieldsSchema,
    notes: z.string().trim().max(1000, 'Máximo 1000 caracteres'),
    lines: z
      .array(z.object({ materialId: z.string().uuid({ message: 'Elegí un material' }), quantity: z.string() }))
      .min(1, 'Agregá al menos una línea'),
  })
  .superRefine((v, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
    refineDestination(v, issue);
    v.lines.forEach((line, i) => {
      const message = quantityIssue(line.quantity);
      if (message) issue(['lines', i, 'quantity'], message);
    });
  });
export type MaterialRequestFormValues = z.infer<typeof materialRequestSchema>;

/** Rechazo: el motivo es obligatorio. */
export const rejectRequestSchema = z.object({
  requestId: z.string().uuid(),
  notes: z.string().trim().min(1, 'Indicá el motivo del rechazo').max(1000, 'Máximo 1000 caracteres'),
});
export type RejectRequestFormValues = z.infer<typeof rejectRequestSchema>;

/** Cierre de un pedido con entregas pendientes: el motivo es obligatorio. */
export const closeRequestSchema = z.object({
  requestId: z.string().uuid(),
  notes: z.string().trim().min(1, 'Indicá por qué se cierra el pedido').max(1000, 'Máximo 1000 caracteres'),
});
export type CloseRequestFormValues = z.infer<typeof closeRequestSchema>;

/**
 * Entrega. Trae una fila por linea pendiente del pedido; las que quedan en 0 (o vacias, o sin
 * unidades en un serializado) no se entregan esta vez. Al menos una tiene que entregarse.
 */
export const deliverRequestSchema = z
  .object({
    requestId: z.string().uuid(),
    warehouseId: z.string().uuid({ message: 'Elegí un depósito' }),
    occurredOn: z.date({ required_error: 'La fecha es requerida', invalid_type_error: 'Fecha inválida' }),
    notes: z.string().trim().max(1000, 'Máximo 1000 caracteres'),
    lines: z.array(
      z.object({
        requestLineId: z.string().uuid(),
        materialId: z.string().uuid(),
        trackingType: z.enum(MATERIAL_TRACKING_TYPES),
        quantity: z.string(),
        batchId: z.string(),
        unitIds: z.array(z.string().uuid()),
      })
    ),
  })
  .superRefine((v, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
    let delivering = 0;
    v.lines.forEach((line, i) => {
      if (line.trackingType === 'SERIAL') {
        if (line.unitIds.length > 0) delivering++;
        return;
      }
      if (!line.quantity.trim() || Number(normalizeDecimal(line.quantity)) === 0) return;
      const message = quantityIssue(line.quantity);
      if (message) return issue(['lines', i, 'quantity'], message);
      delivering++;
      if (line.trackingType === 'BATCH' && !line.batchId) issue(['lines', i, 'batchId'], 'Elegí el lote');
    });
    if (delivering === 0) issue(['lines'], 'Indicá al menos una cantidad a entregar');
  });
export type DeliverRequestFormValues = z.infer<typeof deliverRequestSchema>;

export interface RequestDeliveryLineInput {
  requestLineId: string;
  quantity: string;
  batchId: string | null;
  unitIds: string[];
}

export interface RequestDeliveryInput {
  requestId: string;
  warehouseId: string;
  occurredOn: Date;
  notes: string | null;
  lines: RequestDeliveryLineInput[];
}

/** Traduce el form de entrega a la entrada del motor, sin las lineas que no se entregan. */
export function toRequestDeliveryInput(v: DeliverRequestFormValues): RequestDeliveryInput {
  return {
    requestId: v.requestId,
    warehouseId: v.warehouseId,
    occurredOn: v.occurredOn,
    notes: v.notes.trim() || null,
    lines: v.lines
      .filter((l) => (l.trackingType === 'SERIAL' ? l.unitIds.length > 0 : Number(normalizeDecimal(l.quantity || '0')) > 0))
      .map((l) => ({
        requestLineId: l.requestLineId,
        quantity: l.trackingType === 'SERIAL' ? String(l.unitIds.length) : normalizeDecimal(l.quantity),
        batchId: l.trackingType === 'BATCH' ? l.batchId || null : null,
        unitIds: l.trackingType === 'SERIAL' ? l.unitIds : [],
      })),
  };
}

/** Monto maximo de salida directa: vacio = sin limite. */
export const directExitLimitSchema = z.object({
  amount: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{1,13}([.,]\d{1,2})?$/.test(v), 'Monto inválido (hasta 2 decimales)'),
});
export type DirectExitLimitFormValues = z.infer<typeof directExitLimitSchema>;

/**
 * Pedido de materiales desde Mantenimiento (etapa 4): el operario desde su OT o el detalle de la
 * orden. Solo materiales y cantidades; el destino lo fija el servidor. `workOrderId` vacio =
 * pedido a nivel orden (solo desde el detalle).
 */
export const maintenanceMaterialRequestSchema = z
  .object({
    workOrderId: z.string().uuid({ message: 'Orden de trabajo inválida' }).or(z.literal('')),
    notes: z.string().trim().max(1000, 'Máximo 1000 caracteres'),
    lines: z
      .array(z.object({ materialId: z.string().uuid({ message: 'Elegí un material' }), quantity: z.string() }))
      .min(1, 'Agregá al menos una línea'),
  })
  .superRefine((v, ctx) => {
    v.lines.forEach((line, i) => {
      const message = quantityIssue(line.quantity);
      if (message) ctx.addIssue({ code: 'custom', path: ['lines', i, 'quantity'], message });
    });
  });
export type MaintenanceMaterialRequestFormValues = z.infer<typeof maintenanceMaterialRequestSchema>;
