import type { Prisma } from '@/generated/prisma/client';
import { ensureCity, ensureCountry } from '@/test/db-fixtures';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { selectionsToConditionsJson } from '../../../TiposDocumentos/utils/conditionsMapper';
import { resolveTypeScope } from '../applicability';
import { arToday, parseValidity } from '../dates';
import { toStatusType } from '../status';
import type { ComplianceApplies, ComplianceType, ResourceEvaluation } from '../types';
import { evaluateDataset, loadComplianceDataset, type ComplianceDataset } from './dataset.server';

/**
 * Harness de EQUIVALENCIA entre el motor de cumplimiento y la lógica SQL legacy.
 *
 * Corre sólo con DATABASE_URL apuntando a `alphataco_test` (clon de la base de trabajo, con los
 * triggers legacy activos a propósito):
 *   DATABASE_URL=postgresql://alphataco:<pass>@127.0.0.1:5432/alphataco_test \
 *     npx vitest run src/features/Documentacion/shared/compliance
 *
 * Todo corre dentro de UNA transacción que termina en ROLLBACK (no deja datos). Dentro, cada
 * comparación usa tres "fuentes" de la materialización legacy, con SAVEPOINT entre ellas:
 *   - current:        las filas tal como están (pueden estar desactualizadas por las guardas WHEN);
 *   - fresh_resource: tras correr `controlar_alertas_documentos_single_*` por cada recurso;
 *   - fresh_type:     tras correr `controlar_alertas_single_document_all_*` por cada tipo obligatorio.
 * Cada diferencia se clasifica en una clase esperada; una sin clasificar hace fallar el test.
 */

class Rollback extends Error {}

/** Empleados con una fila de `empleado_aptitudes` con `tiene_aptitud = false` (los carga el escenario). */
const APTITUDE_FALSE_RESOURCES = new Set<string>();

type Tx = Prisma.TransactionClient;
type Kind = ComplianceApplies;
type Source = 'current' | 'fresh_resource' | 'fresh_type';

const CLS = {
  STALE: 'desactualizado por guardas WHEN',
  NAME: 'cliente por nombre',
  INVALID: 'condiciones todas inválidas',
  DOWN_ACTIVE: 'down_document en activo',
  ARCHIVE: 'archivar vs borrar',
  INACTIVE: 'tipo inactivo',
  MONTHLY: 'mensual period NULL',
  ALL: 'obligatorio sin condiciones aplicado a todos',
  BAJA_FILE: 'baja con archivo en tipo común (decisión 1)',
  APT_FALSE: 'aptitud sin tener (tiene_aptitud=false)',
} as const;

// ============================================
// SNAPSHOT DE LA MATERIALIZACIÓN LEGACY
// ============================================

interface LegacyRow {
  resourceId: string;
  typeId: string;
  state: string | null;
  hasFile: boolean;
  validityDay: string | null;
  period: string | null;
  archived: boolean;
}

interface Snapshot {
  rows: LegacyRow[];
  status: Map<string, string | null>;
}

/** Prisma devuelve el NOMBRE del enum (`Completo_con_doc_vencida`); la base guarda el valor con espacios. */
function statusValue(raw: string | null): string | null {
  return raw === null ? null : raw.replace(/_/g, ' ');
}

async function snapshot(tx: Tx, kind: Kind, companyId: string): Promise<Snapshot> {
  const select = {
    applies: true,
    id_document_types: true,
    state: true,
    document_path: true,
    validity: true,
    period: true,
    archived_at: true,
  } as const;
  const toRow = (r: {
    applies: string | null;
    id_document_types: string | null;
    state: string | null;
    document_path: string | null;
    validity: Date | null;
    period: string | null;
    archived_at: Date | null;
  }): LegacyRow[] =>
    r.applies && r.id_document_types
      ? [
          {
            resourceId: r.applies,
            typeId: r.id_document_types,
            state: r.state,
            hasFile: !!r.document_path && r.document_path !== '',
            validityDay: parseValidity(r.validity),
            period: r.period,
            archived: r.archived_at !== null,
          },
        ]
      : [];

  if (kind === 'Persona') {
    const [docs, res] = await Promise.all([
      tx.documents_employees.findMany({ where: { employees: { company_id: companyId } }, select }),
      tx.employees.findMany({ where: { company_id: companyId }, select: { id: true, status: true } }),
    ]);
    return { rows: docs.flatMap(toRow), status: new Map(res.map((r) => [r.id, statusValue(r.status)])) };
  }
  const [docs, res] = await Promise.all([
    tx.documents_equipment.findMany({ where: { vehicles: { company_id: companyId } }, select }),
    tx.vehicles.findMany({ where: { company_id: companyId }, select: { id: true, status: true } }),
  ]);
  return { rows: docs.flatMap(toRow), status: new Map(res.map((r) => [r.id, statusValue(r.status)])) };
}

/** Materialización legacy fresca por RECURSO (`controlar_alertas_documentos_single_*`). */
async function refreshPerResource(tx: Tx, kind: Kind, companyId: string): Promise<void> {
  if (kind === 'Persona') {
    await tx.$executeRaw`SELECT public.controlar_alertas_documentos_single_employee(e.id, e.company_id)
      FROM employees e WHERE e.company_id = ${companyId}::uuid`;
  } else {
    await tx.$executeRaw`SELECT public.controlar_alertas_documentos_single_vehicle(v.id, v.company_id)
      FROM vehicles v WHERE v.company_id = ${companyId}::uuid`;
  }
}

/** Materialización legacy fresca por TIPO (`controlar_alertas_single_document_all_*`). */
async function refreshPerType(tx: Tx, kind: Kind, companyId: string): Promise<void> {
  if (kind === 'Persona') {
    await tx.$executeRaw`SELECT public.controlar_alertas_single_document_all_employees(t.id)
      FROM document_types t
      WHERE t.mandatory AND t.is_active AND t.applies = 'Persona'
        AND (t.company_id IS NULL OR t.company_id = ${companyId}::uuid)`;
  } else {
    await tx.$executeRaw`SELECT public.controlar_alertas_single_document_all_vehicles(t.id)
      FROM document_types t
      WHERE t.mandatory AND t.is_active AND t.applies = 'Equipos'
        AND (t.company_id IS NULL OR t.company_id = ${companyId}::uuid)`;
  }
}

// ============================================
// COMPARACIÓN DE CONJUNTOS DE REQUISITOS
// ============================================

interface Bucket {
  count: number;
  examples: string[];
}
type Classes = Record<string, Bucket>;

function bump(classes: Classes, name: string, example: string): void {
  const bucket = (classes[name] ??= { count: 0, examples: [] });
  bucket.count += 1;
  if (bucket.examples.length < 3) bucket.examples.push(example);
}

interface ComparisonContext {
  kind: Kind;
  dataset: ComplianceDataset;
  evaluations: Map<string, ResourceEvaluation>;
  typesById: Map<string, ComplianceType>;
  labels: Map<string, string>;
}

const keyOf = (resourceId: string, typeId: string) => `${resourceId}|${typeId}`;

function legacyIndex(ctx: ComparisonContext, snap: Snapshot): Map<string, LegacyRow[]> {
  const index = new Map<string, LegacyRow[]>();
  for (const row of snap.rows) {
    if (row.archived) continue;
    const type = ctx.typesById.get(row.typeId);
    if (!type || !type.mandatory) continue; // sólo importan los requisitos (tipos obligatorios)
    const key = keyOf(row.resourceId, row.typeId);
    const list = index.get(key);
    if (list) list.push(row);
    else index.set(key, [row]);
  }
  return index;
}

function engineKeys(ctx: ComparisonContext): Set<string> {
  const keys = new Set<string>();
  for (const [resourceId, ev] of ctx.evaluations) {
    for (const req of ev.requirements) if (req.required) keys.add(keyOf(resourceId, req.typeId));
  }
  return keys;
}

function hasNameOnlyCondition(type: ComplianceType): boolean {
  const entries: unknown[] = Array.isArray(type.scope.conditions) ? type.scope.conditions : [];
  return entries.some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const json = entry as Record<string, unknown>;
    const ids = Array.isArray(json.ids) ? json.ids.filter((v) => typeof v === 'string' && v !== '') : [];
    const values = Array.isArray(json.values) ? json.values.filter((v) => typeof v === 'string' && v !== '') : [];
    return json.property_key === 'contractor_employee' && ids.length === 0 && values.length > 0;
  });
}

function hasAptitudeCondition(type: ComplianceType): boolean {
  const entries: unknown[] = Array.isArray(type.scope.conditions) ? type.scope.conditions : [];
  return entries.some(
    (entry) =>
      !!entry && typeof entry === 'object' && (entry as Record<string, unknown>).relation_table === 'empleado_aptitudes'
  );
}

interface SetDiff {
  side: 'legacy_only' | 'engine_only';
  resourceId: string;
  typeId: string;
}

/** Devuelve la clase esperada de una diferencia, o `null` si no encaja en la allowlist. */
function classifySetDiff(
  diff: SetDiff,
  source: Source,
  ctx: ComparisonContext,
  legacy: Map<string, LegacyRow[]>,
  freshResource: Map<string, LegacyRow[]> | null
): string | null {
  const type = ctx.typesById.get(diff.typeId);
  const resource = ctx.dataset.resources.find((r) => r.id === diff.resourceId);
  if (!type || !resource) return null;
  const key = keyOf(diff.resourceId, diff.typeId);

  // (1) La materialización actual difiere, pero la fresca por recurso ya coincide con el motor.
  if (source === 'current' && freshResource) {
    const engineHas = diff.side === 'engine_only';
    if (freshResource.has(key) === engineHas) return CLS.STALE;
  }

  const scope = resolveTypeScope(type);

  if (diff.side === 'legacy_only') {
    const rows = legacy.get(key) ?? [];
    if (!type.isActive) return CLS.INACTIVE;
    if (APTITUDE_FALSE_RESOURCES.has(diff.resourceId) && hasAptitudeCondition(type)) return CLS.APT_FALSE;
    if (hasNameOnlyCondition(type)) return CLS.NAME;
    if (type.scope.special && scope.kind === 'none') return CLS.INVALID;
    if (resource.isActive && type.downDocument) return CLS.DOWN_ACTIVE;
    if (!resource.isActive && !type.downDocument) return CLS.BAJA_FILE;
    if (source === 'fresh_type' && rows.some((r) => r.hasFile) && scope.kind === 'conditions') return CLS.ARCHIVE;
    return null;
  }

  // engine_only
  if (hasNameOnlyCondition(type)) return CLS.NAME;
  if (type.scope.special && scope.kind === 'all') return CLS.ALL;
  return null;
}

interface ComparisonReport {
  engineRequirements: number;
  legacyRequirements: number;
  differences: number;
  classes: Classes;
  unclassified: string[];
}

function compareSets(
  ctx: ComparisonContext,
  source: Source,
  snap: Snapshot,
  freshResourceSnap: Snapshot | null
): ComparisonReport {
  const legacy = legacyIndex(ctx, snap);
  const freshResource = freshResourceSnap ? legacyIndex(ctx, freshResourceSnap) : null;
  const engine = engineKeys(ctx);
  const classes: Classes = {};
  const unclassified: string[] = [];
  const resourceIds = new Set(ctx.dataset.resources.map((r) => r.id));

  const diffs: SetDiff[] = [];
  for (const key of engine) {
    if (!legacy.has(key)) {
      const [resourceId, typeId] = key.split('|');
      diffs.push({ side: 'engine_only', resourceId, typeId });
    }
  }
  for (const key of legacy.keys()) {
    const [resourceId, typeId] = key.split('|');
    if (resourceIds.has(resourceId) && !engine.has(key)) diffs.push({ side: 'legacy_only', resourceId, typeId });
  }

  for (const diff of diffs) {
    const example = `${diff.side}: ${ctx.labels.get(diff.resourceId) ?? diff.resourceId} / ${ctx.labels.get(diff.typeId) ?? diff.typeId}`;
    const cls = classifySetDiff(diff, source, ctx, legacy, freshResource);
    if (cls) bump(classes, cls, example);
    else unclassified.push(example);
  }

  return {
    engineRequirements: engine.size,
    legacyRequirements: legacy.size,
    differences: diffs.length,
    classes,
    unclassified,
  };
}

// ============================================
// COMPARACIÓN DE STATUS
// ============================================

const TAGS = {
  APROBADO: 'aprobado contaba como faltante',
  PRIORITY: 'prioridad: faltante gana sobre vencido',
  ONLY_MANDATORY: 'solo obligatorios',
  EMPTY_ROW: 'fila vacía legacy',
  PENDING_FILE: 'pendiente con archivo leído como presentado',
  REPLACED: 'historial: fila vieja reemplazada por una más nueva',
  NO_ROW: 'sin fila legacy (desactualizado)',
  MONTHLY: 'mensual: período corriente',
  DATE_EXPIRED: 'vencimiento derivado por fecha',
  CACHE: 'cache de status legacy no recalculado',
} as const;

/** Misma fórmula que `recalcular_status_documentacion` sobre las filas no archivadas. */
function legacyFormula(rows: LegacyRow[]): string {
  if (rows.some((r) => r.state === 'vencido')) return 'Completo con doc vencida';
  if (rows.every((r) => r.state === 'presentado')) return 'Completo';
  return 'Incompleto';
}

const LOADED = new Set(['presentado', 'aprobado', 'vencido']);

interface StatusExplanation {
  tags: Set<string>;
  unexplained: string[];
}

function explainStatus(
  storedStatus: string | null,
  rows: LegacyRow[],
  ev: ResourceEvaluation,
  typesById: Map<string, ComplianceType>,
  today: string
): StatusExplanation {
  const tags = new Set<string>();
  const unexplained: string[] = [];
  const formula = legacyFormula(rows);
  if (storedStatus !== formula) tags.add(TAGS.CACHE);

  const reqByType = new Map(ev.requirements.map((r) => [r.typeId, r]));
  const rowsByType = new Map<string, LegacyRow[]>();
  for (const row of rows) {
    const list = rowsByType.get(row.typeId);
    if (list) list.push(row);
    else rowsByType.set(row.typeId, [row]);
  }

  for (const row of rows) {
    if (row.state === 'presentado') continue;
    const req = reqByType.get(row.typeId);
    if (!req || !req.required) {
      tags.add(TAGS.ONLY_MANDATORY);
      continue;
    }
    const type = typesById.get(row.typeId);
    const loaded = LOADED.has(req.state);
    if (row.state === 'aprobado') {
      if (loaded) tags.add(TAGS.APROBADO);
      else if (req.state === 'faltante' && type?.monthly) tags.add(TAGS.MONTHLY);
      else unexplained.push(`fila aprobada vs motor ${req.state}`);
    } else if (row.state === 'pendiente') {
      if (row.hasFile) {
        if (loaded) tags.add(TAGS.PENDING_FILE);
        else unexplained.push(`pendiente con archivo vs motor ${req.state}`);
      } else if (loaded) tags.add(TAGS.EMPTY_ROW);
      // pendiente vacío vs faltante/rechazado: coinciden
    } else if (row.state === 'rechazado') {
      if (req.state === 'rechazado') continue;
      if (loaded) tags.add(TAGS.REPLACED);
      else unexplained.push(`fila rechazada vs motor ${req.state}`);
    } else if (row.state === 'vencido') {
      if (req.state === 'vencido') continue;
      if (req.state === 'presentado' || req.state === 'aprobado') tags.add(TAGS.REPLACED);
      else unexplained.push(`fila vencida vs motor ${req.state}`);
    } else {
      unexplained.push(`estado legacy desconocido ${String(row.state)}`);
    }
  }

  for (const req of ev.requirements) {
    if (!req.required) continue;
    const mine = rowsByType.get(req.typeId) ?? [];
    const type = typesById.get(req.typeId);
    if (req.state === 'faltante') {
      if (mine.length === 0) tags.add(TAGS.NO_ROW);
      else if (mine.some((r) => r.state === 'pendiente' && !r.hasFile)) continue;
      else if (type?.monthly) tags.add(TAGS.MONTHLY);
      else unexplained.push(`motor faltante pero legacy tiene ${mine.map((r) => r.state).join(',')}`);
    } else if (req.state === 'rechazado') {
      if (!mine.some((r) => r.state === 'rechazado')) unexplained.push('motor rechazado sin fila rechazada');
    } else if (req.state === 'vencido') {
      if (mine.some((r) => r.state === 'vencido')) continue;
      if (mine.some((r) => r.hasFile && r.validityDay !== null && r.validityDay < today)) tags.add(TAGS.DATE_EXPIRED);
      else unexplained.push('motor vencido sin fila vencida ni fecha pasada');
    }
  }

  if (formula === 'Completo con doc vencida' && ev.status === 'INCOMPLETO') tags.add(TAGS.PRIORITY);
  return { tags, unexplained };
}

interface StatusReport {
  resources: number;
  equal: number;
  differences: number;
  classes: Classes;
  unclassified: string[];
}

function compareStatus(ctx: ComparisonContext, snap: Snapshot, today: string): StatusReport {
  const classes: Classes = {};
  const unclassified: string[] = [];
  const rowsByResource = new Map<string, LegacyRow[]>();
  for (const row of snap.rows) {
    if (row.archived) continue;
    const list = rowsByResource.get(row.resourceId);
    if (list) list.push(row);
    else rowsByResource.set(row.resourceId, [row]);
  }

  let equal = 0;
  let differences = 0;
  for (const resource of ctx.dataset.resources) {
    const ev = ctx.evaluations.get(resource.id);
    if (!ev) continue;
    const engine = toStatusType(ev.status);
    const stored = snap.status.get(resource.id) ?? null;
    if (stored === engine) {
      equal += 1;
      continue;
    }
    differences += 1;
    const label = ctx.labels.get(resource.id) ?? resource.id;
    const { tags, unexplained } = explainStatus(
      stored,
      rowsByResource.get(resource.id) ?? [],
      ev,
      ctx.typesById,
      today
    );
    const example = `${label}: legacy=${stored} motor=${engine}`;
    if (unexplained.length > 0 || tags.size === 0) {
      unclassified.push(`${example} [${unexplained.join('; ') || 'sin causa identificada'}]`);
      continue;
    }
    for (const tag of tags) bump(classes, tag, example);
  }
  return { resources: ctx.dataset.resources.length, equal, differences, classes, unclassified };
}

// ============================================
// EJECUCIÓN POR EMPRESA Y TIPO DE RECURSO
// ============================================

interface KindReport {
  sets: Record<Source, ComparisonReport>;
  status: { current: StatusReport; fresh_resource: StatusReport };
}

async function buildLabels(tx: Tx, kind: Kind, companyId: string): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  const types = await tx.document_types.findMany({ select: { id: true, name: true } });
  for (const t of types) labels.set(t.id, t.name);
  if (kind === 'Persona') {
    const res = await tx.employees.findMany({ where: { company_id: companyId }, select: { id: true, file: true } });
    for (const r of res) labels.set(r.id, `legajo ${r.file}`);
  } else {
    const res = await tx.vehicles.findMany({ where: { company_id: companyId }, select: { id: true, domain: true } });
    for (const r of res) labels.set(r.id, `equipo ${r.domain ?? r.id.slice(0, 8)}`);
  }
  return labels;
}

async function runKind(tx: Tx, kind: Kind, companyId: string, now: Date): Promise<KindReport> {
  const labels = await buildLabels(tx, kind, companyId);
  const dataset = await loadComplianceDataset(tx, { companyId, kind });
  const evaluations = evaluateDataset(dataset, now);
  const ctx: ComparisonContext = {
    kind,
    dataset,
    evaluations,
    typesById: new Map(dataset.types.map((t) => [t.id, t])),
    labels,
  };
  const today = arToday(now);

  const current = await snapshot(tx, kind, companyId);

  await tx.$executeRawUnsafe('SAVEPOINT eq_resource');
  await refreshPerResource(tx, kind, companyId);
  const freshResource = await snapshot(tx, kind, companyId);
  await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT eq_resource');

  await tx.$executeRawUnsafe('SAVEPOINT eq_type');
  await refreshPerType(tx, kind, companyId);
  const freshType = await snapshot(tx, kind, companyId);
  await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT eq_type');

  return {
    sets: {
      current: compareSets(ctx, 'current', current, freshResource),
      fresh_resource: compareSets(ctx, 'fresh_resource', freshResource, null),
      fresh_type: compareSets(ctx, 'fresh_type', freshType, null),
    },
    status: {
      current: compareStatus(ctx, current, today),
      fresh_resource: compareStatus(ctx, freshResource, today),
    },
  };
}

// ============================================
// REPORTE
// ============================================

function printClasses(title: string, classes: Classes, unclassified: string[]): void {
  const names = Object.keys(classes);
  process.stdout.write(`  ${title}\n`);
  if (names.length === 0 && unclassified.length === 0) process.stdout.write('    (sin diferencias)\n');
  for (const name of names) {
    process.stdout.write(`    - ${name}: ${classes[name].count}\n`);
    for (const example of classes[name].examples) process.stdout.write(`        ej: ${example}\n`);
  }
  if (unclassified.length > 0) {
    process.stdout.write(`    - SIN CLASIFICAR: ${unclassified.length}\n`);
    for (const example of unclassified.slice(0, 3)) process.stdout.write(`        ej: ${example}\n`);
  }
}

function printKind(scope: string, kind: Kind, report: KindReport): void {
  process.stdout.write(`\n[${scope}] ${kind}\n`);
  for (const source of ['current', 'fresh_resource', 'fresh_type'] as const) {
    const s = report.sets[source];
    printClasses(
      `requisitos motor(${s.engineRequirements}) vs legacy ${source}(${s.legacyRequirements}): ${s.differences} difs`,
      s.classes,
      s.unclassified
    );
  }
  for (const source of ['current', 'fresh_resource'] as const) {
    const s = report.status[source];
    printClasses(
      `status vs legacy ${source}: ${s.equal}/${s.resources} iguales, ${s.differences} difs`,
      s.classes,
      s.unclassified
    );
  }
}

function collectUnclassified(label: string, report: KindReport): string[] {
  const out: string[] = [];
  for (const source of ['current', 'fresh_resource', 'fresh_type'] as const) {
    for (const u of report.sets[source].unclassified) out.push(`${label} sets/${source} ${u}`);
  }
  for (const source of ['current', 'fresh_resource'] as const) {
    for (const u of report.status[source].unclassified) out.push(`${label} status/${source} ${u}`);
  }
  return out;
}

// ============================================
// ESCENARIO SINTÉTICO
// ============================================

type DocState = 'pendiente' | 'presentado' | 'aprobado' | 'rechazado' | 'vencido';

interface DocSpec {
  state: DocState;
  validity?: Date | null;
  period?: string | null;
}

const DAY = 86_400_000;

async function buildScenario(tx: Tx, now: Date): Promise<string> {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 10);
  const country = await ensureCountry(tx as never);
  const city = await ensureCity(tx as never);
  const company = await tx.company.create({
    data: {
      company_name: `Equivalencia ${suffix}`,
      description: 'empresa de prueba de equivalencia',
      contact_email: 'equivalencia@alphataco.local',
      contact_phone: '+542991234567',
      address: 'Calle 1',
      city: city.id,
      country: 'argentina',
      industry: 'Petroleo',
      company_cuit: `EQ-${suffix}`,
    },
    select: { id: true },
  });
  const companyId = company.id;

  // Catálogos
  const [posA, posB] = await Promise.all(
    ['A', 'B'].map((n) =>
      tx.company_positions.create({
        data: { name: `Pos ${n} ${suffix}`, is_active: true, company_id: companyId },
        select: { id: true },
      })
    )
  );
  const [catA, catB] = await Promise.all(
    ['A', 'B'].map((n) => tx.category.create({ data: { name: `Cat ${n} ${suffix}` }, select: { id: true } }))
  );
  const [guildA, guildB] = await Promise.all(
    ['A', 'B'].map((n) =>
      tx.guild.create({ data: { name: `Gremio ${n} ${suffix}`, company_id: companyId }, select: { id: true } })
    )
  );
  const customers = [];
  for (const [i, n] of ['K1', 'K2'].entries()) {
    customers.push(
      await tx.customers.create({
        data: {
          name: `Cliente ${n} ${suffix}`,
          cuit: BigInt(30_000_000_000 + Math.floor(Math.random() * 1e9) * 10 + i),
          company_id: companyId,
        },
        select: { id: true, name: true },
      })
    );
  }
  const [k1, k2] = customers;
  const [apt1, apt2] = await Promise.all(
    ['1', '2'].map((n) =>
      tx.aptitudes_tecnicas.create({
        data: { nombre: `Aptitud ${n} ${suffix}`, company_id: companyId },
        select: { id: true },
      })
    )
  );

  // Empleados
  let seq = 0;
  const mkEmployee = (
    data: Pick<
      Prisma.employeesUncheckedCreateInput,
      'company_position' | 'category_id' | 'guild_id' | 'is_active' | 'gender'
    >
  ) => {
    seq += 1;
    return tx.employees.create({
      data: {
        company_id: companyId,
        lastname: 'Equivalencia',
        firstname: `Emp${seq}`,
        cuil: `EQ-${suffix}-${seq}`,
        document_number: `${suffix}${seq}`,
        birthplace: country.id,
        street: 'x',
        street_number: '1',
        province: city.province_id,
        phone: '0',
        file: `EQ${suffix}-${seq}`,
        date_of_admission: new Date(),
        allocated_to: [],
        ...data,
      },
      select: { id: true },
    });
  };
  const e1 = await mkEmployee({
    company_position: posA.id,
    category_id: catA.id,
    guild_id: guildA.id,
    gender: 'Masculino',
  });
  const e2 = await mkEmployee({
    company_position: posB.id,
    category_id: catA.id,
    guild_id: guildB.id,
    gender: 'Femenino',
  });
  const e3 = await mkEmployee({ company_position: posB.id, category_id: catB.id, guild_id: guildB.id });
  const e4 = await mkEmployee({ company_position: posA.id, is_active: false }); // de baja desde el alta
  const e5 = await mkEmployee({ company_position: posA.id, category_id: catA.id });
  const e6 = await mkEmployee({});
  const e7 = await mkEmployee({}); // cubierto por completo salvo el mensual del mes anterior
  const e8 = await mkEmployee({}); // cubierto por completo salvo el mensual sin período
  const e9 = await mkEmployee({}); // aptitud con tiene_aptitud=false
  await tx.contractor_employee.createMany({
    data: [
      { employee_id: e1.id, contractor_id: k1.id },
      { employee_id: e2.id, contractor_id: k2.id },
    ],
  });
  await tx.empleado_aptitudes.createMany({
    data: [
      { empleado_id: e2.id, aptitud_id: apt1.id, tiene_aptitud: true },
      { empleado_id: e3.id, aptitud_id: apt2.id, tiene_aptitud: true },
      { empleado_id: e9.id, aptitud_id: apt1.id, tiene_aptitud: false }, // verificado que NO la tiene
    ],
  });
  APTITUDE_FALSE_RESOURCES.add(e9.id);

  // Tipos de documento de personas
  const base = { applies: 'Persona' as const, multiresource: false, mandatory: true, explired: false, special: false };
  const mkType = (name: string, data: Partial<Prisma.document_typesUncheckedCreateInput> = {}) =>
    tx.document_types.create({
      data: { ...base, name: `${name} ${suffix}`, company_id: companyId, ...data },
      select: { id: true },
    });
  const conds = (selections: Record<string, string[]>) =>
    selectionsToConditionsJson(selections, 'Persona', {}) as Prisma.InputJsonValue[];

  const tGlobal = await mkType('Global', { company_id: null, explired: true });
  const tOwn1 = await mkType('Propio 1');
  const tOwn2 = await mkType('Propio 2', { explired: true });
  const tPos = await mkType('Posición+Categoría', {
    special: true,
    conditions: conds({ companyPosition: [posA.id], category: [catA.id] }),
  });
  const tGuild = await mkType('Gremio', { special: true, conditions: conds({ guild: [guildA.id] }) });
  const tCust = await mkType('Cliente', { special: true, conditions: conds({ contractorEmployee: [k1.id] }) });
  const tApt = await mkType('Aptitud', { special: true, conditions: conds({ aptitudes: [apt1.id] }) });
  const tGender = await mkType('Sexo', { special: true, conditions: conds({ gender: ['Masculino'] }) });
  const tInvalid = await mkType('Condiciones inválidas', {
    special: true,
    conditions: [
      {
        property_key: 'company_position',
        ids: [''],
        values: [],
        relation_type: 'one_to_many',
        filter_column: 'company_position',
      },
    ],
  });
  const tInvalidLate = await mkType('Inválidas después'); // nace común (con filas) y luego se rompe
  await tx.document_types.update({
    where: { id: tInvalidLate.id },
    data: {
      special: true,
      conditions: [
        { property_key: 'category', ids: [''], values: [], relation_type: 'one_to_many', filter_column: 'category_id' },
      ],
    },
  });
  const tName = await mkType('Cliente por nombre', {
    special: true,
    conditions: [
      {
        property_key: 'contractor_employee',
        ids: [],
        values: [k1.name],
        is_relation: true,
        is_array_relation: true,
        relation_type: 'many_to_many',
        relation_table: 'contractor_employee',
        column_on_relation: 'employee_id',
        column_on_employees: 'id',
        filter_column: 'contractor_id',
      },
    ],
  });
  const tDown = await mkType('De baja', { down_document: true });
  const tMonthly = await mkType('Mensual', { is_it_montlhy: true });
  const tOptional = await mkType('Opcional', { mandatory: false });
  const tSpecialNoConds = await mkType('Especial sin condiciones', { special: true, conditions: [] });
  const tInactive = await mkType('Inactivo');
  await tx.document_types.update({ where: { id: tInactive.id }, data: { is_active: false } });
  const tOtherCompany = await mkType('De otra empresa', {
    company_id: (await tx.company.findFirstOrThrow({ where: { id: { not: companyId } }, select: { id: true } })).id,
  });
  void tOtherCompany;

  // Desactualizaciones a propósito (atributos/pivotes que las guardas WHEN no vigilan)
  await tx.employees.update({ where: { id: e2.id }, data: { gender: 'Masculino' } }); // ahora cumple "Sexo"
  await tx.contractor_employee.create({ data: { employee_id: e3.id, contractor_id: k1.id } }); // ahora cumple "Cliente"
  await tx.contractor_employee.deleteMany({ where: { employee_id: e1.id, contractor_id: k1.id } }); // ya no cumple "Cliente"
  await tx.empleado_aptitudes.create({ data: { empleado_id: e6.id, aptitud_id: apt1.id, tiene_aptitud: true } }); // ahora cumple "Aptitud"
  // Atributos vigilados: el legacy sí se actualiza (control)
  await tx.employees.update({ where: { id: e3.id }, data: { company_position: posA.id, category_id: catA.id } });
  await tx.employees.update({ where: { id: e5.id }, data: { is_active: false } }); // baja posterior al alta

  // Documentos cargados
  let fileSeq = 0;
  const setEmployeeDoc = async (employeeId: string, typeId: string, spec: DocSpec) => {
    fileSeq += 1;
    const data = {
      state: spec.state,
      document_path: `eq/${suffix}/${fileSeq}.pdf`,
      validity: spec.validity ?? null,
      period: spec.period ?? null,
    };
    const updated = await tx.documents_employees.updateMany({
      where: { applies: employeeId, id_document_types: typeId },
      data,
    });
    if (updated.count === 0) {
      await tx.documents_employees.create({ data: { applies: employeeId, id_document_types: typeId, ...data } });
    }
  };
  const future = new Date(now.getTime() + 40 * DAY);
  const past = new Date(now.getTime() - 3 * DAY);
  const period = now.toISOString().slice(0, 7);
  const lastPeriod = new Date(now.getTime() - 45 * DAY).toISOString().slice(0, 7);

  await setEmployeeDoc(e1.id, tOwn1.id, { state: 'presentado' });
  await setEmployeeDoc(e1.id, tOwn2.id, { state: 'presentado', validity: past }); // vencido por fecha
  await setEmployeeDoc(e1.id, tGlobal.id, { state: 'vencido', validity: past });
  await setEmployeeDoc(e1.id, tGender.id, { state: 'presentado' });
  await setEmployeeDoc(e1.id, tInactive.id, { state: 'presentado' });
  await setEmployeeDoc(e1.id, tOptional.id, { state: 'rechazado' });
  await setEmployeeDoc(e2.id, tOwn1.id, { state: 'aprobado' });
  await setEmployeeDoc(e2.id, tPos.id, { state: 'presentado' }); // no cumple la condición: queda con archivo
  await setEmployeeDoc(e2.id, tMonthly.id, { state: 'presentado', period: lastPeriod });
  await setEmployeeDoc(e3.id, tOwn1.id, { state: 'rechazado' });
  await setEmployeeDoc(e3.id, tMonthly.id, { state: 'presentado', period: null });
  await setEmployeeDoc(e4.id, tOwn1.id, { state: 'presentado' }); // baja con archivo en tipo común
  await setEmployeeDoc(e4.id, tDown.id, { state: 'presentado' });
  // e6: cubre todo lo que le exige el motor
  for (const t of [tGlobal, tOwn1, tOwn2, tInvalidLate, tSpecialNoConds]) {
    await setEmployeeDoc(e6.id, t.id, { state: 'presentado', validity: t === tGlobal || t === tOwn2 ? future : null });
  }
  await setEmployeeDoc(e6.id, tMonthly.id, { state: 'aprobado', period });
  await setEmployeeDoc(e6.id, tApt.id, { state: 'presentado' });
  // e7 y e8: TODAS sus filas legacy cargadas, para aislar el efecto del período mensual en el status
  for (const [employeeId, monthlyPeriod] of [
    [e7.id, lastPeriod],
    [e8.id, null],
  ] as const) {
    await tx.documents_employees.updateMany({
      where: { applies: employeeId },
      data: { state: 'presentado', document_path: `eq/${suffix}/${employeeId}.pdf` },
    });
    await tx.documents_employees.updateMany({
      where: { applies: employeeId, id_document_types: tMonthly.id },
      data: { period: monthlyPeriod },
    });
  }

  await buildVehicleScenario(tx, now, { suffix, companyId, customers: [k1.id, k2.id] });
  return companyId;
}

async function buildVehicleScenario(
  tx: Tx,
  now: Date,
  ctx: { suffix: string; companyId: string; customers: [string, string] }
): Promise<void> {
  const { suffix, companyId } = ctx;
  const [k1, k2] = ctx.customers;
  const tov = await tx.types_of_vehicles.create({ data: { name: `Categoría ${suffix}` }, select: { id: true } });
  const [ty1, ty2] = await Promise.all(
    ['1', '2'].map((n) =>
      tx.type.create({ data: { name: `Tipo ${n} ${suffix}`, company_id: companyId }, select: { id: true } })
    )
  );
  const st1 = await tx.sub_type.create({
    data: { name: `Sub 1 ${suffix}`, company_id: companyId, type: ty1.id },
    select: { id: true },
  });
  const st2 = await tx.sub_type.create({
    data: { name: `Sub 2 ${suffix}`, company_id: companyId, type: ty2.id },
    select: { id: true },
  });

  let seq = 0;
  const mkVehicle = (
    data: Pick<Prisma.vehiclesUncheckedCreateInput, 'type' | 'subType' | 'is_active' | 'condition'>
  ) => {
    seq += 1;
    return tx.vehicles.create({
      data: {
        company_id: companyId,
        type_of_vehicle: tov.id,
        engine: 'x',
        year: '2020',
        domain: `EQ${suffix}${seq}`,
        ...data,
      },
      select: { id: true },
    });
  };
  const v1 = await mkVehicle({ type: ty1.id, subType: st1.id });
  const v2 = await mkVehicle({ type: ty2.id, subType: st2.id });
  const v3 = await mkVehicle({ type: ty1.id });
  const v4 = await mkVehicle({ type: ty1.id, is_active: false });
  await tx.contractor_equipment.create({ data: { equipment_id: v1.id, contractor_id: k1 } });
  await tx.contractor_equipment.create({ data: { equipment_id: v2.id, contractor_id: k2 } });

  const base = { applies: 'Equipos' as const, multiresource: false, mandatory: true, explired: false, special: false };
  const mkType = (name: string, data: Partial<Prisma.document_typesUncheckedCreateInput> = {}) =>
    tx.document_types.create({
      data: { ...base, name: `${name} ${suffix}`, company_id: companyId, ...data },
      select: { id: true },
    });
  const conds = (selections: Record<string, string[]>) =>
    selectionsToConditionsJson(selections, 'Equipos', {}) as Prisma.InputJsonValue[];

  const qGlobal = await mkType('Equipo global', { company_id: null, explired: true });
  const qType = await mkType('Equipo por tipo', { special: true, conditions: conds({ vehicleType: [ty1.id] }) });
  const qSub = await mkType('Equipo por subtipo', { special: true, conditions: conds({ vehicleSubType: [st2.id] }) });
  const qCust = await mkType('Equipo por cliente', { special: true, conditions: conds({ contractorEquipment: [k1] }) });
  const qCond = await mkType('Equipo por condición', {
    special: true,
    conditions: conds({ condition: ['operativo'] }),
  });
  const qDown = await mkType('Equipo de baja', { down_document: true });
  const qMonthly = await mkType('Equipo mensual', { is_it_montlhy: true });
  const qInactive = await mkType('Equipo inactivo');
  await tx.document_types.update({ where: { id: qInactive.id }, data: { is_active: false } });

  // Desactualizaciones: condición y pivote no vigilados por las guardas del trigger de vehículos
  await tx.vehicles.update({ where: { id: v1.id }, data: { condition: 'no_operativo' } });
  await tx.contractor_equipment.create({ data: { equipment_id: v3.id, contractor_id: k1 } });

  let fileSeq = 0;
  const setVehicleDoc = async (vehicleId: string, typeId: string, spec: DocSpec) => {
    fileSeq += 1;
    const data = {
      state: spec.state,
      document_path: `eq/${suffix}/v${fileSeq}.pdf`,
      validity: spec.validity ?? null,
      period: spec.period ?? null,
    };
    const updated = await tx.documents_equipment.updateMany({
      where: { applies: vehicleId, id_document_types: typeId },
      data,
    });
    if (updated.count === 0) {
      await tx.documents_equipment.create({ data: { applies: vehicleId, id_document_types: typeId, ...data } });
    }
  };
  const past = new Date(now.getTime() - 3 * DAY);
  const period = now.toISOString().slice(0, 7);
  await setVehicleDoc(v1.id, qGlobal.id, { state: 'presentado', validity: past });
  await setVehicleDoc(v1.id, qType.id, { state: 'aprobado' });
  await setVehicleDoc(v2.id, qType.id, { state: 'presentado' }); // no cumple: queda con archivo
  await setVehicleDoc(v2.id, qGlobal.id, { state: 'rechazado' });
  await setVehicleDoc(v3.id, qMonthly.id, { state: 'presentado', period });
  await setVehicleDoc(v4.id, qGlobal.id, { state: 'presentado' });
  await setVehicleDoc(v4.id, qDown.id, { state: 'presentado' });
  await setVehicleDoc(v1.id, qInactive.id, { state: 'presentado' });
  void qSub;
  void qCust;
  void qCond;
}

// ============================================
// TESTS
// ============================================

const KINDS: Kind[] = ['Persona', 'Equipos'];

function mergeClasses(into: Classes, from: Classes): void {
  for (const [name, bucket] of Object.entries(from)) {
    const target = (into[name] ??= { count: 0, examples: [] });
    target.count += bucket.count;
    for (const ex of bucket.examples) if (target.examples.length < 3) target.examples.push(ex);
  }
}

describe.skipIf(!process.env.DATABASE_URL)('equivalencia motor de cumplimiento vs lógica SQL legacy', () => {
  it('datos reales clonados y escenarios sintéticos: toda diferencia cae en una clase esperada', async () => {
    const { prisma } = await import('@/shared/lib/prisma');
    const now = new Date();
    const reports: Record<string, KindReport> = {};
    let syntheticCompanyId = '';

    await prisma
      .$transaction(
        async (tx) => {
          // (a) Datos reales: todas las empresas con recursos
          const [empCompanies, vehCompanies] = await Promise.all([
            tx.employees.findMany({
              distinct: ['company_id'],
              select: { company_id: true },
            }),
            tx.vehicles.findMany({
              distinct: ['company_id'],
              select: { company_id: true },
            }),
          ]);
          const companyByKind: Record<Kind, string[]> = {
            Persona: empCompanies.flatMap((c) => (c.company_id ? [c.company_id] : [])),
            Equipos: vehCompanies.flatMap((c) => (c.company_id ? [c.company_id] : [])),
          };
          for (const kind of KINDS) {
            for (const companyId of companyByKind[kind]) {
              reports[`real/${kind}/${companyId}`] = await runKind(tx, kind, companyId, now);
            }
          }

          // (b) Escenarios sintéticos ricos en una empresa propia
          syntheticCompanyId = await buildScenario(tx, now);
          for (const kind of KINDS) {
            reports[`synthetic/${kind}/${syntheticCompanyId}`] = await runKind(tx, kind, syntheticCompanyId, now);
          }
          throw new Rollback();
        },
        { timeout: 300_000, maxWait: 30_000 }
      )
      .catch((error) => {
        if (!(error instanceof Rollback)) throw error;
      });

    // (c) y (d): reporte
    const unclassified: string[] = [];
    const summary: Record<string, { sets: Record<Source, Classes>; status: Record<string, Classes> }> = {};
    const syntheticSets: Classes = {};
    for (const [label, report] of Object.entries(reports)) {
      const [scope, kind] = label.split('/') as [string, Kind];
      printKind(scope, kind, report);
      unclassified.push(...collectUnclassified(label, report));
      summary[label] = {
        sets: {
          current: report.sets.current.classes,
          fresh_resource: report.sets.fresh_resource.classes,
          fresh_type: report.sets.fresh_type.classes,
        },
        status: { current: report.status.current.classes, fresh_resource: report.status.fresh_resource.classes },
      };
      if (scope === 'synthetic') {
        for (const source of ['current', 'fresh_resource', 'fresh_type'] as const)
          mergeClasses(syntheticSets, report.sets[source].classes);
      }
    }
    writeFileSync(
      '/tmp/equivalence-report.json',
      JSON.stringify({ generatedAt: now.toISOString(), reports, unclassified }, null, 2)
    );
    process.stdout.write(`\nReporte completo: /tmp/equivalence-report.json\n`);

    expect(unclassified).toEqual([]);
    // El escenario sintético debe ejercitar las clases clave (si no, el harness pasaría en vacío).
    for (const cls of [
      CLS.STALE,
      CLS.NAME,
      CLS.INVALID,
      CLS.DOWN_ACTIVE,
      CLS.ARCHIVE,
      CLS.INACTIVE,
      CLS.BAJA_FILE,
      CLS.APT_FALSE,
    ]) {
      expect(syntheticSets[cls]?.count ?? 0, `clase sin ejercitar: ${cls}`).toBeGreaterThan(0);
    }
    expect(summary).toBeDefined();
  }, 300_000);
});
