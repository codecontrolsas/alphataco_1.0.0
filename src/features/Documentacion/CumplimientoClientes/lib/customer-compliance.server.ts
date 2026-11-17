import 'server-only';

import { arToday } from '@/features/Documentacion/shared/compliance/dates';
import {
  loadComplianceDataset,
  type ComplianceDataset,
} from '@/features/Documentacion/shared/compliance/server/dataset.server';
import { canViewServer } from '@/features/Permissions/actions/permissions.server';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/lib/prisma';
import { employeeLabel, vehicleLabel } from '@/shared/lib/resource-labels';
import { cache } from 'react';
import {
  FIT_STATUS_RANK,
  evaluateCustomerFit,
  toCell,
  type CustomerFit,
  type FitCell,
  type FitResourceKind,
  type FitWindow,
} from './customer-fit';

/** Lo que leen los cargadores. Todo corre dentro de UNA transacción de lectura (`readTx`). */
type Db = Prisma.TransactionClient;

/**
 * Una sola transacción (una conexión) para todo el cálculo: cada operación suelta del cliente contextual abre la suya, y
 * las decenas de consultas de una evaluación en paralelo agotaban el pool y tumbaban los demás widgets del tablero.
 */
function readTx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  return prisma.$transaction((tx) => fn(tx), { maxWait: 15_000, timeout: 60_000 });
}

/** Período máximo que se puede simular (las novedades del diagrama se leen día por día). */
export const MAX_WINDOW_DAYS = 92;

/** Qué tipos de recurso puede ver el usuario: los mismos permisos que las listas de documentos. */
export const getVisibleFitKinds = cache(async (): Promise<FitResourceKind[]> => {
  const [employees, equipment] = await Promise.all([
    canViewServer('documentacion', 'documentos-de-empleados'),
    canViewServer('documentacion', 'documentos-de-equipos'),
  ]);
  return [...(employees ? (['Persona'] as const) : []), ...(equipment ? (['Equipos'] as const) : [])];
});

export function todayWindow(now: Date = new Date()): FitWindow {
  const today = arToday(now);
  return { from: today, to: today, period: today.slice(0, 7) };
}

/** Ventana `[from, to]` validada (fechas ISO, orden y largo máximo). `null` si no es válida. */
export function buildWindow(from: string, to: string): FitWindow | null {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(from) || !iso.test(to) || to < from) return null;
  const days = (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000;
  if (Number.isNaN(days) || days > MAX_WINDOW_DAYS) return null;
  return { from, to, period: from.slice(0, 7) };
}

// ============================================
// DATOS DE PRESENTACIÓN
// ============================================

export interface FitResourceInfo {
  id: string;
  kind: FitResourceKind;
  label: string;
  /** Puesto (personas) o tipo de equipo. */
  role: string | null;
  roleId: string | null;
  /** Condición del equipo (`operativo`, `no operativo`...). Solo equipos. */
  condition: string | null;
}

async function loadEmployeesInfo(db: Db, companyId: string, ids?: readonly string[]): Promise<FitResourceInfo[]> {
  const rows = await db.employees.findMany({
    where: { company_id: companyId, is_active: true, ...(ids ? { id: { in: [...ids] } } : {}) },
    select: {
      id: true,
      file: true,
      lastname: true,
      firstname: true,
      company_position: true,
      company_positions: { select: { name: true } },
    },
    orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
  });
  return rows.map((row) => ({
    id: row.id,
    kind: 'Persona',
    label: employeeLabel(row),
    role: row.company_positions?.name ?? null,
    roleId: row.company_position,
    condition: null,
  }));
}

/** `condition` se lee como texto: el cliente de Prisma devuelve el nombre del enum y no el valor guardado. */
async function loadVehiclesInfo(db: Db, companyId: string, ids?: readonly string[]): Promise<FitResourceInfo[]> {
  const rows = await db.vehicles.findMany({
    where: { company_id: companyId, is_active: true, ...(ids ? { id: { in: [...ids] } } : {}) },
    select: {
      id: true,
      intern_number: true,
      domain: true,
      serie: true,
      type: true,
      condition: true,
      type_vehicles_typeTotype: { select: { name: true } },
    },
    orderBy: [{ intern_number: 'asc' }],
  });
  return rows.map((row) => ({
    id: row.id,
    kind: 'Equipos',
    label: vehicleLabel(row) || row.serie || 'Equipo sin identificar',
    role: row.type_vehicles_typeTotype?.name ?? null,
    roleId: row.type,
    condition: row.condition ? row.condition.replace(/_/g, ' ') : null,
  }));
}

function loadResourcesInfo(db: Db, kind: FitResourceKind, companyId: string, ids?: readonly string[]) {
  return kind === 'Persona' ? loadEmployeesInfo(db, companyId, ids) : loadVehiclesInfo(db, companyId, ids);
}

async function loadTypeNames(db: Db, companyId: string): Promise<Record<string, string>> {
  const rows = await db.document_types.findMany({
    where: { company_id: companyId, applies: { in: ['Persona', 'Equipos'] } },
    select: { id: true, name: true },
  });
  return Object.fromEntries(rows.map((row) => [row.id, row.name]));
}

async function loadActiveCustomers(db: Db, companyId: string) {
  return db.customers.findMany({
    where: { company_id: companyId, is_active: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

/**
 * Días no laborales (diagrama con una novedad que no trabaja: franco, licencia, vacaciones...) de las personas en la
 * ventana. Una consulta para todo el período.
 */
async function loadNonWorkingDays(
  db: Db,
  companyId: string,
  employeeIds: readonly string[],
  window: FitWindow
): Promise<Map<string, { day: string; name: string }[]>> {
  const result = new Map<string, { day: string; name: string }[]>();
  if (employeeIds.length === 0) return result;
  const rows = await db.$queryRaw<Array<{ employee_id: string; day: string; name: string | null }>>`
    SELECT ed.employee_id::text AS employee_id,
           to_char(make_date(ed.year::int, ed.month::int, ed.day::int), 'YYYY-MM-DD') AS day,
           dt.name
    FROM employees_diagram ed
    JOIN diagram_type dt ON dt.id = ed.diagram_type
    WHERE ed.company_id = ${companyId}::uuid
      AND ed.employee_id = ANY(${[...employeeIds]}::uuid[])
      AND COALESCE(dt.work_active, false) = false
      AND make_date(ed.year::int, ed.month::int, ed.day::int) BETWEEN ${window.from}::date AND ${window.to}::date
    ORDER BY 2`;
  for (const row of rows) {
    const list = result.get(row.employee_id) ?? [];
    list.push({ day: row.day, name: row.name ?? 'Día no laboral' });
    result.set(row.employee_id, list);
  }
  return result;
}

// ============================================
// EVALUACIÓN
// ============================================

interface KindContext {
  dataset: ComplianceDataset;
  info: FitResourceInfo[];
  resourceById: Map<string, ComplianceDataset['resources'][number]>;
}

async function loadKindContext(
  db: Db,
  kind: FitResourceKind,
  companyId: string,
  ids?: readonly string[]
): Promise<KindContext> {
  // En serie: dentro de una transacción todo va por la misma conexión.
  const dataset = await loadComplianceDataset(db, { companyId, kind, resourceIds: ids });
  const info = await loadResourcesInfo(db, kind, companyId, ids);
  return { dataset, info, resourceById: new Map(dataset.resources.map((r) => [r.id, r])) };
}

function fitFor(ctx: KindContext, resourceId: string, customerId: string, window: FitWindow): CustomerFit | null {
  const resource = ctx.resourceById.get(resourceId);
  if (!resource) return null;
  return evaluateCustomerFit(
    resource,
    customerId,
    ctx.dataset.types,
    ctx.dataset.docsByResource.get(resourceId) ?? [],
    window
  );
}

/** Las afectaciones se leen de la pivote: el dataset solo carga la pivote si algún tipo la usa como condición. */
async function loadAssignments(db: Db, kind: FitResourceKind, ids: readonly string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (ids.length === 0) return map;
  const push = (resourceId: string | null, customerId: string | null) => {
    if (!resourceId || !customerId) return;
    const list = map.get(resourceId) ?? [];
    list.push(customerId);
    map.set(resourceId, list);
  };
  if (kind === 'Persona') {
    const rows = await db.contractor_employee.findMany({
      where: { employee_id: { in: [...ids] }, customers: { is_active: true } },
      select: { employee_id: true, contractor_id: true },
    });
    for (const row of rows) push(row.employee_id, row.contractor_id);
  } else {
    const rows = await db.contractor_equipment.findMany({
      where: { equipment_id: { in: [...ids] }, customers: { is_active: true } },
      select: { equipment_id: true, contractor_id: true },
    });
    for (const row of rows) push(row.equipment_id, row.contractor_id);
  }
  return map;
}

/** Todo lo que se lee de un tipo de recurso. Se carga dentro de la transacción y se evalúa fuera (libera la conexión). */
interface KindData extends KindContext {
  kind: FitResourceKind;
  assignments: Map<string, string[]>;
  offDays: Map<string, { day: string; name: string }[]>;
}

async function loadKindData(
  db: Db,
  kind: FitResourceKind,
  companyId: string,
  options: { window?: FitWindow; ids?: readonly string[] } = {}
): Promise<KindData> {
  const ctx = await loadKindContext(db, kind, companyId, options.ids);
  const ids = ctx.info.map((i) => i.id);
  const assignments = await loadAssignments(db, kind, ids);
  const offDays =
    kind === 'Persona' && options.window ? await loadNonWorkingDays(db, companyId, ids, options.window) : new Map();
  return { ...ctx, kind, assignments, offDays };
}

// ============================================
// MATRIZ RECURSOS × CLIENTES (hoy)
// ============================================

export interface MatrixRow {
  id: string;
  kind: FitResourceKind;
  label: string;
  role: string | null;
  /** Celda por cliente afectado. Los clientes a los que no está afectado no tienen celda. */
  cells: Record<string, FitCell>;
}

/** Hoy: una fila por persona o equipo afectado a algún cliente (los que no están afectados solo se cuentan). */
export async function loadCustomerMatrix(companyId: string, kinds: readonly FitResourceKind[]) {
  const window = todayWindow();
  const { customers, typeNames, data } = await readTx(async (db) => ({
    customers: await loadActiveCustomers(db, companyId),
    typeNames: await loadTypeNames(db, companyId),
    data: await loadKindsSerially(kinds, (kind) => loadKindData(db, kind, companyId)),
  }));

  const rows: MatrixRow[] = [];
  const unassigned: Record<FitResourceKind, number> = { Persona: 0, Equipos: 0 };
  for (const d of data) {
    for (const info of d.info) {
      const customerIds = d.assignments.get(info.id) ?? [];
      if (customerIds.length === 0) {
        unassigned[d.kind] += 1;
        continue;
      }
      const cells: Record<string, FitCell> = {};
      for (const customerId of customerIds) {
        const fit = fitFor(d, info.id, customerId, window);
        if (fit) cells[customerId] = toCell(fit, info.condition);
      }
      rows.push({ id: info.id, kind: d.kind, label: info.label, role: info.role, cells });
    }
  }

  return { today: window.from, customers, typeNames, rows, unassigned };
}

export type CustomerMatrix = Awaited<ReturnType<typeof loadCustomerMatrix>>;

/** En serie: dentro de una transacción todo va por la misma conexión. */
async function loadKindsSerially<T>(kinds: readonly FitResourceKind[], load: (kind: FitResourceKind) => Promise<T>) {
  const result: T[] = [];
  for (const kind of kinds) result.push(await load(kind));
  return result;
}

// ============================================
// DISPONIBILIDAD POR CLIENTE (widget del tablero)
// ============================================

export interface AvailabilityCounts {
  ok: number;
  expiring: number;
  blocked: number;
  /** Personas aptas que hoy tienen franco, licencia u otra novedad que no trabaja. */
  offToday: number;
}

export interface CustomerAvailability {
  id: string;
  name: string;
  people: AvailabilityCounts | null;
  equipment: AvailabilityCounts | null;
}

const emptyCounts = (): AvailabilityCounts => ({ ok: 0, expiring: 0, blocked: 0, offToday: 0 });

/** Por cliente: cuántas personas y equipos afectados cumplen hoy, vencen pronto o no cumplen (misma regla que la matriz). */
export async function loadCustomerAvailability(companyId: string, kinds: readonly FitResourceKind[]) {
  const window = todayWindow();
  const { customers, data } = await readTx(async (db) => ({
    customers: await loadActiveCustomers(db, companyId),
    data: await loadKindsSerially(kinds, (kind) => loadKindData(db, kind, companyId, { window })),
  }));

  const byCustomer = new Map<string, CustomerAvailability>(
    customers.map((c) => [
      c.id,
      {
        id: c.id,
        name: c.name,
        people: kinds.includes('Persona') ? emptyCounts() : null,
        equipment: kinds.includes('Equipos') ? emptyCounts() : null,
      },
    ])
  );

  for (const d of data) {
    const infoById = new Map(d.info.map((i) => [i.id, i]));
    for (const [resourceId, customerIds] of d.assignments) {
      const info = infoById.get(resourceId);
      if (!info) continue;
      for (const customerId of customerIds) {
        const entry = byCustomer.get(customerId);
        const counts = d.kind === 'Persona' ? entry?.people : entry?.equipment;
        if (!counts) continue;
        const fit = fitFor(d, resourceId, customerId, window);
        if (!fit) continue;
        const status = toCell(fit, info.condition).s;
        counts[status] += 1;
        if (d.kind === 'Persona' && status !== 'blocked' && d.offDays.has(resourceId)) counts.offToday += 1;
      }
    }
  }

  const list = [...byCustomer.values()].filter((c) => {
    const total = (x: AvailabilityCounts | null) => (x ? x.ok + x.expiring + x.blocked : 0);
    return total(c.people) + total(c.equipment) > 0;
  });
  return { today: window.from, customers: list };
}

// ============================================
// SIMULADOR DE ASIGNACIÓN
// ============================================

export interface PlannerInput {
  customerId: string;
  window: FitWindow;
  employeeIds: readonly string[];
  equipmentIds: readonly string[];
}

export interface PlannerCandidate {
  id: string;
  label: string;
  /** Ya está afectado al cliente (si no, habría que afectarlo antes de asignarlo). */
  assigned: boolean;
  /** Días no laborales (franco, licencia...) dentro del período. */
  offDays: number;
}

export interface PlannerResult {
  id: string;
  kind: FitResourceKind;
  label: string;
  role: string | null;
  assigned: boolean;
  fit: FitCell;
  /** Días no laborales en el período (personas), en rangos. */
  unavailability: string[];
  /** Reemplazos sugeridos: mismo puesto o tipo, con la documentación al día todo el período y operativos. */
  replacements: PlannerCandidate[];
}

const MAX_REPLACEMENTS = 3;

function formatDay(day: string, withYear = true): string {
  const [y, m, d] = day.split('-');
  return withYear ? `${d}/${m}/${y}` : `${d}/${m}`;
}

const nextDay = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** Días consecutivos con la misma novedad, en rangos: "Franco del 20/11 al 03/12", "Licencia el 05/12/2026". */
function groupNonWorkingDays(days: readonly { day: string; name: string }[]): string[] {
  const ranges: { name: string; from: string; to: string }[] = [];
  for (const { day, name } of days) {
    const last = ranges.at(-1);
    if (last && last.name === name && nextDay(last.to) === day) last.to = day;
    else ranges.push({ name, from: day, to: day });
  }
  return ranges.map((r) =>
    r.from === r.to
      ? `${r.name} el ${formatDay(r.from)}`
      : `${r.name} del ${formatDay(r.from, false)} al ${formatDay(r.to)}`
  );
}

function planKind(d: KindData, input: PlannerInput, selectedIds: readonly string[]): PlannerResult[] {
  if (selectedIds.length === 0) return [];
  const { customerId, window } = input;
  const selected = new Set(selectedIds);
  const isAssigned = (id: string) => (d.assignments.get(id) ?? []).includes(customerId);
  const offDayCount = (id: string): number => (d.offDays.get(id) ?? []).length;

  // Cada recurso se evalúa una sola vez aunque aparezca como candidato de varios elegidos.
  const cellCache = new Map<string, FitCell | null>();
  const cellOf = (info: FitResourceInfo): FitCell | null => {
    if (!cellCache.has(info.id)) {
      const fit = fitFor(d, info.id, customerId, window);
      cellCache.set(info.id, fit ? toCell(fit, info.condition) : null);
    }
    return cellCache.get(info.id) ?? null;
  };

  const results: PlannerResult[] = [];
  for (const info of d.info) {
    if (!selected.has(info.id)) continue;
    const cell = cellOf(info);
    if (!cell) continue;
    const unavailability = groupNonWorkingDays(d.offDays.get(info.id) ?? []);
    const needsReplacement = cell.s !== 'ok' || unavailability.length > 0;

    let replacements: PlannerCandidate[] = [];
    if (needsReplacement && info.roleId) {
      // Con la documentación al día todo el período y operativos; primero los que tienen menos días no laborales y los
      // que ya están afectados al cliente. Con diagramas por turnos casi nadie está libre un período largo entero, así
      // que los días no laborales se informan en vez de descartar al candidato.
      replacements = d.info
        .filter((c) => c.id !== info.id && !selected.has(c.id) && c.roleId === info.roleId && cellOf(c)?.s === 'ok')
        .map((c) => ({ id: c.id, label: c.label, assigned: isAssigned(c.id), offDays: offDayCount(c.id) }))
        .sort(
          (a, b) =>
            a.offDays - b.offDays || Number(b.assigned) - Number(a.assigned) || a.label.localeCompare(b.label, 'es')
        )
        .slice(0, MAX_REPLACEMENTS);
    }

    results.push({
      id: info.id,
      kind: d.kind,
      label: info.label,
      role: info.role,
      assigned: isAssigned(info.id),
      fit: cell,
      unavailability,
      replacements,
    });
  }

  return results.sort(
    (a, b) =>
      FIT_STATUS_RANK[a.fit.s] - FIT_STATUS_RANK[b.fit.s] ||
      Number(b.unavailability.length > 0) - Number(a.unavailability.length > 0) ||
      a.label.localeCompare(b.label, 'es')
  );
}

export async function runAssignmentPlanner(companyId: string, kinds: readonly FitResourceKind[], input: PlannerInput) {
  const wanted = kinds.filter((k) => (k === 'Persona' ? input.employeeIds : input.equipmentIds).length > 0);
  // Se carga todo el tipo de recurso: los reemplazos salen de los que no se eligieron.
  const { typeNames, customerName, data } = await readTx(async (db) => ({
    typeNames: await loadTypeNames(db, companyId),
    customerName:
      (await db.customers.findFirst({ where: { id: input.customerId, company_id: companyId }, select: { name: true } }))
        ?.name ?? null,
    data: await loadKindsSerially(wanted, (kind) => loadKindData(db, kind, companyId, { window: input.window })),
  }));
  const results = data.flatMap((d) =>
    planKind(d, input, d.kind === 'Persona' ? input.employeeIds : input.equipmentIds)
  );
  return { window: input.window, customerName, typeNames, results };
}

export type PlannerOutput = Awaited<ReturnType<typeof runAssignmentPlanner>>;

/** Opciones de los selectores del simulador: recursos activos de cada tipo visible. */
export async function loadPlannerOptions(companyId: string, kinds: readonly FitResourceKind[]) {
  return readTx((db) => buildPlannerOptions(db, companyId, kinds));
}

async function buildPlannerOptions(db: Db, companyId: string, kinds: readonly FitResourceKind[]) {
  const customers = await loadActiveCustomers(db, companyId);
  const employees = kinds.includes('Persona') ? await loadEmployeesInfo(db, companyId) : [];
  const equipment = kinds.includes('Equipos') ? await loadVehiclesInfo(db, companyId) : [];
  const employeeAssignments = await loadAssignments(
    db,
    'Persona',
    employees.map((e) => e.id)
  );
  const equipmentAssignments = await loadAssignments(
    db,
    'Equipos',
    equipment.map((e) => e.id)
  );
  const option = (assignments: Map<string, string[]>) => (i: FitResourceInfo) => ({
    value: i.id,
    label: i.role ? `${i.label} · ${i.role}` : i.label,
    customerIds: assignments.get(i.id) ?? [],
  });
  return {
    customers,
    employees: employees.map(option(employeeAssignments)),
    equipment: equipment.map(option(equipmentAssignments)),
  };
}

export type PlannerOptions = Awaited<ReturnType<typeof buildPlannerOptions>>;

// ============================================
// AVISO DEL PARTE DIARIO
// ============================================

export interface RowResourceWarning {
  id: string;
  kind: FitResourceKind;
  label: string;
  status: CustomerFit['status'];
  /** Documentos con problema ya con su nombre: "Licencia de conducir (vencido)". */
  issues: string[];
}

const STATE_TEXT: Record<string, string> = {
  faltante: 'falta cargar',
  rechazado: 'rechazado',
  vencido: 'vencido',
};

/** Personas y equipos de una línea que no cumplen la documentación de ese cliente en la fecha del parte. */
export async function loadRowResourceWarnings(
  companyId: string,
  kinds: readonly FitResourceKind[],
  input: { customerId: string; date: string; employeeIds: readonly string[]; equipmentIds: readonly string[] }
): Promise<RowResourceWarning[]> {
  const window = buildWindow(input.date, input.date);
  if (!window) return [];
  const targets = [
    { kind: 'Persona' as const, ids: input.employeeIds },
    { kind: 'Equipos' as const, ids: input.equipmentIds },
  ].filter((t) => kinds.includes(t.kind) && t.ids.length > 0);
  if (targets.length === 0) return [];

  return readTx(async (db) => {
    const typeNames = await loadTypeNames(db, companyId);
    const warnings: RowResourceWarning[] = [];
    for (const { kind, ids } of targets) {
      const ctx = await loadKindContext(db, kind, companyId, ids);
      for (const info of ctx.info) {
        const fit = fitFor(ctx, info.id, input.customerId, window);
        if (!fit || fit.status !== 'blocked') continue;
        warnings.push({
          id: info.id,
          kind,
          label: info.label,
          status: fit.status,
          issues: fit.blocking.map((i) => `${typeNames[i.typeId] ?? 'Documento'} (${STATE_TEXT[i.state] ?? i.state})`),
        });
      }
    }
    return warnings;
  });
}

// ============================================
// FICHA DEL RECURSO
// ============================================

/** Estado de UNA persona o equipo frente a cada cliente al que está afectado (ficha del recurso). */
export async function loadResourceCustomerFits(companyId: string, kind: FitResourceKind, resourceId: string) {
  const window = todayWindow();
  const { customers, typeNames, data } = await readTx(async (db) => ({
    customers: await loadActiveCustomers(db, companyId),
    typeNames: await loadTypeNames(db, companyId),
    data: await loadKindData(db, kind, companyId, { ids: [resourceId] }),
  }));
  const info = data.info.find((i) => i.id === resourceId);
  if (!info) return { typeNames, fits: [] };
  const nameById = new Map(customers.map((c) => [c.id, c.name]));
  const fits = (data.assignments.get(resourceId) ?? []).flatMap((customerId) => {
    const name = nameById.get(customerId);
    const fit = fitFor(data, resourceId, customerId, window);
    return name && fit ? [{ customerId, name, cell: toCell(fit, info.condition) }] : [];
  });
  fits.sort((a, b) => FIT_STATUS_RANK[a.cell.s] - FIT_STATUS_RANK[b.cell.s] || a.name.localeCompare(b.name, 'es'));
  return { typeNames, fits };
}
