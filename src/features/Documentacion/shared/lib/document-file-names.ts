import { formatValidityDay } from '@/shared/lib/storage-file-name';

/**
 * Reglas de nombre de archivo de los documentos en el storage (módulo puro).
 *
 * Los paths tienen la forma `<empresa>-(<cuit>)/<recurso>/<nombre>-(<doc>)/<tipo>-(<marca>).<ext>`
 * donde `<marca>` es la versión `vN`, la fecha de vencimiento `DD-MM-YYYY` o el período `YYYY-MM`.
 * Reemplazar y renovar conservan la carpeta y cambian sólo la marca y la extensión.
 */

const VERSION_RE = /\(v(\d+)\)/;
/** Fecha `DD-MM-YYYY` justo antes de la extensión (formato que graba la subida). */
const REPLACE_DATE_RE = /\((\d{2}-\d{2}-\d{4})\)$/;
/** Fecha en cualquiera de los dos formatos históricos. */
const RENEW_DATE_RE = /\(((\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4})[\s\S]*?)\)/;
const PERIOD_RE = /\((\d{4}-\d{2})\)/;

function splitExtension(path: string): { base: string; ext: string } {
  const slash = path.lastIndexOf('/');
  const dot = path.lastIndexOf('.');
  if (dot <= slash) return { base: path, ext: '' };
  return { base: path.slice(0, dot), ext: path.slice(dot + 1) };
}

/** Nombre del archivo al REEMPLAZAR: misma marca salvo que haya nueva validez; extensión del archivo nuevo. */
export function buildReplacedDocumentName(
  currentPath: string,
  newExtension: string,
  validity: Date | undefined
): string {
  const { base } = splitExtension(currentPath);
  const renamed =
    validity && REPLACE_DATE_RE.test(base) ? base.replace(REPLACE_DATE_RE, `(${formatValidityDay(validity)})`) : base;
  return `${renamed}.${newExtension}`;
}

/** Nombre del archivo al RENOVAR: sube la versión, o cambia la fecha de vencimiento, o cambia el período. */
export function buildRenewedDocumentName(
  currentPath: string,
  newExtension: string,
  next: { validity?: Date; period?: string }
): string {
  const { base } = splitExtension(currentPath);
  let renamed = base;
  const versionMatch = base.match(VERSION_RE);
  if (versionMatch) {
    renamed = base.replace(VERSION_RE, `(v${Number(versionMatch[1]) + 1})`);
  } else if (RENEW_DATE_RE.test(base) && next.validity) {
    renamed = base.replace(RENEW_DATE_RE, `(${formatValidityDay(next.validity)})`);
  } else if (PERIOD_RE.test(base) && next.period) {
    renamed = base.replace(PERIOD_RE, `(${next.period})`);
  }
  return `${renamed}.${newExtension}`;
}

/**
 * Inserta un segmento único (uuid) como carpeta justo antes del nombre del archivo, para que dos
 * subidas del mismo tipo/versión no se pisen. Conserva la marca `(...)` del final del nombre, que
 * leen `buildReplacedDocumentName` y `buildRenewedDocumentName`.
 */
export function withUniqueFolder(path: string, uniqueId: string = crypto.randomUUID()): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? `${uniqueId}/${path}` : `${path.slice(0, slash)}/${uniqueId}/${path.slice(slash + 1)}`;
}

/**
 * `true` si `path` es un archivo dentro de la carpeta `companyPrefix` (sin `..`, sin `/` inicial).
 * Sirve para validar un path que llega del cliente antes de escribir en el storage.
 */
export function isPathWithinCompanyFolder(path: string, companyPrefix: string): boolean {
  if (!path.startsWith(companyPrefix) || path.length <= companyPrefix.length) return false;
  if (path.startsWith('/') || path.includes('\\')) return false;
  return !path.split('/').some((segment) => segment === '..' || segment === '.' || segment === '');
}
