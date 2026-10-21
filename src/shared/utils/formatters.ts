/**
 * Utilidades de formateo
 * Funciones para formatear fechas, valores y cálculos comunes
 */

import moment from 'moment';

// ============================================
// FORMATEO DE VALORES
// ============================================

/**
 * Muestra un valor o un fallback si es nulo/vacío
 */
export function displayValue(value: string | number | null | undefined, fallback = 'No especificado'): string {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

// ============================================
// FORMATEO DE FECHAS
// ============================================

/**
 * Formatea una fecha a DD/MM/YYYY
 */
export function formatDate(date: Date | string | null | undefined, fallback = 'No especificada'): string {
  if (!date) return fallback;
  return moment(date).format('DD/MM/YYYY');
}

/**
 * Formatea una fecha con hora a DD/MM/YYYY HH:mm
 */
export function formatDateTime(date: Date | string | null | undefined, fallback = 'No especificada'): string {
  if (!date) return fallback;
  return moment(date).format('DD/MM/YYYY HH:mm');
}

/**
 * Formatea un número con separadores de miles
 */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('es-AR').format(value);
}

// ============================================
// FORMATEO DE STRINGS
// ============================================

/**
 * Obtiene las iniciales de un nombre completo
 */
export function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}
