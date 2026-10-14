import { z } from 'zod';

/**
 * Schemas Zod de los ejes y las medidas de cubierta del equipo, compartidos entre el cliente y las
 * server actions. Módulo SIN directiva: si viviera en un archivo `'use client'`, el servidor recibiría
 * una referencia de cliente y `parse` no existiría en runtime.
 *
 * Sin estos límites un `tires_per_side` o un `axle_number` enorme generaba posiciones arbitrarias.
 */

export const MAX_AXLES = 10;
export const MAX_TIRES_PER_SIDE = 8;
const MAX_AXLE_NUMBER = 99;
const MAX_TIRE_SIZE_LENGTH = 40;

export const axleInputSchema = z.object({
  axle_number: z
    .number({ invalid_type_error: 'El número de eje es inválido' })
    .int('El número de eje debe ser entero')
    .min(1, 'El número de eje debe ser al menos 1')
    .max(MAX_AXLE_NUMBER, `El número de eje no puede superar ${MAX_AXLE_NUMBER}`),
  tires_per_side: z
    .number({ invalid_type_error: 'La cantidad de cubiertas por lado es inválida' })
    .int('La cantidad de cubiertas por lado debe ser entera')
    .min(1, 'Cada eje debe tener al menos 1 cubierta por lado')
    .max(MAX_TIRES_PER_SIDE, `Un eje admite hasta ${MAX_TIRES_PER_SIDE} cubiertas por lado`),
  tire_size: z
    .string()
    .trim()
    .max(MAX_TIRE_SIZE_LENGTH, `La medida no puede superar ${MAX_TIRE_SIZE_LENGTH} caracteres`)
    .nullable()
    .transform((value) => (value ? value : null)),
  is_drive_axle: z.boolean(),
  is_spare: z.boolean(),
});

export const axlesSchema = z
  .array(axleInputSchema)
  .min(1, 'Debe configurar al menos un eje')
  .max(MAX_AXLES, `Un equipo admite hasta ${MAX_AXLES} ejes`)
  .superRefine((axles, ctx) => {
    const seen = new Set<number>();
    for (const [index, axle] of axles.entries()) {
      if (seen.has(axle.axle_number)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'axle_number'],
          message: `El eje ${axle.axle_number} está repetido`,
        });
      }
      seen.add(axle.axle_number);
    }
  });

/** Lo que manda el cliente (antes de normalizar la medida). */
export type AxleInput = z.input<typeof axleInputSchema>;

/** Una medida por eje: vacía o `null` borra el override. */
export const axleSizeUpdatesSchema = z
  .array(
    z.object({
      axle_number: z.number().int().min(1).max(MAX_AXLE_NUMBER),
      tire_size: z.string().trim().max(MAX_TIRE_SIZE_LENGTH).nullable(),
    })
  )
  .max(MAX_AXLES, `Un equipo admite hasta ${MAX_AXLES} ejes`)
  .superRefine((updates, ctx) => {
    const seen = new Set<number>();
    for (const [index, update] of updates.entries()) {
      if (seen.has(update.axle_number)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'axle_number'],
          message: `El eje ${update.axle_number} está repetido`,
        });
      }
      seen.add(update.axle_number);
    }
  });

export type AxleSizeUpdates = z.input<typeof axleSizeUpdatesSchema>;

/** Qué hacer con una cubierta que sale del diagrama. */
export const displacedTireActionSchema = z.object({
  tireId: z.string().uuid(),
  destination: z.enum(['AVAILABLE', 'REPAIR', 'DISCARD']),
  /** Depósito al que vuelve si pasa a disponible y tiene stock (Almacenes etapa 6). */
  warehouseId: z.string().uuid().nullish(),
});

export const displacedTireActionsSchema = z.array(displacedTireActionSchema).max(MAX_AXLES * MAX_TIRES_PER_SIDE * 4);

export type DisplacedTireAction = z.input<typeof displacedTireActionSchema>;
