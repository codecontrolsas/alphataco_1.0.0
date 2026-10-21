import { z } from 'zod';

/**
 * Configuración de una regla de actualización de precios.
 *
 * Va en `price_update_rules.config` (jsonb) y no en columnas fijas porque las tres formas no se
 * parecen: un índice necesita un nombre, una polinómica necesita una lista de componentes con
 * sus pesos, y la manual no necesita nada.
 *
 * Lo que la regla guarda es la ESTRUCTURA (qué componentes, con qué peso). Los coeficientes de
 * cada período se entregan al ejecutarla: son del momento, no de la regla.
 */

/** Sin parámetros: los precios se escriben a mano, ítem por ítem. */
export const manualConfigSchema = z.object({});

export const indexConfigSchema = z.object({
  /** Nombre del índice de referencia (INDEC, CAC...). Documental: el coeficiente va al ejecutar. */
  indexName: z.string().trim().min(1, { message: 'El nombre del índice es requerido' }),
});

export const polynomialConfigSchema = z.object({
  components: z
    .array(
      z.object({
        name: z.string().trim().min(1, { message: 'El componente necesita un nombre' }),
        /** Peso dentro del precio. Texto para no perder decimales antes de llegar a Decimal. */
        weight: z.string().trim().min(1, { message: 'El peso es requerido' }),
      })
    )
    .min(1, { message: 'La fórmula necesita al menos un componente' }),
});

export const priceRuleFormSchema = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('manual'),
    name: z.string().trim().min(1, { message: 'El nombre es requerido' }),
    customerServiceId: z.string().uuid().nullable(),
    config: manualConfigSchema,
  }),
  z.object({
    method: z.literal('index'),
    name: z.string().trim().min(1, { message: 'El nombre es requerido' }),
    customerServiceId: z.string().uuid().nullable(),
    config: indexConfigSchema,
  }),
  z.object({
    method: z.literal('polynomial'),
    name: z.string().trim().min(1, { message: 'El nombre es requerido' }),
    customerServiceId: z.string().uuid().nullable(),
    config: polynomialConfigSchema,
  }),
]);

export type PriceRuleFormValues = z.infer<typeof priceRuleFormSchema>;
