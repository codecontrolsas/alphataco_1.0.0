import { z } from 'zod';

/** Schemas de prestamos (devolucion y baja). Modulo sin directiva: los usan form y action. */

export const returnLoanSchema = z.object({
  exitMovementId: z.string().uuid(),
  unitIds: z.array(z.string().uuid()).min(1, 'Elegí al menos una unidad'),
  warehouseId: z.string().uuid({ message: 'Elegí el depósito al que vuelve' }),
  occurredOn: z.date({ required_error: 'La fecha es requerida', invalid_type_error: 'Fecha inválida' }),
  notes: z.string().trim().max(1000, 'Máximo 1000 caracteres'),
});
export type ReturnLoanFormValues = z.infer<typeof returnLoanSchema>;

export const writeOffLoanSchema = z.object({
  unitId: z.string().uuid(),
  reason: z.enum(['LOST', 'BROKEN']),
  notes: z.string().trim().min(1, 'Contá qué pasó con la herramienta').max(1000, 'Máximo 1000 caracteres'),
});
export type WriteOffLoanFormValues = z.infer<typeof writeOffLoanSchema>;
