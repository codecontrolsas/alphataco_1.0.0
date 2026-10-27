import { isValidCuit, normalizeCuit } from '@/shared/utils/cuit-text';
import { z } from 'zod';

/**
 * Lógica pura del formulario de empresa (alta y edición): normalización y validación del
 * `FormData` que mandan `CreateCompanyButton`/`EditCompanyButton`, y el path del logo en storage.
 * Sin acceso a la base: la unicidad del CUIT la verifica la server action con Prisma.
 */

/** Conserva un `+` inicial y elimina espacios, guiones y paréntesis. */
export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  const plus = trimmed.startsWith('+') ? '+' : '';
  return plus + trimmed.replace(/[^0-9]/g, '');
}

const WEBSITE_RE = /^(?:(?:https?|ftp):\/\/)?(?:www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+([/?].*)?$/i;

export const companyFormSchema = z.object({
  company_name: z
    .string({ required_error: 'El nombre de la compañía es requerido' })
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres.')
    // La columna admite 255; el tope anterior (30) dejaba sin poder guardar razones sociales reales
    // ("Transportes Patagonia DEMO S.A." tiene 31) y el error quedaba fuera de la vista (ticket 806).
    .max(100, 'El nombre debe tener como máximo 100 caracteres.'),
  company_cuit: z
    .string({ required_error: 'El CUIT es requerido' })
    .transform(normalizeCuit)
    .refine((value) => /^\d{11}$/.test(value), 'El CUIT debe contener 11 números.')
    .refine((value) => isValidCuit(value), 'El CUIT es inválido'),
  description: z
    .string({ required_error: 'La descripción es requerida' })
    .trim()
    .min(3, 'La descripción debe tener al menos 3 caracteres.')
    .max(500, 'La descripción debe tener como máximo 500 caracteres.'),
  website: z
    .string()
    .trim()
    .refine((value) => value === '' || WEBSITE_RE.test(value), 'La URL proporcionada no es válida.')
    .default(''),
  contact_email: z.string({ required_error: 'El email es requerido' }).trim().toLowerCase().email('Email inválido'),
  contact_phone: z
    .string({ required_error: 'El teléfono es requerido' })
    .transform(normalizePhone)
    .refine((value) => value.length >= 5, 'El número de teléfono debe tener al menos 5 caracteres.')
    .refine((value) => value.length <= 20, 'El número de teléfono debe tener como máximo 20 caracteres.')
    .refine((value) => /^\+?[0-9]{1,20}$/.test(value), 'El número de teléfono debe contener solo números'),
  address: z
    .string({ required_error: 'La dirección es requerida' })
    .trim()
    .min(4, 'La dirección debe tener al menos 4 caracteres.')
    .max(255, 'La dirección debe tener como máximo 255 caracteres.'),
  country: z.string({ required_error: 'El país es requerido' }).trim().min(2, 'Seleccioná un país.'),
  province_id: z.coerce
    .number({ invalid_type_error: 'Seleccioná una provincia.' })
    .int()
    .positive('Seleccioná una provincia.'),
  city: z.coerce.number({ invalid_type_error: 'Seleccioná una ciudad.' }).int().positive('Seleccioná una ciudad.'),
  industry: z.string({ required_error: 'La industria es requerida' }).trim().min(2, 'Seleccioná una industria.'),
  by_defect: z.boolean().default(false),
});

export type CompanyFormValues = z.infer<typeof companyFormSchema>;

export type ParseCompanyFormResult =
  | { ok: true; data: CompanyFormValues }
  | { ok: false; errors: Record<string, string> };

function formString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' ? value : undefined;
}

/**
 * Parsea y normaliza el `FormData` del formulario de empresa. Devuelve un error por campo
 * (el primero de cada uno) para que la UI lo muestre debajo del input correspondiente.
 * `province_id`/`city` vacíos se rechazan (coerce de '' daría 0).
 */
export function parseCompanyForm(formData: FormData): ParseCompanyFormResult {
  const byDefect = formData.get('by_defect');
  const raw = {
    company_name: formString(formData, 'company_name'),
    company_cuit: formString(formData, 'company_cuit'),
    description: formString(formData, 'description'),
    website: formString(formData, 'website') ?? '',
    contact_email: formString(formData, 'contact_email'),
    contact_phone: formString(formData, 'contact_phone'),
    address: formString(formData, 'address'),
    country: formString(formData, 'country'),
    province_id: formString(formData, 'province_id') || undefined,
    city: formString(formData, 'city') || undefined,
    industry: formString(formData, 'industry'),
    by_defect: byDefect === 'on' || byDefect === 'true',
  };

  const parsed = companyFormSchema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };

  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? 'form');
    if (!(key in errors)) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

/**
 * Formatos de logo aceptados. Sin SVG: se sirve desde el mismo origen (`/api/files`) y un SVG con
 * script sería un XSS almacenado. Sin BMP/TIFF: los navegadores no los muestran.
 */
const LOGO_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
export const LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
/** `accept` del selector de archivos. */
export const LOGO_ACCEPT = LOGO_MIME_TYPES.join(',');
/** Tope del logo. El body de las server actions admite 10 MB y viaja junto con el resto del formulario. */
export const LOGO_MAX_BYTES = 5 * 1024 * 1024;
export const LOGO_HINT = 'PNG, JPG, WEBP o GIF, hasta 5 MB.';

/** Extensión (minúsculas) de un archivo de logo permitido, o null. */
export function logoExtension(fileName: string): string | null {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) return null;
  const ext = fileName.slice(dot + 1).toLowerCase();
  return LOGO_EXTENSIONS.has(ext) ? ext : null;
}

/**
 * Valida nombre, tipo declarado y tamaño de un logo. Devuelve el mensaje de error o null.
 * La usan el selector (antes de enviar) y el servidor (que además revisa los bytes reales).
 */
export function validateLogoFile(file: { name: string; size: number; type: string }): string | null {
  if (!logoExtension(file.name) || (file.type && !(LOGO_MIME_TYPES as readonly string[]).includes(file.type))) {
    return `El logo tiene que ser una imagen: ${LOGO_HINT}`;
  }
  if (file.size === 0) return 'El archivo del logo está vacío.';
  if (file.size > LOGO_MAX_BYTES) return 'El logo supera los 5 MB. Elegí una imagen más liviana.';
  return null;
}

/** true si los primeros bytes corresponden a PNG, JPEG, GIF o WEBP (no alcanza con la extensión). */
export function isImageSignature(bytes: Uint8Array): boolean {
  const starts = (sig: number[], offset = 0) => sig.every((byte, i) => bytes[offset + i] === byte);
  return (
    starts([0x89, 0x50, 0x4e, 0x47]) ||
    starts([0xff, 0xd8, 0xff]) ||
    starts([0x47, 0x49, 0x46, 0x38]) ||
    (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8))
  );
}

/** Carpeta del logo dentro del bucket `logo`: `<companyId>/logo/`. */
export function logoFolder(companyId: string): string {
  return `${companyId}/logo/`;
}

/** Path del logo dentro del bucket `logo`: `<companyId>/logo/logo.<ext>`. */
export function buildLogoPath(companyId: string, fileName: string): string {
  const ext = logoExtension(fileName);
  if (!ext) throw new Error(`El logo tiene que ser una imagen: ${LOGO_HINT}`);
  return `${logoFolder(companyId)}logo.${ext}`;
}
