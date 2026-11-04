import 'server-only';

import type {
  AbsenteeismSummaryResult,
  AbsenteeismTrendItem,
  CurrentAbsentEmployeesResult,
  DailyAbsenceTimeseriesItem,
  DepartmentAbsenceReasonEntry,
  DepartmentAbsenceSummaryItem,
} from '@/features/Dashboard/Estadisticas/RecursosHumanos/actions.server';
import { Prisma } from '@/generated/prisma/client';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';

/**
 * Datos de RR.HH. del tablero para una empresa: las funciones SQL `hr_get_*` y las distribuciones, sin la sesión. Las
 * acciones web (`actions.server.ts`) validan el permiso y la empresa activa y llaman acá; la API móvil, con el contexto de
 * su token. Perímetro: la empresa llega SIEMPRE del servidor, nunca del cliente. Corren con el cliente contextual (el
 * llamador fija el contexto de la empresa).
 *
 * El SQL va por `$queryRaw` con `Prisma.sql` (los argumentos se bindean).
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida una fecha antes de bindearla como `::date`.
 *
 * No es una defensa contra inyección (los argumentos ya van bindeados): sin esto, un string cualquiera llega a Postgres
 * y vuelve como error 500 de la base en vez de como error de dominio. Mismo criterio que `ISO_DATE_RE` en `shared/lib/sql.ts`.
 */
export function assertIsoDate(value: string | undefined, field: string): string | null {
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
export function resolveSeriesRange(fromDate: string | undefined, toDate: string | undefined) {
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

/** Resumen general de ausentismo (RPC `hr_get_absenteeism_summary`). Sin fechas, el día de hoy argentino. */
export async function loadAbsenteeismSummary(
  companyId: string,
  fromDate?: string,
  toDate?: string
): Promise<AbsenteeismSummaryResult | null> {
  // «Hoy» es el día argentino: con `toISOString()` entre las 21 y las 24 h AR ya sería mañana en UTC.
  const today = argentinaDate();
  const from = assertIsoDate(fromDate, 'fromDate') ?? today;
  const to = assertIsoDate(toDate, 'toDate') ?? today;

  const result = await prisma.$queryRaw<[{ hr_get_absenteeism_summary: AbsenteeismSummaryResult }]>(
    Prisma.sql`SELECT hr_get_absenteeism_summary(${companyId}::uuid, ${from}::date, ${to}::date, false)`
  );
  return result[0]?.hr_get_absenteeism_summary ?? null;
}

/** Tendencia de ausentismo (RPC `hr_get_absenteeism_trend`) en un rango ya resuelto con `resolveSeriesRange`. */
export async function loadAbsenteeismTrend(
  companyId: string,
  range: { from: string; to: string }
): Promise<AbsenteeismTrendItem[]> {
  const result = await prisma.$queryRaw<[{ hr_get_absenteeism_trend: AbsenteeismTrendItem[] }]>(
    Prisma.sql`SELECT hr_get_absenteeism_trend(${companyId}::uuid, ${range.from}::date, ${range.to}::date, false)`
  );
  return result[0]?.hr_get_absenteeism_trend ?? [];
}

/** Empleados ausentes en una fecha (RPC `hr_get_current_absent_employees`). */
export async function loadCurrentAbsentEmployees(
  companyId: string,
  date?: string
): Promise<CurrentAbsentEmployeesResult | null> {
  const result = await prisma.$queryRaw<[{ hr_get_current_absent_employees: CurrentAbsentEmployeesResult }]>(
    Prisma.sql`SELECT hr_get_current_absent_employees(${companyId}::uuid, ${assertIsoDate(date, 'date')}::date, false)`
  );
  return result[0]?.hr_get_current_absent_employees ?? null;
}

/** Serie diaria de ausentismo (RPC `hr_get_daily_absence_timeseries`) en un rango ya resuelto con `resolveSeriesRange`. */
export async function loadDailyAbsenceTimeseries(
  companyId: string,
  range: { from: string; to: string }
): Promise<DailyAbsenceTimeseriesItem[]> {
  const result = await prisma.$queryRaw<[{ hr_get_daily_absence_timeseries: DailyAbsenceTimeseriesItem[] }]>(
    Prisma.sql`SELECT hr_get_daily_absence_timeseries(${companyId}::uuid, ${range.from}::date, ${range.to}::date, false)`
  );
  return result[0]?.hr_get_daily_absence_timeseries ?? [];
}

/** Motivos de ausencia por departamento para una fecha (RPC `hr_get_department_absence_reasons`). */
export async function loadDepartmentAbsenceReasons(
  companyId: string,
  date?: string
): Promise<DepartmentAbsenceReasonEntry[]> {
  const result = await prisma.$queryRaw<[{ hr_get_department_absence_reasons: DepartmentAbsenceReasonEntry[] }]>(
    Prisma.sql`SELECT hr_get_department_absence_reasons(${companyId}::uuid, ${assertIsoDate(date, 'date')}::date, false)`
  );
  return result[0]?.hr_get_department_absence_reasons ?? [];
}

/** Resumen de ausentismo por departamento para una fecha (RPC `hr_get_department_absence_summary`). */
export async function loadDepartmentAbsenceSummary(
  companyId: string,
  date?: string
): Promise<DepartmentAbsenceSummaryItem[]> {
  const result = await prisma.$queryRaw<[{ hr_get_department_absence_summary: DepartmentAbsenceSummaryItem[] }]>(
    Prisma.sql`SELECT hr_get_department_absence_summary(${companyId}::uuid, ${assertIsoDate(date, 'date')}::date, false)`
  );
  return result[0]?.hr_get_department_absence_summary ?? [];
}

/** Distribución de empleados activos por puesto y género, ya contada en la base. */
export async function loadEmployeesByGenderAndPosition(companyId: string) {
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
}

/** Distribución de empleados activos por tipo de contrato; solo incluye empleados con tipo de contrato asignado. */
export async function loadEmployeesByContractType(companyId: string) {
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
}
