import { isVatRateId } from '@/shared/lib/arca/catalogs';
import { z } from 'zod';

/**
 * Item de contrato (`service_items`). `item_measure_units` y `vat_rate_id` viajan como string
 * (id del select). El precio es NETO: el IVA lo agrega la factura con `vat_rate_id`.
 */
export const serviceItemFormSchema = z.object({
  vat_rate_id: z
    .string()
    .default('5')
    .refine((v) => isVatRateId(Number(v)), 'Elegí la alícuota de IVA'),
  item_name: z.string().trim().min(1, { message: 'Debe ingresar el nombre del item' }),
  item_description: z.string().nullable().optional(),
  code_item: z.string().nullable().optional(),
  item_number: z.string().nullable().optional(),
  // Texto en todo el camino (`Decimal(15,4)`): pasarlo por `number` le comería decimales. El servidor lo
  // convierte con `new Prisma.Decimal(string)`. Acepta coma o punto y se normaliza a punto.
  item_price: z
    .string()
    .trim()
    .regex(/^\d{1,11}([.,]\d{1,4})?$/, {
      message: 'Ingresá un precio válido (hasta 4 decimales, sin separador de miles)',
    })
    .transform((value) => value.replace(',', '.')),
  item_measure_units: z.string().min(1, { message: 'Debe seleccionar la unidad de medida' }),
  is_active: z.boolean().default(true),
  needs_personnel: z.boolean().default(true),
  needs_equipment: z.boolean().default(true),
});

export type ServiceItemFormValues = z.infer<typeof serviceItemFormSchema>;
