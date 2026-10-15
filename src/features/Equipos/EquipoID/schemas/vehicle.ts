import { z } from 'zod';

/**
 * Schemas Zod del vehículo, compartidos entre el formulario (cliente) y las server actions.
 * Módulo SIN directiva: si viviera en un archivo `'use client'`, el servidor recibiría una
 * referencia de cliente y `parse` no existiría en runtime.
 */

export const VEHICLE_CONTRACT_TYPES = ['Leasing', 'Alquiler', 'Propio', 'Prendado'] as const;
export const VEHICLE_COST_TYPES = ['Directo', 'Indirecto'] as const;
export const VEHICLE_CURRENCIES = ['USD', 'EUR', 'GBP', 'ARS'] as const;

const DOMAIN_OLD_RE = /^[A-Za-z]{3}[0-9]{3}$/; // AAA000
const DOMAIN_OLD_SHORT_RE = /^[A-Za-z]{3}[0-9]{2}$/; // AAA00
const DOMAIN_NEW_RE = /^[A-Za-z]{2}[0-9]{3}[A-Za-z]{2}$/; // AA000AA

/** Formato de dominio válido según el año del vehículo (regla histórica del formulario). */
export function isValidDomainForYear(domain: string, year: number): boolean {
  const value = domain.toUpperCase();
  if (year <= 2015) return DOMAIN_OLD_RE.test(value) || DOMAIN_OLD_SHORT_RE.test(value);
  if (year >= 2017) return DOMAIN_NEW_RE.test(value) || DOMAIN_OLD_SHORT_RE.test(value);
  // 2016: convivieron los dos formatos
  return DOMAIN_NEW_RE.test(value) || DOMAIN_OLD_RE.test(value) || DOMAIN_OLD_SHORT_RE.test(value);
}

/**
 * Foto del equipo: se guarda como data URL en la columna `picture` (decisión de producto pendiente:
 * migrar a storage). Mientras tanto, tope de tamaño y sólo imágenes.
 */
export const VEHICLE_PICTURE_MAX_BYTES = 1_500_000;
const PICTURE_DATA_URL_RE = /^data:image\/[a-z0-9.+-]+;base64,/i;
const pictureField = z
  .string()
  .max(VEHICLE_PICTURE_MAX_BYTES, 'La foto es demasiado pesada (máximo 1,5 MB). Quitala o subí una más liviana.')
  .regex(PICTURE_DATA_URL_RE, 'La foto debe ser una imagen válida')
  .optional()
  .nullable();

/** Campos del formulario (fechas como `Date`). Base sin refinamientos async. */
export const vehicleFormSchema = z
  .object({
    // Basic Data
    type_of_vehicle: z.string().min(1, 'El tipo de equipo es requerido'),
    brand: z.string().min(1, 'La marca es requerida'),
    model: z.string().min(1, 'El modelo es requerido'),
    owner_id: z.string().optional().nullable(),
    year: z
      .string()
      .min(1, 'El año es requerido')
      .refine(
        (year) => {
          const yearNum = Number(year);
          const currentYear = new Date().getFullYear();
          return yearNum >= 1900 && yearNum <= currentYear;
        },
        { message: 'El año debe ser mayor a 1900 y menor al año actual' }
      ),
    type_of_contract: z.enum(VEHICLE_CONTRACT_TYPES).optional().nullable(),

    // Technical Data
    engine: z.string().optional(),
    type: z.string().optional().nullable(),
    subType: z.string().optional().nullable(),
    chassis: z.string().optional(),
    serie: z.string().optional(),
    domain: z.string().optional().nullable(),
    kilometer: z.string().optional(),
    engine_hours: z.string().optional(),
    intern_number: z.string().optional(),
    picture: pictureField,
    contract_expiration_date: z.date().optional().nullable(),
    contract_start_date: z.date().optional().nullable(),
    contract_number: z.string().optional().nullable(),
    // Certificacion del equipo (ticket 727, idem equipamientos). Los dos datos
    // dependientes son opcionales en la base y se vuelven obligatorios cuando
    // `has_certification` esta en true (ver el superRefine de abajo).
    has_certification: z.boolean().default(false),
    certification_expiration_date: z.date().optional().nullable(),
    certification_number: z.string().optional().nullable(),

    // Assignment Data
    allocated_to: z.array(z.string()).optional(),
    cost_center_id: z.string().optional().nullable(),
    cost_type: z.enum(VEHICLE_COST_TYPES, { required_error: 'El tipo de costo es requerido' }),
    sector: z.string({ required_error: 'El sector es requerido' }),

    // Price Data
    price: z.number().positive('El precio debe ser mayor a 0').optional(),
    currency: z.enum(VEHICLE_CURRENCIES).optional(),
  })
  .superRefine((data, ctx) => {
    // Si el equipo posee certificacion, sus dos datos son obligatorios (idem equipamientos)
    if (!data.has_certification) return;
    if (!data.certification_expiration_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La fecha de vencimiento de la certificación es requerida',
        path: ['certification_expiration_date'],
      });
    }
    if (!data.certification_number?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El número de certificación es requerido',
        path: ['certification_number'],
      });
    }
  })
  .refine((data) => !!data.type, {
    message: 'El tipo es requerido',
    path: ['type'],
  })
  .refine((data) => (data.type_of_vehicle === '2' ? !!data.subType : true), {
    message: 'El subtipo es requerido',
    path: ['subType'],
  })
  .refine(
    (data) =>
      data.type_of_vehicle === '1' ? !!data.chassis && data.chassis.length >= 2 && data.chassis.length <= 30 : true,
    { message: 'El chasis debe tener entre 2 y 30 caracteres', path: ['chassis'] }
  )
  .refine(
    (data) => (data.type_of_vehicle === '2' ? !!data.serie && data.serie.length >= 2 && data.serie.length <= 30 : true),
    { message: 'La serie debe tener entre 2 y 30 caracteres', path: ['serie'] }
  )
  .refine(
    (data) => {
      if (data.type_of_vehicle !== '1') return true;
      if (!data.domain) return false;
      const year = Number(data.year);
      if (year <= 2015) return isValidDomainForYear(data.domain, year);
      return true;
    },
    { message: 'El dominio debe tener el formato AAA000 o AAA00. (verificar año)', path: ['domain'] }
  )
  .refine(
    (data) => {
      if (data.type_of_vehicle !== '1') return true;
      if (!data.domain) return false;
      const year = Number(data.year);
      if (year >= 2017) return isValidDomainForYear(data.domain, year);
      return true;
    },
    { message: 'El dominio debe tener el formato AA000AA o AAA00. (verificar año)', path: ['domain'] }
  )
  .refine(
    (data) => {
      if (data.type_of_vehicle !== '1') return true;
      if (!data.domain) return false;
      const year = Number(data.year);
      if (year === 2016) return isValidDomainForYear(data.domain, year);
      return true;
    },
    {
      message: 'El dominio debe tener uno de los formatos: AA000AA o AAA000 o AAA00. (verificar año)',
      path: ['domain'],
    }
  );

export type VehicleFormValues = z.infer<typeof vehicleFormSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Payload de las server actions (`createVehicle` / `updateVehicle`)
// ────────────────────────────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `''` → `null` para columnas FK/uuid/int opcionales: Postgres rechaza `''` en uuid/integer. */
const emptyToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === '' ? null : value), schema);

/** Día sin hora: `Date` (del calendario) o `'YYYY-MM-DD'` (formateado en el navegador). */
const dateOnly = z
  .union([z.date(), z.string().regex(ISO_DATE_RE, 'Fecha inválida')])
  .nullable()
  .optional();

const uuid = z.string().uuid();

const MAX_ALLOCATION_IDS = 500;

export const allocationChangesSchema = z
  .object({
    add: z.array(uuid).max(MAX_ALLOCATION_IDS).default([]),
    remove: z.array(uuid).max(MAX_ALLOCATION_IDS).default([]),
  })
  .refine((changes) => !changes.add.some((id) => changes.remove.includes(id)), {
    message: 'Un cliente no puede agregarse y quitarse a la vez',
  });
export type AllocationChanges = z.output<typeof allocationChangesSchema>;

export const vehicleInputSchema = z.object({
  type_of_vehicle: z.string().regex(/^\d+$/, 'El tipo de equipo es requerido'),
  brand: z.string().regex(/^\d+$/, 'La marca es requerida'),
  model: emptyToNull(z.string().regex(/^\d+$/).nullable()),
  owner_id: emptyToNull(uuid.nullable().optional()),
  year: z.string().min(1, 'El año es requerido'),
  type_of_contract: emptyToNull(z.enum(VEHICLE_CONTRACT_TYPES).nullable().optional()),
  engine: z.string().optional(),
  // NOT NULL en la base: el form lo deja opcional para vehículos; el servidor lo exige al escribir
  type: emptyToNull(uuid.nullable().optional()),
  subType: emptyToNull(uuid.nullable().optional()),
  chassis: z.string().optional(),
  serie: z.string().optional(),
  domain: z.string().nullable().optional(),
  kilometer: z.string().optional(),
  engine_hours: z.string().optional(),
  intern_number: z.string().optional(),
  picture: pictureField,
  contract_expiration_date: dateOnly,
  contract_start_date: dateOnly,
  contract_number: z.string().nullable().optional(),
  has_certification: z.boolean().default(false),
  certification_expiration_date: dateOnly,
  certification_number: z.string().nullable().optional(),
  /** Sólo para el alta (todo es alta). En la edición el servidor la ignora: usa `allocation_changes`. */
  allocated_to: z.array(uuid).max(MAX_ALLOCATION_IDS).optional(),
  /** Altas y bajas EXPLÍCITAS de afectaciones a clientes; la ausencia de un id nunca implica baja. */
  allocation_changes: allocationChangesSchema.optional(),
  cost_center_id: emptyToNull(uuid.nullable().optional()),
  cost_type: z.enum(VEHICLE_COST_TYPES),
  sector: emptyToNull(uuid.nullable().optional()),
  price: z.number().positive().nullable().optional(),
  currency: z.enum(VEHICLE_CURRENCIES).nullable().optional(),
});

/** Lo que aceptan `createVehicle`/`updateVehicle` (antes un parámetro sin tipar). */
export type VehicleInput = z.input<typeof vehicleInputSchema>;
export type ParsedVehicleInput = z.output<typeof vehicleInputSchema>;
