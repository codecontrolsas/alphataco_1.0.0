import { z } from 'zod';
import { DECIMAL_RE } from './stock-movement';

/**
 * Inventario inicial de cubiertas (Almacenes etapa 6): deposito y costo unitario por tipo + marca.
 * Modulo sin directiva: lo usan el formulario y la server action.
 */
export const tireInventorySchema = z.object({
  warehouseId: z.string().uuid({ message: 'Elegí un depósito' }),
  costs: z
    .array(
      z.object({
        tireTypeId: z.string().uuid(),
        brandId: z.string().uuid(),
        unitCost: z.string().trim().regex(DECIMAL_RE, 'Costo inválido (hasta 4 decimales)'),
      })
    )
    .min(1, 'No hay cubiertas sin stock'),
});

export type TireInventoryFormValues = z.infer<typeof tireInventorySchema>;
