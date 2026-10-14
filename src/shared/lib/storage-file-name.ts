import { argentinaDate } from '@/features/Jobs/lib/dates';

/**
 * Saneo del nombre de archivo que manda el cliente.
 *
 * Módulo PURO y con test propio a propósito: es la pieza que impide que un nombre elegido
 * por el navegador se convierta en una ruta. Todo lo que llega de afuera y termina en una
 * key del storage pasa por acá.
 */

/** Longitud máxima del nombre, para no chocar con el límite de key de S3 (1024 bytes). */
export const MAX_FILE_NAME_LENGTH = 200;

/**
 * Nombre de archivo seguro: se queda con el último segmento (descarta cualquier ruta, `/` o
 * `\`), saca tildes, reemplaza todo lo que no sea `[A-Za-z0-9._-]` por `_`, quita los puntos
 * iniciales (así `..` y `.` no sobreviven) y acota el largo conservando la extensión.
 *
 * Nunca devuelve vacío: si no queda nada utilizable, genera un nombre.
 */
export function toFileName(name: string): string {
  const base = name.split('/').pop()?.split('\\').pop() ?? '';
  const clean = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '');
  if (!clean) return `archivo-${Date.now()}`;
  if (clean.length <= MAX_FILE_NAME_LENGTH) return clean;

  // Trunca conservando la extensión: un nombre larguísimo no puede empujar la extensión
  // fuera de la key (de ella dependen el `Content-Type` y el visor del documento).
  const dot = clean.lastIndexOf('.');
  const ext = dot > 0 ? clean.slice(dot, dot + 20) : '';
  return clean.slice(0, MAX_FILE_NAME_LENGTH - ext.length) + ext;
}

/** Extensión saneada (sin el punto) del nombre, o `'jpg'` si no tiene una utilizable. */
export function extensionOf(name: string): string {
  const clean = toFileName(name);
  const dot = clean.lastIndexOf('.');
  if (dot <= 0) return 'jpg';
  const ext = clean.slice(dot + 1).toLowerCase();
  return ext && ext.length <= 10 ? ext : 'jpg';
}

/** Extensión segura para una key: minúsculas, sólo `[a-z0-9]`, hasta 10 caracteres; `bin` si no queda nada. */
export function toPathExtension(extension: string): string {
  const clean = extension.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
  return clean || 'bin';
}

/** Identificador (CUIT, documento, serie) como segmento de path: sólo `[A-Za-z0-9]`, sin espacios, puntos ni barras. */
export function toPathIdentifier(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '');
}

/** Fecha `DD-MM-YYYY` del día ARGENTINO de `validity` (no depende de la zona del servidor). */
export function formatValidityDay(validity: Date): string {
  const [y, m, d] = argentinaDate(validity).split('-');
  return `${d}-${m}-${y}`;
}
