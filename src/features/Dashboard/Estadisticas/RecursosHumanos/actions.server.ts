'use server';

import { requireDashboardView } from '@/features/Dashboard/lib/permissions.server';
import { Logger } from '@/lib/logger';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import {
  loadAbsenteeismSummary,
  loadAbsenteeismTrend,
  loadCurrentAbsentEmployees,
  loadDailyAbsenceTimeseries,
  loadDepartmentAbsenceReasons,
  loadDepartmentAbsenceSummary,
  loadEmployeesByContractType,
  loadEmployeesByGenderAndPosition,
  resolveSeriesRange,
} from './lib/hr-data.server';

const logger = new Logger('features/Dashboard/RRHH');

// ─── Interfaces de tipos de retorno de RPCs ────────────────────────────────

export interface AbsenteeismSummaryResult {
  dotacionAnterior: number;
  altas: number;
  bajas: number;
  dotacionActual: number;
  totalAusentes: number;
  porcentajeAusentismo: number;
}

export interface AbsenteeismTrendItem {
  date: string;
  percentage: number;
}

export interface EmployeeAbsence {
  id: string;
  legajo: string;
  nombre: string;
  tarea: string;
  linea: string;
  turno: string;
  motivo: string;
  desde: string;
  hasta: string;
  diasCaidos: number;
  observaciones: string;
}

export interface AbsentEmployeesDetalles {
  ausentes_info: EmployeeAbsence[];
  bajas_info: EmployeeAbsence[];
  altas_info: EmployeeAbsence[];
}

export interface CurrentAbsentEmployeesResult {
  data: EmployeeAbsence[];
  detalles: AbsentEmployeesDetalles;
}

export interface DailyAbsenceTimeseriesItem {
  fecha: string;
  dotacion: number;
  altas: number;
  bajas: number;
  vacaciones: number;
  totalDotacion: number;
  totalAusentes: number;
  porcentajeAusentismo: number;
}

export interface DepartmentAbsenceReasonItem {
  name: string;
  value: number;
  color: string;
}

export interface DepartmentAbsenceReasonEntry {
  department: string;
  data: DepartmentAbsenceReasonItem[];
}

export interface DepartmentAbsenceSummaryItem {
  sector: string;
  dotacion: number;
  ausentes: number;
  porcentaje: number;
  data: EmployeeAbsence[];
}

// ─── Funciones SQL del dominio de RRHH ────────────────────────────────────
//
// Perímetro: NINGUNA de estas actions recibe ya el `companyId` del caller — lo deriva de
// la sesión con `getActiveCompanyId()`. Antes la empresa era un parámetro del cliente, y
// estas funciones devuelven el padrón completo con legajo, nombre, sector y motivo de
// ausencia: con el uuid de otra empresa salía su nómina entera.
//
// Las consultas viven en `lib/hr-data.server.ts` (reciben la empresa por parámetro y NO son acciones: un archivo
// `'use server'` que exportara funciones con `companyId` las volvería públicas); la API móvil usa las mismas.
//
// TODO (P2, seguimiento): estas 6 funciones SQL (`hr_get_absenteeism_summary`,
// `hr_get_absenteeism_trend`, `hr_get_current_absent_employees`,
// `hr_get_daily_absence_timeseries`, `hr_get_department_absence_reasons`,
// `hr_get_department_absence_summary` — definidas en `prisma/sql/diagrams.sql:366-1162`)
// deberían pasar por `callFunction`/`callScalar` de `src/shared/lib/sql.ts`, como el resto
// del sistema. Lo concreto que se pierde hoy: `callFunction` valida las fechas con
// `ISO_DATE_RE` y arma el cast `::date` él mismo. Acá eso se cubre a mano con
// `assertIsoDate`; lo que falta es la validación Zod del JSON de vuelta, que es el otro
// beneficio del helper.

/**
 * Obtiene el resumen general de ausentismo para una empresa y rango de fechas.
 * Llama al RPC `hr_get_absenteeism_summary`.
 */
export async function getAbsenteeismSummary(
  fromDate?: string,
  toDate?: string
): Promise<AbsenteeismSummaryResult | null> {
  await requireDashboardView('rrhh');
  const companyId = await getActiveCompanyId();
  logger.debug('Obteniendo resumen de ausentismo', { data: { fromDate, toDate } });

  try {
    return await loadAbsenteeismSummary(companyId, fromDate, toDate);
  } catch (error) {
    logger.error('Error al obtener resumen de ausentismo', { data: { error } });
    throw error;
  }
}

/**
 * Obtiene la tendencia de ausentismo en el tiempo.
 * Llama al RPC `hr_get_absenteeism_trend`.
 */
export async function getAbsenteeismTrend(fromDate?: string, toDate?: string): Promise<AbsenteeismTrendItem[]> {
  await requireDashboardView('rrhh');
  const companyId = await getActiveCompanyId();
  logger.debug('Obteniendo tendencia de ausentismo', { data: { fromDate, toDate } });

  // Se valida fuera del try: el error de rango es de dominio y no merece log de error de base.
  const range = resolveSeriesRange(fromDate, toDate);

  try {
    return await loadAbsenteeismTrend(companyId, range);
  } catch (error) {
    // Antes devolvía [] y el gráfico mostraba "0 %" como si no hubiera ausentismo.
    logger.error('Error al obtener tendencia de ausentismo', { data: { error } });
    throw error;
  }
}

/**
 * Obtiene los empleados ausentes en una fecha determinada.
 * Llama al RPC `hr_get_current_absent_employees`.
 */
export async function getCurrentAbsentEmployees(date?: string): Promise<CurrentAbsentEmployeesResult | null> {
  await requireDashboardView('rrhh');
  const companyId = await getActiveCompanyId();
  logger.debug('Obteniendo empleados ausentes actuales', { data: { date } });

  try {
    return await loadCurrentAbsentEmployees(companyId, date);
  } catch (error) {
    logger.error('Error al obtener empleados ausentes actuales', { data: { error } });
    throw error;
  }
}

/**
 * Obtiene la serie temporal diaria de ausentismo.
 * Llama al RPC `hr_get_daily_absence_timeseries`.
 */
export async function getDailyAbsenceTimeseries(
  fromDate?: string,
  toDate?: string
): Promise<DailyAbsenceTimeseriesItem[]> {
  await requireDashboardView('rrhh');
  const companyId = await getActiveCompanyId();
  logger.debug('Obteniendo serie temporal diaria de ausentismo', { data: { fromDate, toDate } });

  const range = resolveSeriesRange(fromDate, toDate);

  try {
    return await loadDailyAbsenceTimeseries(companyId, range);
  } catch (error) {
    logger.error('Error al obtener serie temporal diaria de ausentismo', { data: { error } });
    throw error;
  }
}

/**
 * Obtiene las razones de ausencia agrupadas por departamento para una fecha.
 * Llama al RPC `hr_get_department_absence_reasons`.
 */
export async function getDepartmentAbsenceReasons(date?: string): Promise<DepartmentAbsenceReasonEntry[]> {
  await requireDashboardView('rrhh');
  const companyId = await getActiveCompanyId();
  logger.debug('Obteniendo razones de ausencia por departamento', { data: { date } });

  try {
    return await loadDepartmentAbsenceReasons(companyId, date);
  } catch (error) {
    logger.error('Error al obtener razones de ausencia por departamento', { data: { error } });
    throw error;
  }
}

/**
 * Obtiene el resumen de ausentismo agrupado por departamento para una fecha.
 * Llama al RPC `hr_get_department_absence_summary`.
 */
export async function getDepartmentAbsenceSummary(date?: string): Promise<DepartmentAbsenceSummaryItem[]> {
  await requireDashboardView('rrhh');
  const companyId = await getActiveCompanyId();
  logger.debug('Obteniendo resumen de ausentismo por departamento', { data: { date } });

  try {
    return await loadDepartmentAbsenceSummary(companyId, date);
  } catch (error) {
    logger.error('Error al obtener resumen de ausentismo por departamento', { data: { error } });
    throw error;
  }
}

// ─── Funciones nativas de Prisma ──────────────────────────────────────────

/**
 * Obtiene la distribución de empleados activos por puesto y género, ya contada en la base
 * (antes se traía a todos los empleados a Node para contarlos).
 */
export async function getEmployeesByGenderAndPosition() {
  await requireDashboardView('rrhh');
  const companyId = await getActiveCompanyId();
  logger.debug('Obteniendo empleados por género y posición');

  try {
    return await loadEmployeesByGenderAndPosition(companyId);
  } catch (error) {
    logger.error('Error al obtener empleados por género y posición', { data: { error } });
    throw error;
  }
}

export type EmployeesByGenderAndPositionData = Awaited<ReturnType<typeof getEmployeesByGenderAndPosition>>;

/**
 * Obtiene la distribución de empleados activos por tipo de contrato, contada en la base.
 * Solo incluye empleados que tienen tipo de contrato asignado.
 */
export async function getEmployeesByContractType() {
  await requireDashboardView('rrhh');
  const companyId = await getActiveCompanyId();
  logger.debug('Obteniendo empleados por tipo de contrato');

  try {
    return await loadEmployeesByContractType(companyId);
  } catch (error) {
    logger.error('Error al obtener empleados por tipo de contrato', { data: { error } });
    throw error;
  }
}

export type EmployeesByContractTypeData = Awaited<ReturnType<typeof getEmployeesByContractType>>;
