import { parseStorageFileUrl } from '@/shared/lib/storage-url';

/**
 * Reglas puras de los archivos de un equipamiento en el storage (fotos, planos y
 * certificaciones). Los paths tienen la forma `other-equipment-<tipo>/<equipoId>/<ts>_<nombre>`;
 * las server actions arman el path acá (nunca lo reciben del cliente) y validan con
 * `isOtherEquipmentFilePath` que un archivo a borrar pertenezca a ese equipo.
 */

export type OtherEquipmentFileKind = 'pictures' | 'blueprints' | 'certifications';

export const OTHER_EQUIPMENT_FILE_KINDS: readonly OtherEquipmentFileKind[] = [
  'pictures',
  'blueprints',
  'certifications',
];

export function isOtherEquipmentFileKind(value: unknown): value is OtherEquipmentFileKind {
  return typeof value === 'string' && (OTHER_EQUIPMENT_FILE_KINDS as readonly string[]).includes(value);
}

const FOLDER_BY_KIND: Record<OtherEquipmentFileKind, string> = {
  pictures: 'other-equipment-pictures',
  blueprints: 'other-equipment-blueprints',
  certifications: 'other-equipment-certifications',
};

export function sanitizeFileName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\\/]/g, '_').replace(/\s+/g, '_');
}

export function buildOtherEquipmentFilePath(
  kind: OtherEquipmentFileKind,
  equipmentId: string,
  fileName: string,
  timestamp: number
): string {
  return `${FOLDER_BY_KIND[kind]}/${equipmentId}/${timestamp}_${sanitizeFileName(fileName)}`;
}

/** Path relativo del storage a partir de la URL guardada, o null si no es de ese bucket. */
export function extractStoragePath(fileUrl: string, bucket: string): string | null {
  const parsed = parseStorageFileUrl(fileUrl);
  if (!parsed || parsed.bucket !== bucket) return null;
  return parsed.path;
}

/** `true` si `path` es un archivo dentro de la carpeta `<tipo>/<equipoId>/` (sin `..`, sin `/` inicial). */
export function isOtherEquipmentFilePath(path: string, kind: OtherEquipmentFileKind, equipmentId: string): boolean {
  const prefix = `${FOLDER_BY_KIND[kind]}/${equipmentId}/`;
  if (!path.startsWith(prefix) || path.length <= prefix.length) return false;
  if (path.startsWith('/') || path.includes('\\')) return false;
  return !path.split('/').some((segment) => segment === '..' || segment === '.' || segment === '');
}

/**
 * Reglas de subida por tipo de archivo. La lista blanca se valida en el SERVIDOR (extensión y
 * MIME declarado): el `accept` del input es solo una ayuda del navegador. Sin SVG: un SVG puede
 * llevar scripts y se serviría desde el mismo origen.
 */
interface UploadRule {
  extensions: readonly string[];
  /** MIME aceptados. Un MIME vacío (DWG/DXF no tienen tipo registrado) pasa si la extensión es válida. */
  mimeTypes: readonly string[];
  label: string;
}

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;
const CAD_MIME_TYPES = [
  'application/octet-stream',
  'application/acad',
  'application/x-acad',
  'application/dxf',
  'application/x-dxf',
  'image/vnd.dwg',
  'image/vnd.dxf',
  'image/x-dwg',
  'image/x-dxf',
] as const;

export const UPLOAD_RULES: Record<OtherEquipmentFileKind, UploadRule> = {
  pictures: {
    extensions: ['jpg', 'jpeg', 'png', 'webp'],
    mimeTypes: IMAGE_MIME_TYPES,
    label: 'JPG, PNG o WEBP',
  },
  blueprints: {
    extensions: ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'webp', 'dwg', 'dxf'],
    mimeTypes: [...DOCUMENT_MIME_TYPES, ...IMAGE_MIME_TYPES, ...CAD_MIME_TYPES],
    label: 'PDF, DOC, DOCX, JPG, PNG, WEBP, DWG o DXF',
  },
  certifications: {
    extensions: ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'webp'],
    mimeTypes: [...DOCUMENT_MIME_TYPES, ...IMAGE_MIME_TYPES],
    label: 'PDF, DOC, DOCX, JPG, PNG o WEBP',
  },
};

/** Tope de archivos por equipo en las columnas de arrays (certificaciones son filas, sin tope). */
export const MAX_FILES_BY_KIND: Record<Exclude<OtherEquipmentFileKind, 'certifications'>, number> = {
  pictures: 4,
  blueprints: 20,
};

/** Mensaje de error si el archivo no cumple la lista blanca del tipo, o `null` si es válido. */
export function validateUploadFile(kind: OtherEquipmentFileKind, fileName: string, mimeType: string): string | null {
  const rule = UPLOAD_RULES[kind];
  const dot = fileName.lastIndexOf('.');
  const extension = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
  const mime = mimeType.trim().toLowerCase();
  const extensionOk = rule.extensions.includes(extension);
  const mimeOk = mime === '' || rule.mimeTypes.includes(mime);
  if (!extensionOk || !mimeOk) return `Tipo de archivo no permitido. Formatos aceptados: ${rule.label}`;
  return null;
}

export function isImageUrl(url: string): boolean {
  const lower = url.toLowerCase().split('?')[0];
  return /\.(jpg|jpeg|png|webp|gif|bmp|svg)$/.test(lower);
}

/** Nombre legible del archivo (sin el prefijo `<timestamp>_`). */
export function getFileNameFromUrl(url: string): string {
  try {
    const decoded = decodeURIComponent(url);
    const last = decoded.split('/').pop() ?? decoded;
    return last.replace(/^\d+_/, '');
  } catch {
    return url;
  }
}
