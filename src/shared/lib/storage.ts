import 'server-only';

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { Logger } from '@/lib/logger';
import { s3Client } from '@/shared/lib/s3';
import { buildStorageDownloadUrl, buildStorageFileUrl } from '@/shared/lib/storage-url';

/**
 * Operaciones de storage (RustFS/S3) desde el servidor. Módulo server-only (NO es 'use server'):
 * ninguna función es un endpoint. Las Server Actions que las usan verifican antes que el
 * archivo pertenezca a la empresa activa.
 *
 * Reemplaza a Supabase Storage conservando las firmas previas, más `storageList` y
 * `storageMove` que antes se hacían con el cliente de Supabase a mano.
 */
const logger = new Logger('shared/lib/storage');

/** Bucket con los archivos de documentos de empleados/equipos/empresa. */
export const DOCUMENT_FILES_BUCKET = 'document-files';
/** Bucket donde se archivan los documentos vencidos al renovarlos. */
export const DOCUMENT_FILES_EXPIRED_BUCKET = 'document-files-expired';

/**
 * `code` identifica los errores de los que depende la lógica del llamador, para que no
 * tenga que reconocerlos por el texto del mensaje.
 */
export type StorageErrorCode = 'already-exists' | 'not-found' | 'failed';

export type StorageResult<T> = { ok: true; data: T } | { ok: false; error: string; code: StorageErrorCode };

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function fail(error: string, code: StorageErrorCode = 'failed'): { ok: false; error: string; code: StorageErrorCode } {
  return { ok: false, error, code };
}

/** El destino ya existe. Mantiene el texto histórico por si algún log lo compara. */
const ALREADY_EXISTS = fail('The resource already exists', 'already-exists');

/** `true` si el objeto existe. Cualquier error que no sea 404 se propaga. */
async function objectExists(bucket: string, path: string): Promise<boolean> {
  try {
    await s3Client().send(new HeadObjectCommand({ Bucket: bucket, Key: path }));
    return true;
  } catch (error) {
    // S3 devuelve `NotFound` (HeadObject no trae cuerpo) o `NoSuchKey`.
    const name = (error as { name?: string })?.name;
    const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (name === 'NotFound' || name === 'NoSuchKey' || status === 404) return false;
    throw error;
  }
}

async function toBytes(file: File | Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/**
 * Sube `file` a `bucket/path`.
 *
 * `upsert: false` (el default) rechaza el archivo si ya existe: S3 pisa siempre, así que la
 * exclusividad se resuelve con un `HeadObject` previo. Conserva el comportamiento y el
 * mensaje que devolvía Supabase, del que dependen los reintentos del llamador.
 */
export async function storageUpload(
  bucket: string,
  path: string,
  file: File | Blob,
  options: { upsert?: boolean; cacheControl?: string } = {}
): Promise<StorageResult<{ path: string }>> {
  try {
    if (!options.upsert && (await objectExists(bucket, path))) return ALREADY_EXISTS;
    const contentType = file instanceof File && file.type ? file.type : ((file as Blob).type ?? undefined);
    await s3Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: path,
        Body: await toBytes(file),
        CacheControl: options.cacheControl ?? '3600',
        ...(contentType ? { ContentType: contentType } : {}),
      })
    );
    return { ok: true, data: { path } };
  } catch (error) {
    const message = errorMessage(error, 'No se pudo subir el archivo');
    logger.error('Error al subir archivo al storage', { data: { bucket, path, message } });
    return fail(message);
  }
}

/**
 * Borra los objetos indicados. Borrar algo inexistente no es error (igual que en S3).
 *
 * Se intentan TODOS aunque alguno falle (`allSettled`): con `Promise.all`, el primer
 * rechazo dejaba los demás borrados a medio camino y el log no decía cuáles.
 */
export async function storageRemove(bucket: string, paths: string[]): Promise<StorageResult<null>> {
  if (paths.length === 0) return { ok: true, data: null };
  // Uno por uno en vez de `DeleteObjects`: los lotes acá son de 1–3 archivos y el batch
  // exige un checksum del cuerpo que no todos los almacenamientos S3 compatibles aceptan.
  const results = await Promise.allSettled(
    paths.map((path) => s3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: path })))
  );
  const failed = results
    .map((result, i) => (result.status === 'rejected' ? { path: paths[i], reason: result.reason } : null))
    .filter((item): item is { path: string; reason: unknown } => item !== null);

  if (failed.length > 0) {
    logger.error('Error al eliminar archivos del storage', {
      data: { bucket, failed: failed.map((f) => f.path), total: paths.length },
    });
    return fail(errorMessage(failed[0].reason, 'No se pudieron eliminar los archivos'));
  }
  return { ok: true, data: null };
}

export async function storageDownload(bucket: string, path: string): Promise<StorageResult<Blob>> {
  try {
    const response = await s3Client().send(new GetObjectCommand({ Bucket: bucket, Key: path }));
    if (!response.Body) return fail('Archivo no encontrado', 'not-found');
    const bytes = await response.Body.transformToByteArray();
    return { ok: true, data: new Blob([bytes as BlobPart], { type: response.ContentType ?? 'application/octet-stream' }) };
  } catch (error) {
    const message = errorMessage(error, 'Archivo no encontrado');
    logger.error('Error al descargar archivo del storage', { data: { bucket, path, message } });
    return fail(message, 'not-found');
  }
}

/** Entrada de `storageList`: el NOMBRE del hijo inmediato de `prefix`, sin la ruta. */
export type StorageEntry = { name: string };

/**
 * Hijos inmediatos de `prefix` dentro del bucket: devuelve sólo el último segmento del
 * nombre, sin recursión.
 *
 * DIVERGE del `list()` de Supabase: éste devuelve únicamente ARCHIVOS. Las subcarpetas
 * (`CommonPrefixes` de S3) no se leen, así que no aparecen en el resultado. El único
 * llamador (`movePreparteFile`) busca un archivo hermano por nombre, así que no las
 * necesita; si algún día hace falta navegar carpetas, hay que sumar `CommonPrefixes`.
 */
export async function storageList(bucket: string, prefix: string): Promise<StorageResult<StorageEntry[]>> {
  const normalized = prefix && !prefix.endsWith('/') ? `${prefix}/` : prefix;
  try {
    const entries: StorageEntry[] = [];
    let token: string | undefined;
    do {
      const response = await s3Client().send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: normalized || undefined,
          Delimiter: '/',
          ContinuationToken: token,
        })
      );
      for (const object of response.Contents ?? []) {
        if (!object.Key || object.Key === normalized) continue;
        entries.push({ name: object.Key.slice(normalized.length) });
      }
      token = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (token);
    return { ok: true, data: entries };
  } catch (error) {
    const message = errorMessage(error, 'No se pudo listar el bucket');
    logger.error('Error al listar el storage', { data: { bucket, prefix, message } });
    return fail(message);
  }
}

/**
 * Mueve un objeto dentro del mismo bucket (copiar + borrar: S3 no tiene `move`).
 *
 * `overwrite: false` (el default) falla con `code: 'already-exists'` si el destino existe;
 * de eso depende el reintento de `movePreparteFile`.
 *
 * Si la COPIA salió bien pero el borrado del origen falla, devuelve `ok`: el archivo ya
 * está en su destino, que es lo que el llamador necesita para guardar la fila. Devolver
 * error ahí hacía que el llamador descartara un movimiento que en realidad ocurrió.
 *
 * CONTRAPARTIDA CONOCIDA: en ese caso el origen queda como basura silenciosa. Se loguea,
 * pero NO hay job que la limpie; hoy el único llamador es `movePreparteFile` y el origen es
 * una subida temporal del formulario, que ya podía quedar huérfana si el usuario abandonaba
 * el alta. Si algún día el storage necesita un barrido de huérfanos, este es uno de los
 * casos que tiene que cubrir.
 */
export async function storageMove(
  bucket: string,
  fromPath: string,
  toPath: string,
  options: { overwrite?: boolean } = {}
): Promise<StorageResult<{ path: string }>> {
  if (fromPath === toPath) return { ok: true, data: { path: toPath } };
  try {
    if (!options.overwrite && (await objectExists(bucket, toPath))) return ALREADY_EXISTS;
    await s3Client().send(
      new CopyObjectCommand({
        Bucket: bucket,
        // `CopySource` es `/<bucket>/<key>` y va URL-encodeado: las keys tienen espacios y tildes.
        CopySource: `/${bucket}/${encodeURIComponent(fromPath).replace(/%2F/g, '/')}`,
        Key: toPath,
      })
    );
  } catch (error) {
    const message = errorMessage(error, 'No se pudo mover el archivo');
    logger.error('Error al copiar un archivo del storage', { data: { bucket, fromPath, toPath, message } });
    return fail(message);
  }

  try {
    await s3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: fromPath }));
  } catch (error) {
    logger.error('El archivo se copió pero no se pudo borrar el origen: queda huérfano', {
      data: { bucket, fromPath, toPath, message: errorMessage(error, 'desconocido') },
    });
  }
  return { ok: true, data: { path: toPath } };
}

/**
 * Verifica que los objetos existan y devuelve una URL por path, en el mismo orden.
 *
 * El llamador espera que una URL devuelta sea utilizable (`getContractDocuments` muestra
 * `url: ''` para las que no), así que un solo path faltante invalida el lote.
 */
async function storageUrls(
  bucket: string,
  paths: string[],
  build: (bucket: string, path: string) => string
): Promise<StorageResult<{ path: string; url: string }[]>> {
  if (paths.length === 0) return { ok: true, data: [] };
  try {
    const existing = await Promise.all(paths.map((path) => objectExists(bucket, path)));
    const missing = paths.filter((_, i) => !existing[i]);
    if (missing.length > 0) {
      logger.error('Se pidieron enlaces de archivos inexistentes', { data: { bucket, failed: missing } });
      return fail('Alguno de los archivos no existe en el storage', 'not-found');
    }
    return { ok: true, data: paths.map((path) => ({ path, url: build(bucket, path) })) };
  } catch (error) {
    const message = errorMessage(error, 'No se pudieron generar los enlaces');
    logger.error('Error al generar los enlaces', { data: { bucket, count: paths.length, message } });
    return fail(message);
  }
}

/**
 * URLs para VER el archivo: se abren en el navegador (PDF embebido, imagen, pestaña nueva).
 * Sin `?download=1`, así que el navegador decide según el `Content-Type`.
 *
 * Ver y descargar son dos cosas distintas y el llamador tiene que elegir: servir siempre con
 * `Content-Disposition: attachment` convierte el botón "Ver" en una descarga y deja el
 * `<embed type="application/pdf">` en blanco.
 */
export async function storageFileUrls(
  bucket: string,
  paths: string[]
): Promise<StorageResult<{ path: string; url: string }[]>> {
  return storageUrls(bucket, paths, buildStorageFileUrl);
}

/**
 * URLs para DESCARGAR el archivo: la ruta responde con `Content-Disposition: attachment`.
 *
 * NO son URLs firmadas contra RustFS, y esa es una decisión deliberada: firmar exigía
 * publicar RustFS en internet bajo su propio dominio con DNS y TLS, más dos variables de
 * entorno que hay que mantener sincronizadas a mano y cuyo desfasaje falla en silencio con
 * `SignatureDoesNotMatch` en TODA descarga. Con la ruta sirviendo por stream, el ahorro de
 * sacar los bytes de la app no compensa esa superficie: este es un sistema de gestión
 * interno, no un CDN. Además el visor de documentos ya servía los mismos PDF por la ruta.
 */
export async function storageDownloadUrls(
  bucket: string,
  paths: string[]
): Promise<StorageResult<{ path: string; url: string }[]>> {
  return storageUrls(bucket, paths, buildStorageDownloadUrl);
}

/**
 * URL ESTABLE de un archivo, para guardar en la base (logo de empresa, fotos de equipamiento,
 * imágenes de reparación, firmas de ropa...).
 *
 * Apunta a la ruta proxy `/api/files/...` de la app, que valida el perímetro de empresa y
 * hace stream desde RustFS. NO es una URL firmada a propósito: estas URLs quedan PERSISTIDAS
 * (`company.company_logo`, `other_equipment_certifications.file_url`,
 * `maintenance_order_items.images`, `tires.discard_photo`, `clothing_deliveries.signature_url`,
 * `preparte.preparteImage`, `profile.avatar`), así que una firma con vencimiento dejaría el
 * registro roto al caducar. Ver `storage-url.ts`.
 */
export async function storagePublicUrl(bucket: string, path: string): Promise<string> {
  return buildStorageFileUrl(bucket, path);
}
