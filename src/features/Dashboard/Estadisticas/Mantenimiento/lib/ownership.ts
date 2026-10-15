import { contract_type_vehicles_enum } from '@/generated/prisma/enums';
import { argentinaDate } from '@/shared/lib/argentina-time';
import moment from 'moment';
import type { MaintenanceTypeOption, OwnershipCategory } from '../types';

/**
 * Reglas puras del dashboard de mantenimiento: a qué categoría de tenencia pertenece cada
 * tipo de contrato y cuántos días del período hay que contar. Estaban embebidas en
 * `actions/actions.server.ts`, que además hace las queries.
 */

/**
 * Tipo de contrato → categoría del dashboard.
 * "Prendado" se agrupa con "Leasing" por decisión de negocio.
 */
export const CATEGORY_BY_CONTRACT_TYPE: Record<contract_type_vehicles_enum, OwnershipCategory> = {
  Propio: 'Propios',
  Leasing: 'Leasing',
  Prendado: 'Leasing',
  Alquiler: 'Contratados',
};

/** La vuelta: categoría → tipos de contrato que la componen. */
export const CONTRACT_TYPES_BY_CATEGORY: Record<OwnershipCategory, contract_type_vehicles_enum[]> = {
  Propios: [contract_type_vehicles_enum.Propio],
  Leasing: [contract_type_vehicles_enum.Leasing, contract_type_vehicles_enum.Prendado],
  Contratados: [contract_type_vehicles_enum.Alquiler],
};

/** Categoría de un equipo; los que no tienen tipo de contrato cuentan como propios. */
export function categoryForContractType(
  contractType: contract_type_vehicles_enum | null | undefined
): OwnershipCategory {
  return contractType ? CATEGORY_BY_CONTRACT_TYPE[contractType] : 'Propios';
}

/**
 * Días calendario transcurridos del mes del `monthStart`, contando "hoy" en hora argentina:
 * - mes en curso → del 1 a hoy (inclusive);
 * - mes pasado → todos los días del mes;
 * - mes futuro → 0.
 * Se compara con fechas ISO (`YYYY-MM-DD`), no con instantes: en las últimas horas del día
 * argentino el servidor (UTC) ya está en el día siguiente y sumaba un día de más.
 */
export function computeDaysElapsed(monthStart: moment.Moment, now: Date = new Date()): number {
  const today = argentinaDate(now);
  const monthKey = monthStart.format('YYYY-MM');
  const todayMonthKey = today.slice(0, 7);
  if (monthKey > todayMonthKey) return 0;
  if (monthKey < todayMonthKey) return monthStart.daysInMonth();
  return Number(today.slice(8, 10));
}

/** Mapa vacío de tipos por categoría, para ir acumulando. */
export function emptyTypeMap(): Record<OwnershipCategory, Map<string, string>> {
  return { Propios: new Map(), Leasing: new Map(), Contratados: new Map() };
}

/** Mapa id→nombre → opciones ordenadas por nombre. */
export function toSortedOptions(types: Map<string, string>): MaintenanceTypeOption[] {
  return Array.from(types, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}
