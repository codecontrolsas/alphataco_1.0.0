import 'server-only';

import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import {
  EMPLOYEE_CONDITIONS,
  EQUIPMENT_CONDITIONS,
  type ConditionFieldConfig,
} from '../../../TiposDocumentos/config/documentConditions';
import { resolveTypeScope } from '../applicability';
import { arCurrentPeriod, arToday, parseValidity } from '../dates';
import { evaluateResource } from '../evaluation';
import type {
  ComplianceApplies,
  ComplianceDoc,
  ComplianceKind,
  ComplianceResource,
  ComplianceType,
  ResourceEvaluation,
} from '../types';

const logger = new Logger('features/Documentacion/compliance');

/** Delegados que usa el cargador: acepta el `prisma` completo y también un `tx`. */
export type ComplianceDb = Pick<
  Prisma.TransactionClient,
  | 'document_types'
  | 'documents_employees'
  | 'documents_equipment'
  | 'documents_company'
  | 'contractor_employee'
  | 'empleado_aptitudes'
  | 'employee_workshop_sectors'
  | 'contractor_equipment'
  | '$queryRaw'
>;

/** Datos de presentación de un documento que el motor no necesita (sólo con `includeDocExtras`). */
export interface ComplianceDocExtra {
  denyReason: string | null;
  /** N° de póliza (sólo documentos de equipos). */
  policyNumber: string | null;
  /** Perfil que subió el documento. */
  userId: string | null;
  /** Vencimiento guardado como fecha (empleados y equipos). */
  validityDate: Date | null;
  /** Vencimiento guardado como texto `DD/MM/YYYY` (documentos de empresa). */
  validityText: string | null;
}

export interface ComplianceDataset {
  types: ComplianceType[];
  resources: ComplianceResource[];
  /** Documentos con archivo, por recurso (`applies`). */
  docsByResource: Map<string, ComplianceDoc[]>;
  /** Datos de presentación por id de documento; vacío salvo que se pida `includeDocExtras`. */
  docExtras: Map<string, ComplianceDocExtra>;
}

export interface LoadComplianceOptions {
  companyId: string;
  /** `Empresa`: el único recurso es la empresa activa; sus tipos no tienen condiciones. */
  kind: ComplianceKind;
  /** Si se omite, se cargan todos los recursos de la empresa. */
  resourceIds?: readonly string[];
  /** `false` omite la carga de documentos (p. ej. para contar a quién aplica un tipo). Default `true`. */
  includeDocs?: boolean;
  /**
   * Tipos que no están en la base (borradores del formulario de tipos): se usan sólo para decidir qué
   * pivotes M:M hay que cargar; no se agregan a `types`.
   */
  extraTypes?: readonly ComplianceType[];
  /** `true` carga también motivo de rechazo, póliza, perfil y vencimiento crudo de cada documento (listas). */
  includeDocExtras?: boolean;
}

// ============================================
// PIVOTES M:M
// ============================================

interface RelationLoader {
  /** Columna de la pivote que apunta al recurso. */
  resourceColumn: string;
  /** Columna de la pivote que se compara contra `ids` de la condición (`filterColumn`). */
  valueColumn: string;
  /** Devuelve `[resourceId, valor]` de las filas de la pivote de esos recursos. */
  load: (db: ComplianceDb, resourceIds: string[]) => Promise<Array<[string, string]>>;
}

/**
 * Registro de pivotes soportadas, por tipo de recurso. Una `relation_table` que no esté acá no se
 * puede evaluar: se avisa con `Logger.warn` y la condición falla cerrada (el recurso no cumple).
 * Excepción deliberada respecto de la SQL legacy: en `empleado_aptitudes` sólo cuentan las filas
 * con `tiene_aptitud = true` (el legacy las contaba por existencia, lo cual es un error).
 */
const RELATION_LOADERS: Record<ComplianceApplies, Record<string, RelationLoader>> = {
  Persona: {
    contractor_employee: {
      resourceColumn: 'employee_id',
      valueColumn: 'contractor_id',
      load: async (db, ids) => {
        const rows = await db.contractor_employee.findMany({
          where: { employee_id: { in: ids }, contractor_id: { not: null } },
          select: { employee_id: true, contractor_id: true },
        });
        return rows.flatMap(
          (r): Array<[string, string]> => (r.employee_id && r.contractor_id ? [[r.employee_id, r.contractor_id]] : [])
        );
      },
    },
    empleado_aptitudes: {
      resourceColumn: 'empleado_id',
      valueColumn: 'aptitud_id',
      load: async (db, ids) => {
        const rows = await db.empleado_aptitudes.findMany({
          // La pivote guarda también "verificado que NO la tiene" (`tiene_aptitud = false`): esas
          // filas no cuentan como aptitud.
          where: { empleado_id: { in: ids }, tiene_aptitud: true },
          select: { empleado_id: true, aptitud_id: true },
        });
        return rows.map((r): [string, string] => [r.empleado_id, r.aptitud_id]);
      },
    },
    employee_workshop_sectors: {
      resourceColumn: 'employee_id',
      valueColumn: 'workshop_sector_id',
      load: async (db, ids) => {
        const rows = await db.employee_workshop_sectors.findMany({
          where: { employee_id: { in: ids } },
          select: { employee_id: true, workshop_sector_id: true },
        });
        return rows.map((r): [string, string] => [r.employee_id, r.workshop_sector_id]);
      },
    },
  },
  Equipos: {
    contractor_equipment: {
      resourceColumn: 'equipment_id',
      valueColumn: 'contractor_id',
      load: async (db, ids) => {
        const rows = await db.contractor_equipment.findMany({
          where: { equipment_id: { in: ids }, contractor_id: { not: null } },
          select: { equipment_id: true, contractor_id: true },
        });
        return rows.flatMap(
          (r): Array<[string, string]> => (r.equipment_id && r.contractor_id ? [[r.equipment_id, r.contractor_id]] : [])
        );
      },
    },
  },
};

// ============================================
// CARGA
// ============================================

function conditionConfigs(kind: ComplianceApplies): ConditionFieldConfig[] {
  return kind === 'Persona' ? EMPLOYEE_CONDITIONS : EQUIPMENT_CONDITIONS;
}

/** Columnas directas de la tabla del recurso que alguna condición registrada puede consultar. */
function directColumns(kind: ComplianceApplies): string[] {
  const columns = conditionConfigs(kind)
    .filter((c) => c.type !== 'many_to_many')
    .map((c) => c.filterColumn);
  return [...new Set(columns)];
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

function directFromRow(entries: Map<string, unknown>, columns: string[]): Record<string, string | null> {
  const direct: Record<string, string | null> = {};
  for (const column of columns) direct[column] = toText(entries.get(column));
  return direct;
}

function mapType(
  row: {
    id: string;
    company_id: string | null;
    applies: string;
    mandatory: boolean;
    is_active: boolean;
    is_it_montlhy: boolean | null;
    explired: boolean;
    down_document: boolean | null;
    private: boolean | null;
    multiresource: boolean;
    special: boolean;
    conditions: unknown[];
  },
  kind: ComplianceKind
): ComplianceType {
  // Los tipos de empresa no tienen condiciones ni documentos de baja: aplican siempre a la empresa.
  const isCompany = kind === 'Empresa';
  return {
    id: row.id,
    companyId: row.company_id,
    applies: kind,
    mandatory: row.mandatory,
    isActive: row.is_active,
    monthly: row.is_it_montlhy === true,
    hasExpiry: row.explired,
    downDocument: isCompany ? false : row.down_document === true,
    isPrivate: row.private === true,
    multiresource: row.multiresource,
    scope: isCompany ? { special: false, conditions: [] } : { special: row.special, conditions: row.conditions },
  };
}

/** Pivotes que los tipos cargados necesitan, descartando (con aviso) las no registradas. */
function relevantPivots(types: ComplianceType[], kind: ComplianceKind): string[] {
  if (kind === 'Empresa') return [];
  const registry = RELATION_LOADERS[kind];
  const wanted = new Set<string>();
  const warned = new Set<string>();
  for (const type of types) {
    if (!type.isActive) continue;
    const scope = resolveTypeScope(type);
    if (scope.kind !== 'conditions') continue;
    for (const condition of scope.conditions) {
      if (condition.kind !== 'many_to_many') continue;
      const loader = registry[condition.relationTable];
      const problem = !loader
        ? 'relation_table no registrada'
        : loader.valueColumn !== condition.filterColumn
          ? `filter_column ${condition.filterColumn} distinto de ${loader.valueColumn}`
          : null;
      if (problem) {
        const key = `${condition.relationTable}:${condition.filterColumn}`;
        if (!warned.has(key)) {
          warned.add(key);
          logger.warn('Condición M:M no evaluable: falla cerrada', {
            data: { typeId: type.id, relationTable: condition.relationTable, problem },
          });
        }
        continue;
      }
      wanted.add(condition.relationTable);
    }
  }
  return [...wanted];
}

async function loadTypes(db: ComplianceDb, companyId: string, kind: ComplianceKind): Promise<ComplianceType[]> {
  const rows = await db.document_types.findMany({
    where: { applies: kind, OR: [{ company_id: null }, { company_id: companyId }] },
    select: {
      id: true,
      company_id: true,
      applies: true,
      mandatory: true,
      is_active: true,
      is_it_montlhy: true,
      explired: true,
      down_document: true,
      private: true,
      multiresource: true,
      special: true,
      conditions: true,
    },
  });
  return rows.map((row) => mapType(row, kind));
}

/** Identificadores que se interpolan en el SQL: sólo columnas simples de la config registrada. */
const SAFE_COLUMN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Los recursos se leen con SQL crudo y cada columna condicionable se castea a texto: el cliente de
 * Prisma devuelve el NOMBRE del enum (`no_operativo`) y no el valor guardado (`no operativo`),
 * que es el que quedó en `document_types.conditions`. Con `::text` el valor es el de la base.
 */
async function loadResources(db: ComplianceDb, options: LoadComplianceOptions): Promise<ComplianceResource[]> {
  const { companyId, kind, resourceIds } = options;

  // La empresa es un único recurso, siempre activo y sin columnas condicionables.
  if (kind === 'Empresa') {
    if (resourceIds && !resourceIds.includes(companyId)) return [];
    return [{ id: companyId, companyId, applies: 'Empresa', isActive: true, direct: {}, relations: {} }];
  }

  const columns = directColumns(kind).filter((c) => {
    const safe = SAFE_COLUMN.test(c);
    if (!safe) logger.warn('Columna de condición descartada por nombre inválido', { data: { column: c } });
    return safe;
  });
  const selected = Prisma.join(columns.map((c) => Prisma.raw(`"${c}"::text AS "${c}"`)));
  const table = Prisma.raw(kind === 'Persona' ? 'employees' : 'vehicles');
  const idFilter = resourceIds ? Prisma.sql`AND id = ANY(${[...resourceIds]}::uuid[])` : Prisma.empty;
  const extra = columns.length > 0 ? Prisma.sql`, ${selected}` : Prisma.empty;

  const rows = await db.$queryRaw<Array<Record<string, unknown>>>`
    SELECT id::text AS id, is_active${extra}
    FROM ${table}
    WHERE company_id = ${companyId}::uuid ${idFilter}`;

  return rows.map((row): ComplianceResource => {
    const entries = new Map<string, unknown>(Object.entries(row));
    return {
      id: String(entries.get('id')),
      companyId,
      applies: kind,
      // `is_active` NULL se trata como activo (default de la columna), igual que el legacy.
      isActive: entries.get('is_active') !== false,
      direct: directFromRow(entries, columns),
      relations: {},
    };
  });
}

interface LoadedDocs {
  byResource: Map<string, ComplianceDoc[]>;
  extras: Map<string, ComplianceDocExtra>;
}

async function loadDocs(db: ComplianceDb, options: LoadComplianceOptions): Promise<LoadedDocs> {
  const { companyId, kind, resourceIds, includeDocExtras } = options;
  const byResource = new Map<string, ComplianceDoc[]>();
  const extras = new Map<string, ComplianceDocExtra>();

  const push = (resourceId: string | null, doc: ComplianceDoc | null) => {
    if (!resourceId || !doc) return;
    const list = byResource.get(resourceId);
    if (list) list.push(doc);
    else byResource.set(resourceId, [doc]);
  };

  const withFile = { document_path: { not: null }, NOT: { document_path: '' } };
  const select = {
    id: true,
    id_document_types: true,
    applies: true,
    state: true,
    validity: true,
    period: true,
    document_path: true,
    created_at: true,
    deny_reason: true,
    user_id: true,
  } as const;

  interface BaseRow {
    id: string;
    id_document_types: string | null;
    state: string | null;
    period: string | null;
    document_path: string | null;
    created_at: Date;
    deny_reason?: string | null;
    user_id?: string | null;
  }
  const toDoc = (row: BaseRow, validityDay: string | null): ComplianceDoc | null =>
    row.id_document_types
      ? {
          id: row.id,
          typeId: row.id_document_types,
          storedState: row.state,
          validityDay,
          period: row.period,
          path: row.document_path,
          createdAt: row.created_at,
        }
      : null;
  const extraOf = (
    row: BaseRow,
    validity: { date: Date | null; text: string | null },
    policyNumber: string | null
  ): ComplianceDocExtra => ({
    denyReason: row.deny_reason ?? null,
    policyNumber,
    userId: row.user_id ?? null,
    validityDate: validity.date,
    validityText: validity.text,
  });

  if (kind === 'Persona') {
    const rows = await db.documents_employees.findMany({
      where: {
        ...withFile,
        ...(resourceIds ? { applies: { in: [...resourceIds] } } : { employees: { company_id: companyId } }),
      },
      select,
    });
    for (const row of rows) {
      const doc = toDoc(row, parseValidity(row.validity));
      push(row.applies, doc);
      if (doc && includeDocExtras) extras.set(doc.id, extraOf(row, { date: row.validity, text: null }, null));
    }
  } else if (kind === 'Equipos') {
    const rows = await db.documents_equipment.findMany({
      where: {
        ...withFile,
        ...(resourceIds ? { applies: { in: [...resourceIds] } } : { vehicles: { company_id: companyId } }),
      },
      select: { ...select, policy_number: true },
    });
    for (const row of rows) {
      const doc = toDoc(row, parseValidity(row.validity));
      push(row.applies, doc);
      if (doc && includeDocExtras)
        extras.set(doc.id, extraOf(row, { date: row.validity, text: null }, row.policy_number));
    }
  } else {
    // Empresa: `validity` es texto DD/MM/YYYY y todos los documentos son de la empresa activa.
    const rows = await db.documents_company.findMany({
      where: { ...withFile, applies: companyId },
      select,
    });
    for (const row of rows) {
      const doc = toDoc(row, parseValidity(row.validity));
      push(row.applies, doc);
      if (doc && includeDocExtras) extras.set(doc.id, extraOf(row, { date: null, text: row.validity }, null));
    }
  }
  return { byResource, extras };
}

/**
 * Carga todo lo que el motor puro necesita para evaluar los recursos de una empresa:
 * tipos del perímetro (globales o propios, activos e inactivos), recursos con las columnas que
 * las condiciones registradas pueden consultar, pivotes M:M y documentos con archivo.
 * Dos tandas: tipos + recursos + documentos en paralelo, luego una query por pivote relevante.
 * Todas las queries respetan `company_id`.
 */
export async function loadComplianceDataset(
  db: ComplianceDb,
  options: LoadComplianceOptions
): Promise<ComplianceDataset> {
  const { companyId, kind } = options;
  if (options.resourceIds && options.resourceIds.length === 0) {
    return { types: [], resources: [], docsByResource: new Map(), docExtras: new Map() };
  }

  const [types, resources, docs] = await Promise.all([
    loadTypes(db, companyId, kind),
    loadResources(db, options),
    options.includeDocs === false
      ? Promise.resolve<LoadedDocs>({ byResource: new Map(), extras: new Map() })
      : loadDocs(db, options),
  ]);

  // La empresa no tiene pivotes: `relevantPivots` ya devuelve vacío para ella.
  if (kind !== 'Empresa') {
    const pivots = relevantPivots([...types, ...(options.extraTypes ?? [])], kind);
    if (pivots.length > 0 && resources.length > 0) {
      const ids = resources.map((r) => r.id);
      const loaded = await Promise.all(
        pivots.map(async (table) => ({ table, rows: await RELATION_LOADERS[kind][table].load(db, ids) }))
      );
      const byId = new Map(resources.map((r) => [r.id, r]));
      for (const { table, rows } of loaded) {
        for (const resource of resources) resource.relations[table] = [];
        for (const [resourceId, value] of rows) byId.get(resourceId)?.relations[table].push(value);
      }
    }
  }

  return { types, resources, docsByResource: docs.byResource, docExtras: docs.extras };
}

/** Evalúa todos los recursos del dataset con la fecha y el período corrientes en hora argentina. */
export function evaluateDataset(dataset: ComplianceDataset, now: Date = new Date()): Map<string, ResourceEvaluation> {
  const options = { today: arToday(now), period: arCurrentPeriod(now) };
  const result = new Map<string, ResourceEvaluation>();
  for (const resource of dataset.resources) {
    result.set(
      resource.id,
      evaluateResource(resource, dataset.types, dataset.docsByResource.get(resource.id) ?? [], options)
    );
  }
  return result;
}
