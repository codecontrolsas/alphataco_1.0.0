import { isValidCuit, normalizeCuit } from '@/shared/utils/cuit-text';
import { z } from 'zod';

/**
 * Schema compartido server/client del formulario de cliente (sin directiva: lo importan la
 * server action y el componente). Los numéricos viajan como string (CUIT/teléfono) y la
 * action los convierte a `bigint` al persistir.
 *
 * El CUIT se valida con dígito verificador y se acepta con guiones ("30-71234567-8"): se
 * guarda sin ellos. Los datos fiscales son opcionales acá; se exigen recién al facturar.
 */
const optionalText = (max: number) =>
  z.string().trim().max(max, `Máximo ${max} caracteres`).optional().or(z.literal(''));

export const customerFormSchema = z.object({
  name: z.string().trim().min(2, { message: 'El nombre debe tener al menos 2 caracteres.' }),
  cuit: z
    .string()
    .trim()
    .transform(normalizeCuit)
    .refine(isValidCuit, 'El CUIT no es válido: revisá el dígito verificador.'),
  /** Id de ARCA de la condición frente al IVA, como string (valor del select). */
  vat_condition_id: z.string().optional().or(z.literal('')),
  fiscal_street: optionalText(255),
  fiscal_city: optionalText(120),
  fiscal_province_id: z.string().optional().or(z.literal('')),
  fiscal_postal_code: optionalText(10),
  client_email: z.string().trim().email('Por favor ingresa un email válido.').optional().or(z.literal('')),
  client_phone: z
    .string()
    .trim()
    .min(8, 'El teléfono debe tener al menos 8 caracteres.')
    .regex(/^\d+$/, 'El teléfono solo puede contener dígitos')
    .optional()
    .or(z.literal('')),
  address: z.string().trim().optional().or(z.literal('')),
  is_active: z.boolean().default(true),
  reason_for_termination: z.string().trim().optional().or(z.literal('')),
  termination_date: z.date().optional().nullable(),
});

export type CustomerFormValues = z.infer<typeof customerFormSchema>;
