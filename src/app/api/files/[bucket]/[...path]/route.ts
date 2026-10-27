import { isHseEnabled } from '@/features/Hse/lib/feature-gate';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { s3Client } from '@/shared/lib/s3';
import { getSessionUserId } from '@/shared/lib/session';
import { isStorageBucket } from '@/shared/lib/storage-buckets';
import { resolveStorageObjectOwner, type StorageObjectOwner } from '@/shared/lib/storage-perimeter';
import { DOWNLOAD_PARAM, isSafeStorageKey } from '@/shared/lib/storage-url';
import { canUseAsActiveCompany, getActiveCompanyId } from '@/shared/lib/tenant';
import { getTenantContextOrNull } from '@/shared/lib/tenant-db';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';

/**
 * Sirve un archivo del storage: `GET /api/files/<bucket>/<key>[?download=1]`.
 *
 * Es el ÚNICO camino de lectura de archivos: los buckets de RustFS son privados y no están
 * publicados en internet. Por eso valida el perímetro en cada request:
 *
 * 1. El bucket tiene que estar en la lista conocida.
 * 2. Tiene que haber sesión (se chequea ANTES de tocar la base: si no, un anónimo dispara
 *    consultas de resolución de dueño en cada request).
 * 3. La key tiene que ser relativa y sin `..` (no se sirve nada fuera del bucket).
 * 4. Se resuelve el DUEÑO del archivo —una empresa, o un perfil en el caso de los
 *    avatares— y se exige que la sesión pueda usarlo. Para las empresas el predicado es
 *    `canUseAsActiveCompany()`, el mismo que `getActiveCompanyId()`, así que también pasan
 *    el operario de indumentaria y el del QR de mantenimiento, que no son miembros del
 *    dashboard.
 *
 * Todo lo que no se puede probar responde 404, nunca 403: un 403 confirmaría que el archivo
 * existe. Y nada responde 500: un id con forma rara es un 404, no un error del servidor.
 *
 * Excepción consciente a "Server Actions, no API Routes": lo que se sirve acá es el destino
 * de un `<img src>` / `<embed>` / `<a href>`, es decir una URL que pide el navegador. Una
 * Server Action no puede responder eso.
 */
const logger = new Logger('app/api/files');

/**
 * Caché del navegador, nunca compartida: la respuesta depende de la sesión.
 *
 * El día de `max-age` es seguro porque la URL cambia cuando cambia el archivo: las keys de
 * fotos y documentos llevan timestamp, y las dos que se pisan en su lugar (logo y avatar)
 * guardan la URL con un `?v=`/`?timestamp=` que se renueva al subir. Con el `ETag`, lo que
 * vence se revalida con un 304 en vez de volver a bajar el archivo. Sin esto, una grilla de
 * 50 fotos son 50 requests con su resolución de perímetro en cada scroll.
 */
const PRIVATE_CACHE = 'private, max-age=86400';

function notFound(): NextResponse {
  return new NextResponse('No encontrado', { status: 404 });
}

/**
 * `Content-Disposition` con el nombre del archivo, tolerando nombres no ASCII (RFC 5987).
 *
 * `preferredName` es el que guardó la base cuando difiere del de la key (los adjuntos de
 * contrato llevan un `<timestamp>_` delante para no pisarse entre sí, y eso no tiene por qué
 * terminar en la carpeta de descargas del usuario).
 */
function contentDisposition(key: string, preferredName?: string): string {
  const name = preferredName?.trim() || key.split('/').pop() || 'archivo';
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ bucket: string; path: string[] }> }
): Promise<NextResponse> {
  const { bucket, path: segments } = await params;

  if (!isStorageBucket(bucket)) return notFound();
  // HSE apagado en la instancia: sus archivos no se sirven.
  if (bucket === 'hse-files' && !isHseEnabled()) return notFound();

  // Next ya decodifica cada segmento del catch-all (`getRouteMatcher` hace
  // `match.split('/').map(decode)`), y `buildStorageFileUrl` codifica segmento a segmento
  // sin tocar las barras: el join es la inversa exacta. Decodificar de nuevo acá rompía
  // todo nombre con `%` —`informe 50%.pdf` tiraba `URIError`, `abc%41.pdf` resolvía a otra
  // key— y dejaba el archivo inalcanzable para siempre.
  const key = segments.join('/');
  if (!isSafeStorageKey(key)) return notFound();

  // Antes de tocar la base: sin sesión no hay nada que resolver.
  if (!(await getSessionUserId())) return notFound();

  // El empleado del portal (legajo sin membresia) no lee archivos de la empresa por path: con la empresa activa del
  // legajo podria pedir el documento de cualquier compañero adivinando la ruta. La única excepción son los documentos HSE
  // (`hse-files`): su dueño se resuelve por la fila de la versión bajo RLS, que al empleado solo le deja ver los
  // publicados que le aplican (ver `resolveStorageObjectOwner`). Los paneles de ropa y taller no sirven archivos acá.
  if (bucket !== 'hse-files' && (await getTenantContextOrNull())?.kind === 'employee') return notFound();

  try {
    const owner = await resolveStorageObjectOwner(bucket, key);
    if (!owner) {
      logger.warn('Archivo sin dueño resoluble: no se sirve', { data: { bucket, key } });
      return notFound();
    }

    if (!(await isOwnerReachable(owner))) {
      logger.warn('Intento de leer un archivo ajeno', { data: { bucket, key, owner } });
      return notFound();
    }

    const object = await s3Client().send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        // Revalidación condicional: si el navegador ya tiene la versión buena, RustFS
        // responde 304 y no se transfiere el cuerpo.
        IfNoneMatch: request.headers.get('if-none-match') ?? undefined,
      })
    );

    const headers = new Headers({
      'Content-Type': object.ContentType ?? 'application/octet-stream',
      'Cache-Control': PRIVATE_CACHE,
      // El archivo lo subió un usuario: que el navegador no lo interprete como HTML/JS.
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    if (object.ETag) headers.set('ETag', object.ETag);
    if (object.ContentLength !== undefined) headers.set('Content-Length', String(object.ContentLength));
    if (new URL(request.url).searchParams.get(DOWNLOAD_PARAM)) {
      headers.set('Content-Disposition', contentDisposition(key, owner.downloadName));
    }

    if (!object.Body) return notFound();
    // Stream, no buffer: `document-files` guarda documentos sin tope de tamaño y el visor
    // embebe el PDF entero por esta ruta. Materializarlo en el heap hacía que N lectores
    // simultáneos de un PDF grande fueran N veces su tamaño en memoria.
    return new NextResponse(object.Body.transformToWebStream(), { headers });
  } catch (error) {
    const name = (error as { name?: string })?.name;
    const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    // 304: el navegador ya tenía la versión buena (no lleva cuerpo ni Content-Length).
    if (status === 304 || name === 'NotModified') {
      return new NextResponse(null, { status: 304, headers: { 'Cache-Control': PRIVATE_CACHE } });
    }
    if (name !== 'NoSuchKey' && name !== 'NotFound' && status !== 404) {
      logger.error('Error al leer el archivo del storage', { data: { bucket, key, error } });
    }
    return notFound();
  }
}

/** Empresa activa del request, o `null` si la sesión no tiene ninguna utilizable. */
async function activeCompanyOrNull(): Promise<string | null> {
  try {
    return await getActiveCompanyId();
  } catch {
    return null;
  }
}

/** ¿La sesión puede leer un archivo de este dueño? */
async function isOwnerReachable(owner: StorageObjectOwner): Promise<boolean> {
  const activeCompanyId = await activeCompanyOrNull();

  if (owner.kind === 'company') {
    // Atajo: la empresa activa ya se validó al resolverse (claim del JWT escrito por el
    // servidor, o cookie revalidada). Si coincide, no hace falta repetir el predicado.
    if (owner.companyId === activeCompanyId) return true;
    return canUseAsActiveCompany(owner.companyId);
  }

  // Avatares. El propio siempre; el de otro, sólo si comparte la empresa activa: es donde
  // la UI los muestra (lista de usuarios, comentarios, historial).
  const credentialId = await getSessionUserId();
  const me = credentialId
    ? await prisma.profile.findUnique({ where: { credential_id: credentialId }, select: { id: true } })
    : null;
  if (me?.id === owner.profileId) return true;
  if (!activeCompanyId) return false;

  // `is_active` se exige igual que en `canAccessCompany()`: un usuario dado de baja deja de
  // ser miembro, y su avatar deja de ser legible para sus excompañeros.
  const [shared, owns] = await Promise.all([
    prisma.share_company_users.count({
      where: { profile_id: owner.profileId, company_id: activeCompanyId, is_active: true },
    }),
    prisma.company.count({ where: { id: activeCompanyId, owner_id: owner.profileId } }),
  ]);
  return shared > 0 || owns > 0;
}
