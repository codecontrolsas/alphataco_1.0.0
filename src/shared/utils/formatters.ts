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

// ============================================
// CÁLCULOS DE TIEMPO
// ============================================

/**
 * Calcula la edad en años a partir de una fecha de nacimiento
 */
export function calculateAge(birthDate: Date | string | null | undefined): number | null {
  if (!birthDate) return null;
  return moment().diff(moment(birthDate), 'years');
}

/**
 * Calcula la antigüedad en años y meses
 */
export function calculateSeniority(
  hireDate: Date | string | null | undefined
): { years: number; months: number } | null {
  if (!hireDate) return null;
  const years = moment().diff(moment(hireDate), 'years');
  const months = moment().diff(moment(hireDate), 'months') % 12;
  return { years, months };
}

/**
 * Formatea la antigüedad para mostrar (ej: "2 años, 3 meses")
 */
export function formatSeniority(hireDate: Date | string | null | undefined): string {
  const seniority = calculateSeniority(hireDate);
  if (!seniority) return '';

  const { years, months } = seniority;

  if (years === 0 && months === 0) return 'Menos de 1 mes';
  if (years === 0) return `${months} ${months === 1 ? 'mes' : 'meses'}`;
  if (months === 0) return `${years} ${years === 1 ? 'año' : 'años'}`;
  return `${years} ${years === 1 ? 'año' : 'años'}, ${months} ${months === 1 ? 'mes' : 'meses'}`;
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
