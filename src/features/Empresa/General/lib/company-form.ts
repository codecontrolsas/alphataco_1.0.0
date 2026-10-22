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
    .max(30, 'La compañia debe tener menos de 30 caracteres.'),
  company_cuit: z
    .string({ required_error: 'El CUIT es requerido' })
    .transform(normalizeCuit)
    .refine((value) => /^\d{11}$/.test(value), 'El CUIT debe contener 11 números.')
    .refine((value) => isValidCuit(value), 'El CUIT es inválido'),
  description: z
    .string({ required_error: 'La descripción es requerida' })
    .trim()
    .min(3, 'La descripción debe tener al menos 3 caracteres.')
    .max(200, 'La descripción debe tener menos de 200 caracteres.'),
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
    .refine((value) => value.length <= 25, 'El número de teléfono debe tener menos de 25 caracteres.')
    .refine((value) => /^\+?[0-9]{1,25}$/.test(value), 'El número de teléfono debe contener solo números'),
  address: z
    .string({ required_error: 'La dirección es requerida' })
    .trim()
    .min(4, 'La dirección debe tener al menos 4 caracteres.')
    .max(50, 'La dirección debe tener menos de 50 caracteres.'),
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

const LOGO_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tif', 'tiff', 'webp', 'svg']);

/** Extensión (minúsculas) de un archivo de logo permitido, o null. */
export function logoExtension(fileName: string): string | null {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) return null;
  const ext = fileName.slice(dot + 1).toLowerCase();
  return LOGO_EXTENSIONS.has(ext) ? ext : null;
}

/** Path del logo dentro del bucket `logo`: `<companyId>/logo/logo.<ext>`. */
export function buildLogoPath(companyId: string, fileName: string): string {
  const ext = logoExtension(fileName);
  if (!ext) throw new Error('El logo debe ser una imagen (jpg, png, gif, bmp, tif, webp o svg)');
  return `${companyId}/logo/logo.${ext}`;
}
