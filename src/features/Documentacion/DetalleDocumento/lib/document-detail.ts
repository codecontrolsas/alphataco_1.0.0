import type { DocumentResourceKind } from '@/features/Documentacion/shared/lib/document-scope';
import { formatArgentinaDateTime, formatArgentinaDay } from '@/shared/lib/argentina-time';
import moment from 'moment';

/**
 * Lógica pura del detalle de documento (`/dashboard/document/[id]`). Sin acceso a la base ni a
 * React: traduce el `?resource=` de la URL y arma las etiquetas, variantes de badge y formatos
 * que pinta la vista.
 */

/** Etiquetas del `?resource=` tal como las arma la navegación de documentación. */
const RESOURCE_PARAM_TO_KIND: Record<string, DocumentResourceKind> = {
  Persona: 'employee',
  Equipos: 'vehicle',
  Empresa: 'company',
};

/**
 * Recurso pedido por la URL, o `null` si el parámetro falta o no se reconoce (ahí el detalle
 * busca el documento en las tres tablas).
 */
export function resolveResourceKind(resourceParam: string | undefined | null): DocumentResourceKind | null {
  if (!resourceParam) return null;
  return RESOURCE_PARAM_TO_KIND[resourceParam] ?? null;
}

/** Nombre del recurso para los textos de la vista. */
export function resourceLabel(kind: DocumentResourceKind): string {
  switch (kind) {
    case 'employee':
      return 'Empleado';
    case 'vehicle':
      return 'Equipo';
    case 'company':
      return 'Empresa';
  }
}

/** CUIT/CUIL con guiones (`30712345673` → `30-71234567-3`). Deja intacto lo que no tenga 11 dígitos. */
export function formatCuit(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/(\d{2})(\d{8})(\d{1})/, '$1-$2-$3');
}

/** Variante del badge que muestra el estado del documento. */
export function documentStateBadgeVariant(
  state: string | null | undefined
): 'destructive' | 'success' | 'yellow' | 'default' {
  switch (state) {
    case 'rechazado':
      return 'destructive';
    case 'aprobado':
      return 'success';
    case 'vencido':
      return 'yellow';
    default:
      return 'default';
  }
}

/** Variante del badge del motivo de rechazo: `vencido` también se pinta como error. */
export function denyReasonBadgeVariant(state: string | null | undefined): 'destructive' | 'success' | 'default' {
  if (state === 'rechazado' || state === 'vencido') return 'destructive';
  if (state === 'aprobado') return 'success';
  return 'default';
}

/** true si la URL del archivo apunta a un PDF (se embebe a pantalla completa). */
export function isPdfUrl(url: string): boolean {
  // El querystring se descarta antes de mirar la extensión: las URLs de archivos que se
  // pisan en su lugar llevan `?v=<ts>` para romper la caché del navegador (el logo de
  // empresa, la imagen del preparte), y con él `split('.').pop()` devolvía `pdf?v=123`.
  const withoutQuery = url.split('?')[0].split('#')[0];
  return withoutQuery.split('.').pop()?.toLocaleLowerCase() === 'pdf';
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toValidDate(value: Date | string): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * `DD/MM/YYYY` de un instante en hora argentina. Un string `YYYY-MM-DD` (p. ej. `documents_company.validity`, que es
 * texto) ya es un día calendario y se formatea tal cual, sin pasarlo por la zona horaria.
 */
function argentinaDayLabel(value: Date | string | null | undefined): string {
  if (!value) return '';
  if (typeof value === 'string' && DATE_ONLY_PATTERN.test(value)) return moment.utc(value).format('DD/MM/YYYY');
  const date = toValidDate(value);
  return date ? formatArgentinaDay(date) : '';
}

/** Vencimiento del documento según el tipo: fecha de validez o "no vence". */
export function expiryLabel(expires: boolean | null | undefined, validity: Date | string | null | undefined): string {
  if (!expires) return 'No tiene vencimiento';
  const day = argentinaDayLabel(validity);
  return day ? `Vence el ${day}` : 'Vence (sin fecha cargada)';
}

/** "Subido el DD/MM/YYYY a las HH:mm" (hora argentina), o cadena vacía si el documento no tiene fecha de alta. */
export function uploadedAtLabel(createdAt: Date | string | null | undefined): string {
  if (!createdAt) return '';
  const date = toValidDate(createdAt);
  if (!date) return '';
  const [day, time] = formatArgentinaDateTime(date).split(' ');
  return `Subido el ${day} a las ${time}`;
}

/** Fecha corta (DD/MM/YYYY, día argentino) de un timestamp, o cadena vacía si no hay dato. */
export function shortDate(value: Date | string | null | undefined): string {
  return argentinaDayLabel(value);
}

/** Fecha corta (DD/MM/YYYY) de una columna `@db.Date` (medianoche UTC): se lee en UTC para no correr el día. */
export function dateOnlyLabel(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = moment.utc(value);
  return date.isValid() ? date.format('DD/MM/YYYY') : '';
}

/** Apellido y nombre del empleado, sin espacios sobrantes si falta alguno. */
export function employeeDisplayName(employee: { lastname: string | null; firstname: string | null }): string {
  return [employee.lastname, employee.firstname].filter(Boolean).join(' ');
}

/** Identificación visible de un equipo: dominio y, si no tiene, número interno. */
export function equipmentDisplayName(vehicle: { domain: string | null; intern_number: string | null }): string {
  return vehicle.domain || vehicle.intern_number || '';
}

/** "Calle 123, Ciudad" omitiendo las partes que falten. */
export function employeeAddress(employee: {
  street: string | null;
  street_number: string | null;
  city: { name: string } | null;
}): string {
  const street = [employee.street, employee.street_number].filter(Boolean).join(' ');
  return [street, employee.city?.name].filter(Boolean).join(', ');
}
