import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { DocumentResource } from '../contracts/documents';

/**
 * Enlaces firmados a los ARCHIVOS de documentos para la app móvil. Mismo patrón que las fotos de empleados
 * (`employees/photo.ts`): el storage es privado y `/api/files` lee la sesión por cookie y no mira `view_private`, así que
 * la API emite su PROPIA URL prefirmada.
 *
 * - Se emite solo después de verificar, con el token del usuario, que puede ver ESE documento (ficha, lista del recurso
 *   y período, privados con `view_private`, módulos encendidos).
 * - La firma ata empresa + clase de recurso + documento + vencimiento, con una clave derivada propia.
 * - La ruta que sirve el archivo no recibe ningún path: lo resuelve en la base por el id, dentro de la empresa de la
 *   firma, y vuelve a exigir que no esté archivado, que tenga archivo y que los módulos sigan encendidos.
 * - Vida corta (`FILE_URL_TTL_SECONDS`): un enlace filtrado deja de servir en minutos.
 */
export const FILE_URL_TTL_SECONDS = 5 * 60;

function signingKey(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET no está definida');
  return createHmac('sha256', secret).update('mobile-document-file:v1').digest();
}

function signature(companyId: string, resource: DocumentResource, documentId: string, expires: number): string {
  return createHmac('sha256', signingKey())
    .update(`${companyId}.${resource}.${documentId}.${expires}`)
    .digest('base64url');
}

/** URL relativa al servidor (la app la completa con la URL del servidor al que se conectó). */
export function buildDocumentFileUrl(
  companyId: string,
  resource: DocumentResource,
  documentId: string,
  now: number = Date.now()
) {
  const expires = Math.floor(now / 1000) + FILE_URL_TTL_SECONDS;
  const params = new URLSearchParams({
    c: companyId,
    exp: String(expires),
    sig: signature(companyId, resource, documentId, expires),
  });
  return {
    url: `/api/mobile/v1/documents/${resource}/${documentId}/file/content?${params.toString()}`,
    expiresAt: new Date(expires * 1000).toISOString(),
  };
}

/** Valida firma y vencimiento. */
export function verifyDocumentFileSignature(input: {
  companyId: string;
  resource: DocumentResource;
  documentId: string;
  expires: number;
  sig: string;
}): boolean {
  if (!Number.isFinite(input.expires) || input.expires * 1000 < Date.now()) return false;
  const expected = Buffer.from(signature(input.companyId, input.resource, input.documentId, input.expires));
  const received = Buffer.from(input.sig);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** Nombre de archivo para la descarga: el tipo de documento y la extensión del archivo guardado. */
export function documentFileName(typeName: string, path: string): string {
  const ext = /\.([A-Za-z0-9]{1,8})$/.exec(path)?.[1]?.toLowerCase();
  const base =
    typeName
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'documento';
  return ext ? `${base}.${ext}` : base;
}
