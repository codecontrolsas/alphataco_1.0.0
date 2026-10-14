/**
 * Constantes y helpers de las fotos de reparación.
 *
 * Viven en un módulo SIN directiva para que los componentes de cliente puedan importar el
 * límite de tamaño sin arrastrar la Server Action que hace la subida.
 */

/** Bucket ya existente en el proyecto, usado por el flujo anterior de solicitudes de reparación */
export const REPAIR_IMAGES_BUCKET = 'repair-images';

export const MAX_REPAIR_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB

/** Nombre de archivo sin tildes, espacios ni caracteres que el storage no admite. */
export function sanitizeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '');
}

/**
 * Tipos de imagen admitidos para las fotos de reparación y de descarte.
 *
 * El formulario ya filtra con `accept`, pero eso es cosmético: la Server Action recibe
 * cualquier archivo, así que el tipo y el tamaño se validan también en el servidor.
 */
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;

/** Extensiones admitidas: el MIME lo declara el cliente, así que también se mira el nombre. */
export const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'] as const;

/** Tope de fotos por subida (la Server Action recibe cualquier cantidad de archivos). */
export const MAX_REPAIR_IMAGES_PER_UPLOAD = 10;

/** Lanza si el archivo no es una imagen admitida o excede el tamaño máximo. */
export function assertValidImageFile(file: File, maxSize: number): void {
  if (!(file instanceof File)) {
    throw new Error('Archivo inválido');
  }
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!(ALLOWED_IMAGE_EXTENSIONS as readonly string[]).includes(extension)) {
    throw new Error(`El archivo "${file.name}" no es una imagen admitida (JPG, PNG, WEBP o HEIC)`);
  }
  if (!(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    throw new Error(`El archivo "${file.name}" no es una imagen admitida (JPG, PNG, WEBP o HEIC)`);
  }
  if (file.size > maxSize) {
    throw new Error(`La imagen "${file.name}" supera el tamaño máximo permitido (${Math.round(maxSize / 1024 / 1024)} MB)`);
  }
}
