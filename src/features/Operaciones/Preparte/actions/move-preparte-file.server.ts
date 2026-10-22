'use server';

import { Logger } from '@/lib/logger';
import { storageList, storageMove, storageRemove } from '@/shared/lib/storage';
import { buildStorageFileUrl, isSafeStorageKey, parseStorageFileUrl } from '@/shared/lib/storage-url';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { assertPreparteActionAllowed } from '../lib/preparte-permissions';

const logger = new Logger('features/Operaciones/Preparte/mutations');

// ============================================================================
// ARCHIVO DE LA IMAGEN DEL PEDIDO
// ============================================================================

/** Bucket de las imágenes adjuntas a los pedidos. */
const PREPARTE_BUCKET = 'preparte-img';

/** Nombre de carpeta seguro a partir del nombre del cliente o del contrato. */
function normalizeFolder(value: string): string {
  return (
    value
      ?.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '-')
      .toLowerCase() || ''
  );
}

/**
 * El cliente pudo haberle sacado los espacios a la URL al pasarla por el formulario: si la
 * key no existe tal cual, se busca entre los hermanos uno cuyo nombre sin espacios coincida.
 */
async function resolveActualKey(candidate: string): Promise<string> {
  const parts = candidate.split('/');
  const name = parts.pop() as string;
  const parent = parts.join('/');
  const listed = await storageList(PREPARTE_BUCKET, parent);
  if (!listed.ok) {
    logger.warn('No se pudo listar el bucket para resolver el nombre real', { data: { error: listed.error } });
    return candidate;
  }
  const withoutSpaces = (value: string) => value.replace(/\s+/g, '');
  const match = listed.data.find((entry) => withoutSpaces(entry.name) === withoutSpaces(name));
  if (!match) return candidate;
  return parent ? `${parent}/${match.name}` : match.name;
}

/**
 * Mueve la imagen ya subida a su ruta final
 * `<empresa>/<cliente>/<contrato>/<pedido>/<pedido>.<ext>` y devuelve su URL estable.
 *
 * Perímetro: la URL llega del cliente, así que lo único que se acepta es un archivo del
 * bucket de preparte que ya esté dentro de la carpeta de la empresa activa —que es donde
 * `uploadToStorage` deja todo lo que sube el navegador—. El destino se arma acá y también
 * cuelga de esa carpeta: el pedido no puede sacar el archivo de su empresa ni traerse uno
 * de otra.
 */
export async function movePreparteFile(
  fromUrl: string,
  clienteName: string,
  contratoName: string,
  numeroPedido: string
): Promise<string> {
  // Se usa tanto al crear como al editar un pedido: alcanza con cualquiera de los dos permisos.
  await assertPreparteActionAllowed('create', 'update');
  const companyId = await getActiveCompanyId();

  const source = parseStorageFileUrl(fromUrl);
  if (!source || source.bucket !== PREPARTE_BUCKET || !isSafeStorageKey(source.path)) {
    throw new Error('La imagen del pedido no es un archivo válido del storage');
  }
  if (!source.path.startsWith(`${companyId}/`)) {
    throw new Error('La imagen del pedido no pertenece a la empresa activa');
  }

  const fromPath = await resolveActualKey(source.path);
  const empresaDir = normalizeFolder(clienteName) || 'empresa';
  const contratoDir = normalizeFolder(contratoName) || 'servicio';
  // El número de pedido también se normaliza: llega del formulario y entra en la key, que
  // ahora queda PERSISTIDA en `preparte.preparteImage`. Un carácter raro ahí es permanente.
  const pedidoDir = normalizeFolder(numeroPedido) || 'pedido';
  const currentExt =
    fromPath
      .split('.')
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, '') || 'jpg';
  const targetPath = `${companyId}/${empresaDir}/${contratoDir}/${pedidoDir}/${pedidoDir}.${currentExt}`;

  if (fromPath !== targetPath) {
    let moved = await storageMove(PREPARTE_BUCKET, fromPath, targetPath);
    if (!moved.ok && moved.code === 'already-exists') {
      // El pedido ya tenía una imagen: se reemplaza por la nueva.
      await storageRemove(PREPARTE_BUCKET, [targetPath]);
      moved = await storageMove(PREPARTE_BUCKET, fromPath, targetPath);
    }
    if (!moved.ok) {
      logger.error('Error moviendo el archivo del pedido', { data: { error: moved.error, fromPath, targetPath } });
      throw new Error(`No se pudo mover el archivo en Storage: ${moved.error}`);
    }
  }

  // La key es determinística (una imagen por pedido, que se PISA al reemplazarla), así que
  // el string guardado no cambiaría y el navegador serviría la foto vieja de su caché hasta
  // un día. El `?v=` lo renueva, igual que hace el logo de empresa —el otro caso de key que
  // se pisa en su lugar—. No se le mete timestamp a la key, como sí hacen `repair-images`,
  // `tire-discards` y `clothing-signatures`: esos son colecciones donde cada archivo se
  // suma, y acá reemplazar dejaría la foto anterior huérfana para siempre (no hay job de
  // limpieza). `parseStorageFileUrl` ignora el querystring, así que el reemplazo siguiente
  // vuelve a resolver la key sin problema.
  return `${buildStorageFileUrl(PREPARTE_BUCKET, targetPath)}?v=${Date.now()}`;
}
