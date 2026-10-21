import moment from 'moment';
import 'moment/locale/es';

// Configurar locale español para moment
moment.locale('es');

/**
 * Timezone de Argentina para formatear fechas correctamente
 * Nota: moment sin timezone interpreta las fechas como locales,
 * por lo que las fechas tipo 'date' (YYYY-MM-DD) de la BD se interpretan
 * correctamente sin offset de timezone.
 */

/**
 * Formatea una fecha tipo 'date' (YYYY-MM-DD) de la base de datos.
 * Estas fechas NO tienen hora y deben mostrarse sin interpretar timezone.
 *
 * @param date - Fecha en formato YYYY-MM-DD o Date
 * @param format - Formato deseado (default: DD/MM/YYYY)
 * @returns Fecha formateada o '-' si es null/undefined
 */
export function formatDateOnly(date: string | Date | null | undefined, format = 'DD/MM/YYYY'): string {
  if (!date) return '-';

  // Para fechas tipo 'date' (YYYY-MM-DD), usar moment.utc para evitar
  // que se interprete con offset de timezone local
  const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];

  // Si es una fecha solo (sin hora), usar UTC para evitar desfase
  if (dateStr.length === 10) {
    return moment.utc(dateStr).format(format);
  }

  return moment(date).format(format);
}

/**
 * Formatea una fecha con hora (timestamp) de la base de datos.
 * Estas fechas tienen hora y se muestran en timezone de Argentina.
 *
 * @param date - Fecha en formato ISO o Date
 * @param format - Formato deseado (default: DD/MM/YYYY HH:mm)
 * @returns Fecha formateada o '-' si es null/undefined
 */
export function formatDateTime(date: string | Date | null | undefined, format = 'DD/MM/YYYY HH:mm'): string {
  if (!date) return '-';

  // Siempre hora argentina, sin depender de la zona del servidor ni del navegador.
  // Argentina es UTC-3 fijo (sin horario de verano): el offset se aplica explícito.
  return moment.utc(date).utcOffset(-180).format(format);
}

/**
 * Formatea una fecha en formato largo con día de la semana.
 * Ejemplo: "lunes 28 de enero de 2026"
 *
 * @param date - Fecha en formato YYYY-MM-DD o Date
 * @returns Fecha formateada en formato largo
 */
export function formatDateLong(date: string | Date | null | undefined): string {
  if (!date) return '-';

  const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];

  // Si es una fecha solo (sin hora), usar UTC para evitar desfase
  if (dateStr.length === 10) {
    return moment.utc(dateStr).format('dddd D [de] MMMM [de] YYYY');
  }

  return moment(date).format('dddd D [de] MMMM [de] YYYY');
}

/**
 * Formatea una fecha para enviar a la base de datos en formato YYYY-MM-DD.
 * Útil para campos tipo 'date' de PostgreSQL.
 *
 * @param date - Date object
 * @returns Fecha en formato YYYY-MM-DD
 */
export function formatDateForDB(date: Date): string {
  return moment(date).format('YYYY-MM-DD');
}
