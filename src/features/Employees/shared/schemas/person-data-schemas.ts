import { z } from 'zod';

/**
 * Schemas de los datos de una persona compartidos entre el legajo de empleado
 * y el candidato (ticket 505). Son la unica fuente de verdad de esos campos:
 * si cambia una validacion o un mensaje, cambia para ambos formularios.
 *
 * La obligatoriedad vive aca (capa de aplicacion), no en el DDL: en la base
 * `employees` y `pre_employees` admiten null en varios de estos campos.
 *
 * Los topes de largo (`.max()`) son del lado servidor tambien: el formulario es solo la
 * primera barrera, un cliente manipulado puede mandar cualquier cosa a la server action.
 */

/** Tope de la foto (data URL en base64) que se guarda inline en la fila. */
export const MAX_PICTURE_LENGTH = 1_500_000;

const PICTURE_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/**
 * Id con forma de UUID. Regex laxa a proposito (no valida la version): Postgres acepta
 * cualquier uuid con esta forma y los ids sembrados no siempre son v4.
 */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** FK obligatoria: no vacia y con forma de UUID. */
export const requiredUuid = (requiredMessage: string) =>
  z.string().min(1, requiredMessage).regex(UUID_PATTERN, 'Valor inválido');

/** FK opcional: acepta `undefined` o `''` (el formulario inicia asi los selects sin valor). */
export const optionalUuid = z.string().regex(UUID_PATTERN, 'Valor inválido').optional().or(z.literal(''));

// ─── Datos personales ─────────────────────────────────────────────────────────
export const personalDataSchema = z.object({
  firstname: z.string().trim().min(1, 'Nombre es requerido').max(100, 'Nombre demasiado largo'),
  lastname: z.string().trim().min(1, 'Apellido es requerido').max(100, 'Apellido demasiado largo'),
  nationality: z.string().min(1, 'Nacionalidad es requerida').max(50),
  born_date: z.string().min(1, 'Fecha de nacimiento es requerida').max(32, 'Fecha de nacimiento inválida'),
  cuil: z.string().trim().min(1, 'CUIL es requerido').max(20, 'CUIL demasiado largo'),
  document_type: z.string().min(1, 'Tipo de documento es requerido').max(50),
  document_number: z.string().trim().min(1, 'Número de documento es requerido').max(20, 'Documento demasiado largo'),
  birthplace: requiredUuid('País de nacimiento es requerido'),
  gender: z.string().min(1, 'Sexo es requerido').max(50),
  marital_status: z.string().min(1, 'Estado civil es requerido').max(50),
  level_of_education: z.string().min(1, 'Nivel de instrucción es requerido').max(50),
  // Foto inline: sólo imágenes en data URL y con tope, para no guardar blobs arbitrarios en la fila.
  // `''` es "sin foto" (el botón de quitar la deja así).
  picture: z
    .string()
    .max(MAX_PICTURE_LENGTH, 'La foto es demasiado pesada (máximo aproximado de 1 MB)')
    .refine((value) => value === '' || PICTURE_DATA_URL.test(value), 'La foto debe ser una imagen PNG, JPG o WEBP')
    .optional(),
});

export type PersonalDataValues = z.infer<typeof personalDataSchema>;

// ─── Datos de contacto ────────────────────────────────────────────────────────
export const contactDataSchema = z.object({
  street: z.string().trim().min(1, 'Calle es requerida').max(200, 'Calle demasiado larga'),
  street_number: z.string().trim().min(1, 'Altura es requerida').max(20, 'Altura demasiado larga'),
  province: z.number().int().min(1, 'Provincia es requerida'),
  city: z.number().int().min(1, 'Ciudad es requerida'),
  postal_code: z.string().trim().min(1, 'Código postal es requerido').max(20, 'Código postal demasiado largo'),
  phone: z.string().trim().min(1, 'Teléfono es requerido').max(40, 'Teléfono demasiado largo'),
  email: z.string().trim().email('Email inválido').min(1, 'Email es requerido').max(254, 'Email demasiado largo'),
});

export type ContactDataValues = z.infer<typeof contactDataSchema>;

/** Campos agrupados por seccion — se usan para derivar que tab tiene errores. */
export const PERSONAL_DATA_FIELD_NAMES = Object.keys(personalDataSchema.shape) as (keyof PersonalDataValues)[];
export const CONTACT_DATA_FIELD_NAMES = Object.keys(contactDataSchema.shape) as (keyof ContactDataValues)[];
