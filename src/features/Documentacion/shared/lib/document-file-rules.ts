/**
 * Reglas del archivo de un documento (módulo puro: lo usan el servidor y los inputs del cliente).
 * El tope coincide con `experimental.serverActions.bodySizeLimit` de `next.config` (10 MB).
 */
export const MAX_DOCUMENT_FILE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_DOCUMENT_EXTENSIONS = [
  'pdf',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'heic',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'odt',
  'ods',
  'txt',
] as const;

/** Valor para el atributo `accept` de los `<input type="file">` de documentos. */
export const DOCUMENT_FILE_ACCEPT = ALLOWED_DOCUMENT_EXTENSIONS.map((ext) => `.${ext}`).join(',');

/** Mensaje de error si el archivo no cumple tamaño/extensión; `null` si es válido. */
export function validateDocumentFile(file: { name: string; size: number }): string | null {
  if (file.size === 0) return 'El documento es requerido';
  if (file.size > MAX_DOCUMENT_FILE_BYTES) {
    return `El archivo supera el máximo de ${MAX_DOCUMENT_FILE_BYTES / (1024 * 1024)} MB`;
  }
  const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : undefined;
  if (!ext || !(ALLOWED_DOCUMENT_EXTENSIONS as readonly string[]).includes(ext)) {
    return `Formato de archivo no permitido. Formatos válidos: ${ALLOWED_DOCUMENT_EXTENSIONS.join(', ')}`;
  }
  return null;
}
