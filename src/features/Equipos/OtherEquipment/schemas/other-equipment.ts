import { z } from 'zod';

/**
 * Payload de `createOtherEquipment` / `updateOtherEquipment` (antes tipado con
 * `Database['public']['Tables']['other_equipment']['Insert']`). Módulo sin directiva:
 * lo importa la server action. Es la forma que arma el submit de `OtherEquipmentForm`
 * (ids numéricos ya parseados, fechas como `YYYY-MM-DD`).
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateOnly = z.string().regex(ISO_DATE_RE, 'Fecha inválida').nullable().optional();
const uuid = z.string().uuid();
/** `''` → `null` en FK opcionales (Postgres rechaza `''` en uuid/integer). */
const emptyToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === '' ? null : value), schema);

export const OTHER_EQUIPMENT_CURRENCIES = ['USD', 'ARS'] as const;
export const OTHER_EQUIPMENT_CONTRACT_TYPES = ['Leasing', 'Alquiler', 'Propio', 'Prendado'] as const;
export const OTHER_EQUIPMENT_COST_TYPES = ['Directo', 'Indirecto'] as const;

export const otherEquipmentInputSchema = z.object({
  type_id: uuid,
  sub_type_id: emptyToNull(uuid.nullable().optional()),
  brand_id: z.number().int().nullable().optional(),
  model_id: z.number().int().nullable().optional(),
  serial_number: z.string().nullable().optional(),
  intern_number: z.string().nullable().optional(),
  year: z.string().nullable().optional(),
  horometer: z.number().nullable().optional(),
  manufacturer_plate: z.string().nullable().optional(),
  composition: z.string().nullable().optional(),
  invoice_number: z.string().nullable().optional(),
  initial_value: z.number().nullable().optional(),
  currency: z.enum(OTHER_EQUIPMENT_CURRENCIES).nullable().optional(),
  purchase_date: dateOnly,
  owner_id: emptyToNull(uuid.nullable().optional()),
  type_of_contract: z.enum(OTHER_EQUIPMENT_CONTRACT_TYPES).nullable().optional(),
  contract_start_date: dateOnly,
  contract_expiration_date: dateOnly,
  contract_number: z.string().nullable().optional(),
  has_certification: z.boolean().default(false),
  certification_expiration_date: dateOnly,
  certification_number: z.string().nullable().optional(),
  linked_vehicle_id: emptyToNull(uuid.nullable().optional()),
  cost_center_id: emptyToNull(uuid.nullable().optional()),
  cost_type: z.enum(OTHER_EQUIPMENT_COST_TYPES).nullable().optional(),
  sector: emptyToNull(uuid.nullable().optional()),
  /**
   * Afectaciones a clientes como altas y bajas EXPLÍCITAS: la ausencia de un id nunca implica
   * borrado. El formulario calcula el delta contra el baseline que leyó del servidor.
   */
  contractors: z.object({ add: z.array(uuid).default([]), remove: z.array(uuid).default([]) }).optional(),
});

export type OtherEquipmentInput = z.input<typeof otherEquipmentInputSchema>;
export type ParsedOtherEquipmentInput = z.output<typeof otherEquipmentInputSchema>;

/** Certificación (documento) de un equipamiento: campos del `FormData` de `createOtherEquipmentCertification`. */
export const otherEquipmentCertificationSchema = z.object({
  equipmentId: uuid,
  name: z.string().trim().min(1, 'El nombre es requerido'),
  expiration_date: z
    .union([z.literal(''), z.string().regex(ISO_DATE_RE, 'Fecha inválida')])
    .transform((v) => v || null),
});
