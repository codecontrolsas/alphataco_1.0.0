import 'server-only';

import { loadComplianceCountsForCompany } from '@/features/Dashboard/Documentacion/lib/document-compliance.server';
import {
  remainderAfterWeeks,
  seriesFromRows,
  weeklyBuckets,
  type ExpiringSeries,
} from '@/features/Dashboard/Documentacion/lib/expiring-buckets';
import {
  loadEmployeeExpiringRowsFor,
  loadVehicleExpiringRowsFor,
} from '@/features/Dashboard/Documentacion/lib/expiring-rows.server';
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
} from '@/features/Dashboard/Estadisticas/RecursosHumanos/lib/hr-data.server';
import { resolveTrendRange, trendRangeLabel } from '@/features/Dashboard/Estadisticas/RecursosHumanos/lib/trend-range';
import { percentLevel } from '@/features/Dashboard/lib/chart-thresholds';
import { percentageOrNull } from '@/features/Dashboard/lib/metric';
import { computeEquipmentIndicators } from '@/features/Dashboard/Principal/lib/equipment-indicators.server';
import { getOperationToday } from '@/features/Dashboard/Principal/lib/dashboard-dates';
import { availableUnits, buildFleetKpis } from '@/features/Dashboard/Principal/lib/indicators';
import { computeDiagramIndicators, computeEmployeeIndicators } from '@/features/Dashboard/Principal/lib/rrhh-indicators.server';
import {
  computeServicesDetailByClient,
  computeServicesSummary,
  countActiveEmployees,
  countActiveVehicles,
  countTodayServices,
} from '@/features/Dashboard/Principal/lib/services-data.server';
import { overdueDocumentSources, TONE_ORDER, type Source } from '@/features/Dashboard/Resumen/lib/attention-items';
import { daysUntil, parseValidity } from '@/features/Documentacion/shared/compliance/dates';
import type { TenantContext } from '@/shared/lib/tenant-context';
import { dailyReportTypeServiceLabels, genderLabels } from '@/shared/utils/mappers';
import moment from 'moment';
import type { SupportedWidgetId, WIDGET_DATA_SCHEMAS } from '../contracts/dashboards';
import { DOCUMENT_STATE_TONE, documentStatus } from '../documents/rows';
import type { Tone } from '../lib/labels';
import type { DashboardAccess } from './access';
import type { z } from 'zod';

/**
 * Datos de los widgets de los tableros para la API móvil. Cada widget reutiliza las MISMAS funciones de cálculo que la
 * web (las que reciben la empresa por parámetro; las acciones web son esas mismas funciones detrás de su guarda de
 * sesión), pero entrega JSON liviano en vez de componentes. Todo corre con el contexto de la petición en el ALS
 * (`runInTenantScope`) y los permisos ya se resolvieron antes: acá solo se calcula lo que el rol puede ver.
 *
 * Cargas compartidas entre widgets (la flota de hoy, las filas de vencimientos): una vez por pedido (`Env`), no una por
 * widget — dentro de una ruta no hay memo de React.
 */

export type WidgetData<Id extends SupportedWidgetId> = z.input<(typeof WIDGET_DATA_SCHEMAS)[Id]>;

export interface WidgetEnv {
  ctx: TenantContext;
  access: DashboardAccess;
  today: string;
  /** Memo por pedido: cada carga pesada se hace una sola vez aunque la pidan varios widgets. */
  memo: Map<string, Promise<unknown>>;
}

export function createWidgetEnv(ctx: TenantContext, access: DashboardAccess): WidgetEnv {
  return { ctx, access, today: getOperationToday(), memo: new Map() };
}

function once<T>(env: WidgetEnv, key: string, load: () => Promise<T>): Promise<T> {
  const found = env.memo.get(key);
  if (found) return found as Promise<T>;
  const promise = load();
  env.memo.set(key, promise);
  return promise;
}

const equipmentIndicators = (env: WidgetEnv) =>
  once(env, 'equipment-indicators', () => computeEquipmentIndicators(env.ctx.companyId, []));
const activeVehicles = (env: WidgetEnv) => once(env, 'active-vehicles', () => countActiveVehicles(env.ctx.companyId));
const fleetKpis = async (env: WidgetEnv) =>
  buildFleetKpis(await activeVehicles(env), await equipmentIndicators(env));

const employeeExpiringRows = (env: WidgetEnv) =>
  once(env, 'expiring-employees', () =>
    loadEmployeeExpiringRowsFor(env.ctx.companyId, env.access.documents.privateEmployees)
  );
const vehicleExpiringRows = (env: WidgetEnv) =>
  once(env, 'expiring-vehicles', () => loadVehicleExpiringRowsFor(env.ctx.companyId, env.access.documents.privateVehicles));

/** Series de vencimientos de las fuentes que el rol ve. */
async function expiringSeries(env: WidgetEnv): Promise<{ employees?: ExpiringSeries; vehicles?: ExpiringSeries }> {
  const [employees, vehicles] = await Promise.all([
    env.access.documents.employees
      ? employeeExpiringRows(env).then((rows) => seriesFromRows(rows, env.today))
      : undefined,
    env.access.documents.vehicles ? vehicleExpiringRows(env).then((rows) => seriesFromRows(rows, env.today)) : undefined,
  ]);
  return { ...(employees ? { employees } : {}), ...(vehicles ? { vehicles } : {}) };
}

/** La serie con el arreglo mutable que espera el contrato JSON. */
const plainSeries = (series: ExpiringSeries | undefined) =>
  series ? { overdue: series.overdue, byDay: [...series.byDay] } : undefined;

const addDays = (day: string, days: number) => moment.utc(day).add(days, 'day').format('YYYY-MM-DD');

/** `DD/MM/YYYY` (como las funciones `hr_get_*`) → `YYYY-MM-DD`. */
function dmyToIso(value: string | null | undefined): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value ?? '');
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

const orNull = (value: string | null | undefined) => (value && value.trim() ? value : null);

// ─── Widgets ──────────────────────────────────────────────────────────────────

const EXPIRING_DOCS_LIMIT = 20;
const CLIENTS_LIMIT = 20;
const TYPES_LIMIT = 12;
const ABSENCE_LIMIT = 50;

type Builders = { [Id in SupportedWidgetId]: (env: WidgetEnv) => Promise<WidgetData<Id>> };

const SERVICE_TYPE_LABEL = (raw: string) => (raw === 'sin_tipo' ? 'Sin tipo' : (dailyReportTypeServiceLabels[raw] ?? raw));

function expiringDocItem(
  row: { id: string; validity: Date | null; state: string; expiringSoon: boolean; document_types: { name: string } },
  resource: { id: string; identifier: string; name: string },
  today: string
) {
  const validity = parseValidity(row.validity);
  const status = documentStatus(row.state as Parameters<typeof documentStatus>[0], row.expiringSoon);
  const tone: Tone = status === 'expired' ? 'danger' : status === 'expiring' ? 'warn' : (DOCUMENT_STATE_TONE[row.state] ?? 'neutral');
  return {
    id: row.id,
    type: row.document_types.name,
    validity,
    daysLeft: validity ? daysUntil(validity, today) : null,
    state: { code: status, tone },
    resource,
  };
}

function expiringDocsWidget<
  Row extends { id: string; validity: Date | null; state: string; expiringSoon: boolean; document_types: { name: string } },
>(rows: readonly Row[], resourceOf: (row: Row) => { id: string; identifier: string; name: string }, today: string) {
  const sorted = [...rows].sort((a, b) => (a.validity?.getTime() ?? Infinity) - (b.validity?.getTime() ?? Infinity));
  const items = sorted.slice(0, EXPIRING_DOCS_LIMIT).map((row) => expiringDocItem(row, resourceOf(row), today));
  const overdue = rows.filter((row) => {
    const validity = parseValidity(row.validity);
    return validity !== null && daysUntil(validity, today) < 0;
  }).length;
  return { total: rows.length, overdue, items, truncated: rows.length > items.length };
}

const BUILDERS: Builders = {
  'kpi-employees': async (env) => ({ value: await countActiveEmployees(env.ctx.companyId) }),
  'kpi-active-vehicles': async (env) => ({ value: await activeVehicles(env) }),
  'kpi-operative-fleet': async (env) => {
    const kpis = await fleetKpis(env);
    return {
      value: kpis.fleetMinusRepair,
      activeVehicles: kpis.activeVehicles,
      outOfService: kpis.activeVehicles - kpis.fleetMinusRepair,
    };
  },
  'kpi-today-services': async (env) => ({
    date: env.today,
    value: await countTodayServices(env.ctx.companyId),
  }),
  'kpi-operativity': async (env) => {
    const kpis = await fleetKpis(env);
    return {
      percentage: kpis.operativityPercentage,
      level: percentLevel(kpis.operativityPercentage),
      operative: kpis.operativeVehicles,
      total: kpis.totalFleet,
    };
  },
  'services-today': async (env) => {
    const [summary, detail] = await Promise.all([
      computeServicesSummary(env.ctx.companyId),
      computeServicesDetailByClient(env.ctx.companyId),
    ]);
    return {
      date: env.today,
      total: summary.reduce((sum, item) => sum + item.service_count, 0),
      byType: summary.map((item) => ({
        type: SERVICE_TYPE_LABEL(item.type_service),
        count: item.service_count,
        percentage: item.percentage,
      })),
      byClient: detail.slice(0, CLIENTS_LIMIT).map((client) => ({
        client: client.client_name,
        total: client.total_count,
        monthly: client.mensual_count,
        additional: client.adicional_count,
        statuses: client.status_distribution,
      })),
      moreClients: Math.max(0, detail.length - CLIENTS_LIMIT),
    };
  },
  'hr-today': async (env) => {
    const [indicator, diagrams] = await Promise.all([
      computeEmployeeIndicators(env.ctx.companyId),
      computeDiagramIndicators(env.ctx.companyId),
    ]);
    return {
      date: env.today,
      withDiagram: indicator.employees_operativos,
      inOperation: indicator.employees_used,
      available: indicator.employees_available,
      cancelled: indicator.employees_cancelled,
      usage: indicator.indicator,
      diagrams: diagrams.map((diagram) => ({
        id: diagram.diagram_type_id,
        name: diagram.diagram_type_name,
        color: diagram.diagram_type_color,
        count: diagram.cantidad_empleados,
      })),
    };
  },
  'equipment-operation': async (env) => {
    const data = await equipmentIndicators(env);
    let active = 0;
    let inUse = 0;
    let cancelled = 0;
    let notAvailable = 0;
    let available = 0;
    for (const item of data) {
      active += item.available_units;
      inUse += item.used_units;
      cancelled += item.cancelled_units;
      notAvailable += item.not_available_units;
      available += availableUnits(item);
    }
    const fleet = active + notAvailable;
    return {
      date: env.today,
      active,
      inUse,
      cancelled,
      available,
      outOfService: notAvailable,
      fleet,
      operativity: percentageOrNull(active, fleet),
      byType: data.slice(0, TYPES_LIMIT).map((item) => ({
        type: item.type_name,
        available: availableUnits(item),
        outOfService: item.not_available_units,
        working: item.used_units,
        cancelled: item.cancelled_units,
      })),
    };
  },
  'document-compliance': async (env) => {
    const [employees, vehicles] = await Promise.all([
      env.access.documents.employees ? loadComplianceCountsForCompany('employees', env.ctx.companyId) : undefined,
      env.access.documents.vehicles ? loadComplianceCountsForCompany('vehicles', env.ctx.companyId) : undefined,
    ]);
    return { ...(employees ? { employees } : {}), ...(vehicles ? { vehicles } : {}) };
  },
  'expiring-weeks': async (env) => {
    const series = await expiringSeries(env);
    const sources = [series.employees, series.vehicles].filter((item): item is ExpiringSeries => item !== undefined);
    const employeeWeeks = series.employees ? weeklyBuckets(series.employees) : null;
    const vehicleWeeks = series.vehicles ? weeklyBuckets(series.vehicles) : null;
    const reference = employeeWeeks ?? vehicleWeeks ?? [];
    return {
      today: env.today,
      ...(series.employees ? { employees: plainSeries(series.employees) } : {}),
      ...(series.vehicles ? { vehicles: plainSeries(series.vehicles) } : {}),
      weeks: reference.map((week, index) => {
        const employees = employeeWeeks?.[index]?.count ?? 0;
        const vehicles = vehicleWeeks?.[index]?.count ?? 0;
        return {
          index: week.index,
          from: addDays(env.today, week.fromDay),
          to: addDays(env.today, week.toDay),
          count: employees + vehicles,
          employees,
          vehicles,
        };
      }),
      remainder: sources.reduce((sum, item) => sum + remainderAfterWeeks(item), 0),
      overdue: sources.reduce((sum, item) => sum + item.overdue, 0),
    };
  },
  'expiring-timeline': async (env) => {
    const series = await expiringSeries(env);
    return {
      today: env.today,
      ...(series.employees ? { employees: plainSeries(series.employees) } : {}),
      ...(series.vehicles ? { vehicles: plainSeries(series.vehicles) } : {}),
    };
  },
  'expiring-employee-docs': async (env) =>
    expiringDocsWidget(
      await employeeExpiringRows(env),
      (row) => ({
        id: row.employees.id,
        identifier: row.employees.file,
        name: `${row.employees.lastname} ${row.employees.firstname}`.trim(),
      }),
      env.today
    ),
  'expiring-vehicle-docs': async (env) =>
    expiringDocsWidget(
      await vehicleExpiringRows(env),
      (row) => ({
        id: row.vehicles.id,
        identifier: row.vehicles.domain ?? row.vehicles.intern_number ?? row.vehicles.serie ?? '',
        name: row.vehicles.type_vehicles_typeTotype?.name ?? 'Equipo',
      }),
      env.today
    ),
  'attention-inbox': async (env) => {
    const series = await expiringSeries(env);
    const sources: Source[] = overdueDocumentSources({
      employees: series.employees ? { status: 'ok', series: series.employees } : { status: 'forbidden' },
      vehicles: series.vehicles ? { status: 'ok', series: series.vehicles } : { status: 'forbidden' },
    });
    const available = sources.flatMap((source) => (source.status === 'ok' ? [source.item] : []));
    return {
      items: available
        .filter((item) => item.count > 0)
        .sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || b.count - a.count)
        .map(({ key, module, label, count, tone }) => ({ key, module, label, count, tone })),
      checked: available.length,
      failed: sources.filter((source) => source.status === 'error').length,
      partial: true as const,
    };
  },
  'hr-summary': async (env) => {
    const data = await loadAbsenteeismSummary(env.ctx.companyId);
    if (!data) return null;
    return {
      date: env.today,
      previousHeadcount: data.dotacionAnterior,
      hires: data.altas,
      terminations: data.bajas,
      headcount: data.dotacionActual,
      absent: data.totalAusentes,
      // Sin dotación no hay porcentaje: la función SQL devuelve 0 y eso leería como «sin ausentismo».
      absenteeism: data.dotacionActual > 0 ? data.porcentajeAusentismo : null,
    };
  },
  'hr-absenteeism-trend': async (env) => {
    // El gráfico de la web arranca en los últimos 7 días.
    const range = resolveTrendRange('7d');
    if (!range) return { range: { from: env.today, to: env.today, label: trendRangeLabel('7d') }, points: [] };
    const points = await loadAbsenteeismTrend(env.ctx.companyId, resolveSeriesRange(range.from, range.to));
    return {
      range: { ...range, label: trendRangeLabel('7d') },
      points: points.map((point) => ({ date: point.date, percentage: point.percentage })),
    };
  },
  'hr-absence-reasons': async (env) => {
    const data = await loadDepartmentAbsenceReasons(env.ctx.companyId);
    return {
      date: env.today,
      // Como la web: solo departamentos con algún ausente.
      departments: data
        .map((entry) => {
          const reasons = (entry.data ?? []).filter((reason) => (Number(reason.value) || 0) > 0);
          return {
            department: entry.department,
            total: reasons.reduce((sum, reason) => sum + Number(reason.value), 0),
            reasons: reasons.map((reason) => ({
              name: reason.name,
              count: Number(reason.value),
              color: orNull(reason.color),
            })),
          };
        })
        .filter((department) => department.total > 0),
    };
  },
  'hr-department-summary': async (env) => {
    const data = await loadDepartmentAbsenceSummary(env.ctx.companyId);
    return {
      date: env.today,
      // Sin el detalle por empleado (`data` de la función SQL): la app pide el detalle aparte.
      items: data.map((item) => ({
        sector: item.sector,
        headcount: item.dotacion,
        absent: item.ausentes,
        percentage: item.porcentaje,
      })),
    };
  },
  'hr-daily-absence': async (env) => {
    // Como la tabla web: del 1.º del mes en curso hasta hoy.
    const range = resolveSeriesRange(undefined, undefined);
    const data = await loadDailyAbsenceTimeseries(env.ctx.companyId, range);
    return {
      range: { ...range, label: moment.utc(range.from).locale('es').format('MMMM YYYY') },
      items: data.map((item) => ({
        date: item.fecha,
        headcount: item.dotacion,
        hires: item.altas,
        terminations: item.bajas,
        vacations: item.vacaciones,
        totalHeadcount: item.totalDotacion,
        absent: item.totalAusentes,
        percentage: item.porcentajeAusentismo,
      })),
    };
  },
  'hr-distribution': async (env) => {
    const [byPosition, byContract] = await Promise.all([
      loadEmployeesByGenderAndPosition(env.ctx.companyId),
      loadEmployeesByContractType(env.ctx.companyId),
    ]);
    return {
      byPosition: byPosition.map((item) => ({
        position: item.positionName,
        gender: item.gender,
        genderLabel: item.gender ? (genderLabels[item.gender] ?? item.gender) : null,
        count: item.count,
      })),
      byContract: byContract.map((item) => ({ contract: item.contractName, count: item.count })),
    };
  },
  'hr-headcount-trend': async (env) => {
    const range = resolveTrendRange('7d');
    if (!range) return { range: { from: env.today, to: env.today, label: trendRangeLabel('7d') }, points: [] };
    const data = await loadDailyAbsenceTimeseries(env.ctx.companyId, resolveSeriesRange(range.from, range.to));
    return {
      range: { ...range, label: trendRangeLabel('7d') },
      points: data.map((item) => ({
        date: item.fecha,
        headcount: item.totalDotacion,
        hires: item.altas,
        terminations: item.bajas,
      })),
    };
  },
  'hr-employee-absence': async (env) => {
    const result = await loadCurrentAbsentEmployees(env.ctx.companyId);
    const rows = result?.data ?? [];
    return {
      date: env.today,
      total: rows.length,
      items: rows.slice(0, ABSENCE_LIMIT).map((row) => ({
        employeeId: row.id,
        fileNumber: row.legajo,
        name: row.nombre,
        task: orNull(row.tarea),
        line: orNull(row.linea),
        shift: orNull(row.turno),
        reason: orNull(row.motivo),
        from: dmyToIso(row.desde),
        to: dmyToIso(row.hasta),
        daysOut: row.diasCaidos,
        notes: orNull(row.observaciones),
      })),
      truncated: rows.length > ABSENCE_LIMIT,
    };
  },
};

export async function buildWidgetData(id: SupportedWidgetId, env: WidgetEnv): Promise<unknown> {
  return BUILDERS[id](env);
}
