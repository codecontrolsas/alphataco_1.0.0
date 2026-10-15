import moment from 'moment';

/**
 * Fechas de contratos (`customer_services.service_start` / `service_validity`): columnas `date`
 * de Postgres, sin hora. Estos helpers evitan que el día se corra por la zona horaria.
 */

/**
 * Columnas `date` llegan de Prisma como `Date` a medianoche UTC. Para mostrarlas en un
 * calendario local sin correr el día, se reconstruye la fecha con los componentes UTC.
 */
export function dbDateToLocal(value: Date): Date {
  return new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

/**
 * Un día elegido en el calendario (hora local) viaja al servidor como medianoche UTC de ese
 * mismo día: así Prisma escribe la columna `date` sin depender de la zona horaria del server.
 */
export function localDateToDb(value: Date): Date {
  return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
}

/** `DD/MM/YYYY` de una columna `date` (medianoche UTC): se lee en UTC para no correr el día. */
export function formatDbDate(value: Date | null): string {
  return value ? moment.utc(value).format('DD/MM/YYYY') : '-';
}

/** `YYYY-MM-DD` de una columna `date`: ordena como texto y sirve de valor de la columna. */
export function dbDateToIso(value: Date | null): string {
  return value ? moment.utc(value).format('YYYY-MM-DD') : '';
}

/** Días que faltan para una fecha `date` respecto de `today` (`YYYY-MM-DD`, hora argentina). Negativo = ya pasó. */
export function daysUntilDbDate(value: Date, today: string): number {
  return moment.utc(value).startOf('day').diff(moment.utc(today, 'YYYY-MM-DD'), 'days');
}

/** Vigencia desde la que un contrato activo se marca "por vencer". */
export const EXPIRING_SOON_DAYS = 30;

export type ValidityTone = 'expired' | 'expiring' | 'ok' | 'none';

/** Tono de la vigencia de un contrato: solo los activos se marcan; uno inactivo ya no vence. */
export function contractValidityTone(validity: Date | null, isActive: boolean, today: string): ValidityTone {
  if (!validity || !isActive) return 'none';
  const days = daysUntilDbDate(validity, today);
  if (days < 0) return 'expired';
  return days <= EXPIRING_SOON_DAYS ? 'expiring' : 'ok';
}
