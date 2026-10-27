import 'server-only';

import { Logger } from '@/lib/logger';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Fotos de empleados para la app móvil.
 *
 * La foto vive en `employees.picture` como data URL (JPEG/PNG/WEBP de hasta ~1 MB, lado máximo 640 px): no está en el
 * storage, así que no hay URL firmada de S3 posible (y `storage.ts` no firma a propósito). La API emite su PROPIA URL
 * prefirmada: HMAC sobre empresa + empleado + variante + vencimiento, con vida corta (`PHOTO_URL_TTL_SECONDS`). La ruta
 * de la foto valida la firma sin token de portador (así la puede pedir el componente de imagen con caché) y solo
 * sirve la foto de ESE empleado de ESA empresa.
 */
const logger = new Logger('features/MobileApi/photo');

export const PHOTO_URL_TTL_SECONDS = 15 * 60;
export const PHOTO_VARIANTS = ['thumb', 'full'] as const;
export type PhotoVariant = (typeof PHOTO_VARIANTS)[number];

/** Lado de la miniatura en píxeles (el avatar del listado es de 44–56 pt; 2x–3x de densidad). */
const THUMB_SIZE = 144;

const DATA_URL = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/;

function signingKey(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET no está definida');
  // Clave derivada: la firma de fotos nunca usa el secreto de sesiones tal cual.
  return createHmac('sha256', secret).update('mobile-employee-photo:v1').digest();
}

function signature(companyId: string, employeeId: string, variant: PhotoVariant, expires: number): string {
  return createHmac('sha256', signingKey())
    .update(`${companyId}.${employeeId}.${variant}.${expires}`)
    .digest('base64url');
}

/** Ruta relativa al servidor (la app la completa con la URL del servidor al que se conectó). */
function photoPath(
  companyId: string,
  employeeId: string,
  variant: PhotoVariant,
  version: string,
  expires: number
): string {
  const params = new URLSearchParams({
    c: companyId,
    variant,
    v: version,
    exp: String(expires),
    sig: signature(companyId, employeeId, variant, expires),
  });
  return `/api/mobile/v1/employees/${employeeId}/photo?${params.toString()}`;
}

/** URLs prefirmadas (miniatura y completa) de la foto, o null si el empleado no tiene foto. */
export function buildPhotoUrls(companyId: string, employeeId: string, version: string | null) {
  if (!version) return null;
  const expires = Math.floor(Date.now() / 1000) + PHOTO_URL_TTL_SECONDS;
  return {
    version,
    thumbUrl: photoPath(companyId, employeeId, 'thumb', version, expires),
    url: photoPath(companyId, employeeId, 'full', version, expires),
    expiresAt: new Date(expires * 1000).toISOString(),
  };
}

/** Valida firma y vencimiento de una URL de foto. */
export function verifyPhotoSignature(input: {
  companyId: string;
  employeeId: string;
  variant: PhotoVariant;
  expires: number;
  sig: string;
}): boolean {
  if (!Number.isFinite(input.expires) || input.expires * 1000 < Date.now()) return false;
  const expected = Buffer.from(signature(input.companyId, input.employeeId, input.variant, input.expires));
  const received = Buffer.from(input.sig);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** Bytes y tipo de una foto guardada como data URL; null si el valor no es una imagen válida. */
export function decodePictureDataUrl(picture: string | null): { bytes: Buffer; contentType: string } | null {
  if (!picture) return null;
  const match = DATA_URL.exec(picture);
  if (!match) return null;
  const contentType = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
  return { bytes: Buffer.from(match[2], 'base64'), contentType };
}

/** ETag fuerte de una variante a partir de la versión (md5 del contenido guardado). */
export function photoEtag(version: string, variant: PhotoVariant): string {
  return `"${version}-${variant}"`;
}

/** Versión de una foto: md5 del data URL (el mismo que calcula `md5(picture)` en SQL para el listado). */
export function pictureVersion(picture: string): string {
  return createHash('md5').update(picture).digest('hex');
}

const importSharp = () => import('sharp').then((mod) => mod.default);
type SharpFn = Awaited<ReturnType<typeof importSharp>>;

let sharpLoader: Promise<SharpFn | null> | null = null;

/**
 * `sharp` llega con Next (lo usa la optimización de imágenes) pero no es dependencia directa: si no está, la miniatura
 * es la foto completa, que igual es chica (≤640 px).
 */
function loadSharp(): Promise<SharpFn | null> {
  sharpLoader ??= importSharp().catch((error: unknown) => {
    logger.warn('sharp no está disponible: las miniaturas se sirven con la foto completa', { data: { error } });
    return null;
  });
  return sharpLoader;
}

/** Variante pedida: la miniatura en WEBP cuadrada; la completa, tal cual se guardó. */
export async function renderPhotoVariant(
  photo: { bytes: Buffer; contentType: string },
  variant: PhotoVariant
): Promise<{ bytes: Buffer; contentType: string }> {
  if (variant === 'full') return photo;
  const sharp = await loadSharp();
  if (!sharp) return photo;
  try {
    const bytes = await sharp(photo.bytes)
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover' })
      .webp({ quality: 72 })
      .toBuffer();
    return { bytes, contentType: 'image/webp' };
  } catch (error) {
    logger.warn('No se pudo generar la miniatura: se sirve la foto completa', { data: { error } });
    return photo;
  }
}
