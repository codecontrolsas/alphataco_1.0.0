'use server';

import { requireDashboardView } from '@/features/Dashboard/lib/permissions.server';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getActiveCompanyId } from '@/shared/lib/tenant';

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
// El SQL va por `$queryRaw` con `Prisma.sql` (los argumentos se bindean); se reemplazó
// `$queryRawUnsafe`, que armaba la consulta como string suelto.
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

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida una fecha que llega del cliente antes de bindearla como `::date`.
 *
 * No es una defensa contra inyección (los argumentos ya van bindeados): sin esto, un
 * string cualquiera llega a Postgres y vuelve como error 500 de la base en vez de como
 * error de dominio. Mismo criterio que `ISO_DATE_RE` en `shared/lib/sql.ts`.
 */
function assertIsoDate(value: string | undefined, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (!ISO_DATE_RE.test(value)) throw new Error(`Fecha inválida en ${field}: se espera YYYY-MM-DD`);
  return value;
}

/** Tope del rango de las series diarias: cada día recorre a todos los empleados en la base. */
const MAX_RANGE_DAYS = 92;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Resuelve el rango de una serie diaria con los mismos defaults que las funciones SQL (del 1.º del
 * mes de hoy hasta hoy, en hora argentina) y lo valida: desde <= hasta y a lo sumo 92 días.
 */
function resolveSeriesRange(fromDate: string | undefined, toDate: string | undefined) {
  const today = argentinaDate();
  const from = assertIsoDate(fromDate, 'fromDate') ?? `${today.slice(0, 7)}-01`;
  const to = assertIsoDate(toDate, 'toDate') ?? today;
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) throw new Error('Fecha inválida: el día no existe en el calendario');
  if (fromMs > toMs) throw new Error('El rango es inválido: la fecha desde es posterior a la fecha hasta');
  if ((toMs - fromMs) / DAY_MS + 1 > MAX_RANGE_DAYS) {
    throw new Error(`El rango no puede superar ${MAX_RANGE_DAYS} días. Elegí un período más corto.`);
  }
  return { from, to };
}

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
    // «Hoy» es el día argentino: con `toISOString()` entre las 21 y las 24 h AR ya sería mañana en UTC.
    const today = argentinaDate();
    const from = assertIsoDate(fromDate, 'fromDate') ?? today;
    const to = assertIsoDate(toDate, 'toDate') ?? today;

    const result = await prisma.$queryRaw<[{ hr_get_absenteeism_summary: AbsenteeismSummaryResult }]>(
      Prisma.sql`SELECT hr_get_absenteeism_summary(${companyId}::uuid, ${from}::date, ${to}::date, false)`
    );

    return result[0]?.hr_get_absenteeism_summary ?? null;
  } catch (error) {
    logger.error('Error al obtener resumen de ausentismo', { data: { error } });
    throw error;
  }
}

export type AbsenteeismSummaryData = Awaited<ReturnType<typeof getAbsenteeismSummary>>;

/**
 * Obtiene la tendencia de ausentismo en el tiempo.
 * Llama al RPC `hr_get_absenteeism_trend`.
 */
export async function getAbsenteeismTrend(fromDate?: string, toDate?: string): Promise<AbsenteeismTrendItem[]> {
  await requireDashboardView('rrhh');
  const companyId = await getActiveCompanyId();
  logger.debug('Obteniendo tendencia de ausentismo', { data: { fromDate, toDate } });

  // Se valida fuera del try: el error de rango es de dominio y no merece log de error de base.
  const { from, to } = resolveSeriesRange(fromDate, toDate);

  try {
    const result = await prisma.$queryRaw<[{ hr_get_absenteeism_trend: AbsenteeismTrendItem[] }]>(
      Prisma.sql`SELECT hr_get_absenteeism_trend(${companyId}::uuid, ${from}::date, ${to}::date, false)`
    );

    return result[0]?.hr_get_absenteeism_trend ?? [];
  } catch (error) {
    // Antes devolvía [] y el gráfico mostraba "0 %" como si no hubiera ausentismo.
    logger.error('Error al obtener tendencia de ausentismo', { data: { error } });
    throw error;
  }
}

export type AbsenteeismTrendData = Awaited<ReturnType<typeof getAbsenteeismTrend>>;

/**
 * Obtiene los empleados ausentes en una fecha determinada.
 * Llama al RPC `hr_get_current_absent_employees`.
 */
export async function getCurrentAbsentEmployees(date?: string): Promise<CurrentAbsentEmployeesResult | null> {
  await requireDashboardView('rrhh');
  const companyId = await getActiveCompanyId();
  logger.debug('Obteniendo empleados ausentes actuales', { data: { date } });

  try {
    const result = await prisma.$queryRaw<[{ hr_get_current_absent_employees: CurrentAbsentEmployeesResult }]>(
      Prisma.sql`SELECT hr_get_current_absent_employees(${companyId}::uuid, ${assertIsoDate(date, 'date')}::date, false)`
    );

    return result[0]?.hr_get_current_absent_employees ?? null;
  } catch (error) {
    logger.error('Error al obtener empleados ausentes actuales', { data: { error } });
    throw error;
  }
}

export type CurrentAbsentEmployeesData = Awaited<ReturnType<typeof getCurrentAbsentEmployees>>;

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

  const { from, to } = resolveSeriesRange(fromDate, toDate);

  try {
    const result = await prisma.$queryRaw<[{ hr_get_daily_absence_timeseries: DailyAbsenceTimeseriesItem[] }]>(
      Prisma.sql`SELECT hr_get_daily_absence_timeseries(${companyId}::uuid, ${from}::date, ${to}::date, false)`
    );

    return result[0]?.hr_get_daily_absence_timeseries ?? [];
  } catch (error) {
    logger.error('Error al obtener serie temporal diaria de ausentismo', { data: { error } });
    throw error;
  }
}

export type DailyAbsenceTimeseriesData = Awaited<ReturnType<typeof getDailyAbsenceTimeseries>>;

/**
 * Obtiene las razones de ausencia agrupadas por departamento para una fecha.
 * Llama al RPC `hr_get_department_absence_reasons`.
 */
export async function getDepartmentAbsenceReasons(date?: string): Promise<DepartmentAbsenceReasonEntry[]> {
  await requireDashboardView('rrhh');
  const companyId = await getActiveCompanyId();
  logger.debug('Obteniendo razones de ausencia por departamento', { data: { date } });

  try {
    const result = await prisma.$queryRaw<[{ hr_get_department_absence_reasons: DepartmentAbsenceReasonEntry[] }]>(
      Prisma.sql`SELECT hr_get_department_absence_reasons(${companyId}::uuid, ${assertIsoDate(date, 'date')}::date, false)`
    );

    return result[0]?.hr_get_department_absence_reasons ?? [];
  } catch (error) {
    logger.error('Error al obtener razones de ausencia por departamento', { data: { error } });
    throw error;
  }
}

export type DepartmentAbsenceReasonsData = Awaited<ReturnType<typeof getDepartmentAbsenceReasons>>;

/**
 * Obtiene el resumen de ausentismo agrupado por departamento para una fecha.
 * Llama al RPC `hr_get_department_absence_summary`.
 */
export async function getDepartmentAbsenceSummary(date?: string): Promise<DepartmentAbsenceSummaryItem[]> {
  await requireDashboardView('rrhh');
  const companyId = await getActiveCompanyId();
  logger.debug('Obteniendo resumen de ausentismo por departamento', { data: { date } });

  try {
    const result = await prisma.$queryRaw<[{ hr_get_department_absence_summary: DepartmentAbsenceSummaryItem[] }]>(
      Prisma.sql`SELECT hr_get_department_absence_summary(${companyId}::uuid, ${assertIsoDate(date, 'date')}::date, false)`
    );

    return result[0]?.hr_get_department_absence_summary ?? [];
  } catch (error) {
    logger.error('Error al obtener resumen de ausentismo por departamento', { data: { error } });
    throw error;
  }
}

export type DepartmentAbsenceSummaryData = Awaited<ReturnType<typeof getDepartmentAbsenceSummary>>;

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
    const groups = await prisma.employees.groupBy({
      by: ['company_position', 'gender'],
      where: withCompany({ is_active: true }, companyId),
      _count: { _all: true },
    });

    const positionIds = Array.from(
      new Set(groups.map((group) => group.company_position).filter((id): id is string => id !== null))
    );
    const positions = positionIds.length
      ? await prisma.company_positions.findMany({
          where: { id: { in: positionIds } },
          select: { id: true, name: true },
        })
      : [];
    const positionNames = new Map(positions.map((position) => [position.id, position.name]));

    return groups.map((group) => ({
      positionName: (group.company_position && positionNames.get(group.company_position)) || null,
      gender: group.gender,
      count: group._count._all,
    }));
  } catch (error) {
    logger.error('Error al obtener empleados por género y posición', { data: { error } });
    throw error;
  }
}

export type EmployeesByGenderAndPositionData = Awaited<ReturnType<typeof getEmployeesByGenderAndPosition>>;
export type EmployeesByGenderAndPositionItem = EmployeesByGenderAndPositionData[number];

/**
 * Obtiene la distribución de empleados activos por tipo de contrato, contada en la base.
 * Solo incluye empleados que tienen tipo de contrato asignado.
 */
export async function getEmployeesByContractType() {
  await requireDashboardView('rrhh');
  const companyId = await getActiveCompanyId();
  logger.debug('Obteniendo empleados por tipo de contrato');

  try {
    const groups = await prisma.employees.groupBy({
      by: ['type_of_contract'],
      where: withCompany({ is_active: true, type_of_contract: { not: null } }, companyId),
      _count: { _all: true },
    });

    const contractIds = groups.map((group) => group.type_of_contract).filter((id): id is string => id !== null);
    const contracts = contractIds.length
      ? await prisma.types_of_contract.findMany({
          where: { id: { in: contractIds } },
          select: { id: true, name: true },
        })
      : [];
    const contractNames = new Map(contracts.map((contract) => [contract.id, contract.name]));

    return groups.map((group) => ({
      contractName: (group.type_of_contract && contractNames.get(group.type_of_contract)) || null,
      count: group._count._all,
    }));
  } catch (error) {
    logger.error('Error al obtener empleados por tipo de contrato', { data: { error } });
    throw error;
  }
}

export type EmployeesByContractTypeData = Awaited<ReturnType<typeof getEmployeesByContractType>>;
export type EmployeesByContractTypeItem = EmployeesByContractTypeData[number];
