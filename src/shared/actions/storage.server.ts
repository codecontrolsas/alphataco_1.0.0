'use server';

import { CORE_MODULE, moduleForBucket } from '@/features/Modules/catalog';
import { MODULE_DISABLED_MESSAGE, isModuleEnabled } from '@/features/Modules/server/modules.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getSessionUserId } from '@/shared/lib/session';
import { storageUpload } from '@/shared/lib/storage';
import { isClientUploadBucket } from '@/shared/lib/storage-buckets';
import { extensionOf, toFileName } from '@/shared/lib/storage-file-name';
import { buildStorageFileUrl } from '@/shared/lib/storage-url';
import { getActiveCompanyId } from '@/shared/lib/tenant';

/**
 * Subida de una imagen desde el navegador (el archivo viaja en un FormData a esta action).
 *
 * Es un ENDPOINT: todo lo que recibe viene del cliente y no se le cree nada.
 * Antes tomaba el bucket y el path tal cual y los pasaba al storage, así que cualquiera con
 * sesión podía escribir en cualquier bucket y en cualquier carpeta —incluso pisar el logo o
 * un documento de otra empresa—. Ahora:
 *
 * - el bucket tiene que estar en `CLIENT_UPLOAD_BUCKETS` (los únicos que se suben desde el
 *   navegador); los documentos, remitos y contratos se suben desde actions que arman el
 *   path ellas mismas;
 * - **la key entera la decide el servidor**, con una regla por bucket (ver `buildKey`). Del
 *   nombre que manda el cliente sólo puede sobrevivir un nombre de archivo saneado, y en el
 *   caso del avatar ni eso: la key sale del perfil de la sesión;
 * - se devuelve la URL ya armada, para que el llamador no la construya a mano.
 */
const logger = new Logger('shared/storage');

export type StorageUploadResult = { ok: true; path: string; url: string } | { ok: false; error: string };

/**
 * Key de destino según el bucket. En los dos casos la arma el servidor:
 *
 * - `avatar`: `<profileId de la sesión>.<ext>`. La identidad NO viaja en el pedido, así que
 *   nadie puede pisarle el avatar a otro mandando su id. Antes la key venía del cliente
 *   (`UploadImage` armaba `<profileId>.jpg`) y con `upsert: true` alcanzaba una llamada a
 *   mano con el id ajeno.
 * - `preparte-img`: `<empresa activa>/<nombre saneado>`.
 */
async function buildKey(
  bucket: string,
  fileName: string
): Promise<{ ok: true; key: string } | { ok: false; error: string }> {
  if (bucket === 'avatar') {
    const credentialId = await getSessionUserId();
    if (!credentialId) return { ok: false, error: 'Sesión requerida' };
    const profile = await prisma.profile.findUnique({ where: { credential_id: credentialId }, select: { id: true } });
    if (!profile) return { ok: false, error: 'El usuario de sesión no tiene perfil' };
    return { ok: true, key: `${profile.id}.${extensionOf(fileName)}` };
  }

  try {
    const companyId = await getActiveCompanyId();
    return { ok: true, key: `${companyId}/${toFileName(fileName)}` };
  } catch {
    return { ok: false, error: 'No hay empresa activa' };
  }
}

/**
 * Sube `file` al bucket indicado, en la key que decide el servidor.
 * Devuelve la key guardada y su URL estable, o el mensaje de error del storage (sin lanzar,
 * para que el llamador lo traduzca con `translateErrorMessage`).
 */
export async function uploadToStorage(
  bucket: string,
  fileName: string,
  file: File,
  options: { upsert?: boolean; cacheControl?: string } = {}
): Promise<StorageUploadResult> {
  if (!isClientUploadBucket(bucket)) {
    logger.warn('Subida rechazada: bucket no habilitado para el cliente', { data: { bucket } });
    return { ok: false, error: 'No se puede subir a ese destino' };
  }

  // Módulo dueño del bucket apagado para la empresa activa (F3.3): no se sube nada (`avatar` es del núcleo).
  const owner = moduleForBucket(bucket as Parameters<typeof moduleForBucket>[0]);
  if (owner && owner !== CORE_MODULE && !(await isModuleEnabled(owner))) {
    return { ok: false, error: MODULE_DISABLED_MESSAGE };
  }

  const destination = await buildKey(bucket, fileName);
  if (!destination.ok) return destination;

  // El avatar siempre se pisa: la key es la del propio perfil, así que reemplazarlo es la
  // operación, no un riesgo. En el resto manda el llamador.
  const upsert = bucket === 'avatar' ? true : options.upsert ?? false;

  const uploaded = await storageUpload(bucket, destination.key, file, { ...options, upsert });
  if (!uploaded.ok) {
    logger.error('Error al subir archivo al storage', {
      data: { bucket, path: destination.key, message: uploaded.error },
    });
    return { ok: false, error: uploaded.error };
  }
  return { ok: true, path: uploaded.data.path, url: buildStorageFileUrl(bucket, uploaded.data.path) };
}
