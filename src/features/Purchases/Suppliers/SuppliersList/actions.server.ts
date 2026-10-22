'use server';

import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  NULL_FILTER_VALUE,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { isReceiverVatConditionId, RECEIVER_VAT_CONDITIONS } from '@/shared/lib/arca/catalogs';
import { exportFailure, fetchExportRowsInBatches, tooManyRowsMessage } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { withoutOwnFilter } from '@/shared/lib/table-facets';
import { dateRangeKeys } from '@/shared/lib/table-filters';
import {
  containsInsensitive as contains,
  isOneOf,
  isUuidOrNull,
  parseValidatedListState,
  type SingleFacetResult,
} from '@/shared/lib/table-list-query';
import { companyIdIfCanView } from '../../lib/list-access';

import { formatCuitText } from '@/shared/utils/cuit-text';
import { CUIT_LENGTH, SUPPLIERS_EXPORT_MAX_ROWS } from './constants';
import {
  deriveSupplierDocumentState,
  SUPPLIER_DOCUMENT_STATES,
  supplierDocumentDates,
  type SupplierDocumentState,
} from './labels';

const logger = new Logger('features/Purchases/Suppliers/SuppliersList');

type SupplierWhere = Prisma.suppliersWhereInput;
type SupplierOrderBy = Prisma.suppliersOrderByWithRelationInput;
type FilterState = ReturnType<typeof parseListState>;

// ============================================================================
// CONSTANTS
// ============================================================================

/** Ordenables (campos directos). Contacto, rubros y documentos son derivados / M:M: no ordenables. */
const VALID_SORT_FIELDS = new Set(['name', 'cuit', 'created_at', 'is_active']);

const SORT_MAP: Record<string, (dir: 'asc' | 'desc') => SupplierOrderBy> = {
  vat_condition: (dir) => ({ vat_condition_id: dir }),
};

const DATE_RANGE_COLUMNS = ['created_at'];

/** Unicas claves de filtro que se aceptan: cualquier otra de la URL se descarta antes de armar el `where`. */
const ALLOWED_FILTER_KEYS: ReadonlySet<string> = new Set([
  'name',
  'cuit',
  'contact',
  'vat_condition',
  'categories',
  'documents',
  'is_active',
  ...dateRangeKeys(DATE_RANGE_COLUMNS),
]);

/** Valores validos por columna con lista cerrada (un valor ajeno haria fallar a Prisma y tumbaria la lista). */
const VALID_VALUES: Record<string, (value: string) => boolean> = {
  vat_condition: (v) => /^\d{1,4}$/.test(v),
  categories: isUuidOrNull,
  documents: isOneOf(SUPPLIER_DOCUMENT_STATES),
  is_active: (v) => v === 'true' || v === 'false',
};

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/** Estado de la tabla ya parseado, con solo los filtros permitidos y sus valores validos. */
function parseListState(searchParams: DataTableSearchParams) {
  return parseValidatedListState(searchParams, ALLOWED_FILTER_KEYS, VALID_VALUES);
}

/** Empresa si el usuario puede ver proveedores; `null` = sin acceso -> lista vacia. */
const resolveCompanyId = () => companyIdIfCanView('proveedores');

/**
 * Digitos del texto buscado (acepta "30-71234567-8", "30 7123" o "30.71"). `null` si trae letras u
 * otros simbolos: un CUIT nunca los tiene, asi que ese texto no puede coincidir con ninguno.
 */
function cuitDigits(raw: string): string | null {
  const digits = raw.replace(/[\s.-]/g, '');
  return /^\d+$/.test(digits) ? digits : null;
}

/**
 * Condicion sobre el CUIT (BigInt: Prisma no admite `contains`). Con los 11 digitos es una igualdad relacional;
 * con menos, una busqueda parcial por digitos en la BD (filtrada por empresa, sin tope: un tope dejaria proveedores
 * afuera sin aviso; no admite un where relacional sin cambiar el esquema). Mas de 11 digitos no puede coincidir con ninguno.
 */
async function cuitWhere(companyId: string, digits: string): Promise<SupplierWhere> {
  if (digits.length > CUIT_LENGTH) return { id: { in: [] } };
  if (digits.length === CUIT_LENGTH) return { cuit: BigInt(digits) };
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM suppliers
    WHERE company_id = ${companyId}::uuid AND cuit::text LIKE ${`%${digits}%`}
  `;
  return { id: { in: rows.map((r) => r.id) } };
}

/** Condicion Prisma de cada estado de documentacion (sobre documentos vigentes). */
function documentStateWhere(state: SupplierDocumentState, dates: { today: string; soon: string }): SupplierWhere {
  const today = new Date(`${dates.today}T00:00:00Z`);
  const soon = new Date(`${dates.soon}T00:00:00Z`);
  const expired = { replaced_by_id: null, expires_at: { lt: today } };
  switch (state) {
    case 'EXPIRED':
      return { documents: { some: expired } };
    case 'EXPIRING':
      return {
        AND: [
          { documents: { none: expired } },
          { documents: { some: { replaced_by_id: null, expires_at: { gte: today, lte: soon } } } },
        ],
      };
    case 'OK':
      return {
        documents: {
          some: { replaced_by_id: null },
          none: { replaced_by_id: null, expires_at: { lte: soon } },
        },
      };
    case 'NONE':
      return { documents: { none: { replaced_by_id: null } } };
  }
}

/** WHERE compartido entre paginated, export y facets. */
async function buildWhereClause(companyId: string, state: FilterState): Promise<SupplierWhere> {
  const f = state.filters;
  const and: SupplierWhere[] = [{ company_id: companyId }];

  // Busqueda global: razon social, nombre de fantasia y CUIT
  const search = state.search?.trim();
  if (search) {
    const or: SupplierWhere[] = [{ name: contains(search) }, { trade_name: contains(search) }];
    const digits = cuitDigits(search);
    if (digits && digits.length >= 3) or.push(await cuitWhere(companyId, digits));
    and.push({ OR: or });
  }

  // Texto: razon social / fantasia
  const name = f.name?.[0]?.trim();
  if (name) and.push({ OR: [{ name: contains(name) }, { trade_name: contains(name) }] });

  // Texto: CUIT con o sin guiones
  const cuitRaw = f.cuit?.[0]?.trim();
  if (cuitRaw) {
    const digits = cuitDigits(cuitRaw);
    and.push(digits ? await cuitWhere(companyId, digits) : { id: { in: [] } });
  }

  // Texto: contacto principal (nombre, mail o telefono)
  const contact = f.contact?.[0]?.trim();
  if (contact) {
    and.push({
      contacts: {
        some: {
          is_primary: true,
          OR: [{ name: contains(contact) }, { email: contains(contact) }, { phone: contains(contact) }],
        },
      },
    });
  }

  // Condicion de IVA (FK Int -> ids numericos)
  const vatIds = f.vat_condition?.map(Number).filter((n) => !Number.isNaN(n));
  if (vatIds?.length) and.push({ vat_condition_id: { in: vatIds } });

  // Rubros (M:M) con "Sin rubro"
  if (f.categories?.length) {
    const hasNull = f.categories.includes(NULL_FILTER_VALUE);
    const ids = f.categories.filter((v) => v !== NULL_FILTER_VALUE);
    const parts: SupplierWhere[] = [];
    if (ids.length) parts.push({ category_links: { some: { category_id: { in: ids } } } });
    if (hasNull) parts.push({ category_links: { none: {} } });
    and.push(parts.length === 1 ? parts[0] : { OR: parts });
  }

  // Estado de la documentacion (derivado)
  const docStates = (f.documents ?? []).filter((v): v is SupplierDocumentState =>
    (SUPPLIER_DOCUMENT_STATES as readonly string[]).includes(v)
  );
  if (docStates.length) {
    const dates = supplierDocumentDates();
    and.push({ OR: docStates.map((s) => documentStateWhere(s, dates)) });
  }

  // Activo / inactivo (llega como 'true' / 'false'); con ambos no se filtra
  if (f.is_active?.length === 1) and.push({ is_active: f.is_active[0] === 'true' });

  and.push(buildDateRangeFiltersWhere(f, DATE_RANGE_COLUMNS) as SupplierWhere);

  return { AND: and };
}

const SUPPLIER_SELECT = {
  id: true,
  name: true,
  trade_name: true,
  cuit: true,
  vat_condition_id: true,
  is_active: true,
  created_at: true,
  category_links: { select: { category: { select: { id: true, name: true } } } },
  contacts: {
    where: { is_primary: true },
    take: 1,
    select: { name: true, email: true, phone: true },
  },
  documents: { where: { replaced_by_id: null }, select: { expires_at: true } },
} as const;

function shape(rows: Prisma.suppliersGetPayload<{ select: typeof SUPPLIER_SELECT }>[]) {
  const dates = supplierDocumentDates();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    trade_name: r.trade_name,
    // BigInt no se serializa hacia el cliente
    cuit: formatCuitText(r.cuit.toString()),
    vat_condition_id: r.vat_condition_id,
    vat_condition: isReceiverVatConditionId(r.vat_condition_id)
      ? RECEIVER_VAT_CONDITIONS[r.vat_condition_id].label
      : String(r.vat_condition_id),
    is_active: r.is_active,
    created_at: r.created_at,
    categories: r.category_links.map((l) => l.category).sort((a, b) => a.name.localeCompare(b.name, 'es')),
    contact: r.contacts[0] ?? null,
    documents: deriveSupplierDocumentState(r.documents, dates),
  }));
}

/** Inactivos SIEMPRE al final, sin importar el orden elegido. */
function buildOrderBy(state: FilterState): SupplierOrderBy[] {
  const sorts: SupplierOrderBy[] = [];
  for (const s of state.sorting) {
    const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
    const mapper = SORT_MAP[s.id];
    if (mapper) sorts.push(mapper(dir));
    else if (VALID_SORT_FIELDS.has(s.id) && s.id !== 'is_active') sorts.push({ [s.id]: dir });
  }
  return [{ is_active: 'desc' }, ...sorts, { name: 'asc' }];
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getSuppliersPaginated(searchParams: DataTableSearchParams) {
  const companyId = await resolveCompanyId();
  if (!companyId) return { data: [], total: 0 };

  try {
    const state = parseListState(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = await buildWhereClause(companyId, state);

    const [rows, total] = await Promise.all([
      prisma.suppliers.findMany({ where, orderBy: buildOrderBy(state), skip, take, select: SUPPLIER_SELECT }),
      prisma.suppliers.count({ where }),
    ]);
    return { data: shape(rows), total };
  } catch (error) {
    logger.error('Error al obtener proveedores', { data: { error } });
    throw new Error('No se pudo obtener la lista de proveedores');
  }
}

// ============================================================================
// EXPORT (sin paginacion)
// ============================================================================

export async function getAllSuppliersForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<SupplierListItem[]>> {
  const companyId = await resolveCompanyId();
  if (!companyId) return { ok: true, data: [] };

  try {
    const state = parseListState(searchParams);
    const where = await buildWhereClause(companyId, state);
    const orderBy = [...buildOrderBy(state), { id: 'asc' as const }];

    const rows = await fetchExportRowsInBatches({
      maxRows: SUPPLIERS_EXPORT_MAX_ROWS,
      listIds: (take) => prisma.suppliers.findMany({ where, orderBy, select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.suppliers.findMany({ where: { id: { in: ids }, company_id: companyId }, select: SUPPLIER_SELECT }),
      tooLargeMessage: tooManyRowsMessage('proveedores'),
    });
    return { ok: true, data: shape(rows) };
  } catch (error) {
    logger.error('Error al exportar proveedores', { data: { error } });
    return exportFailure(error, 'No se pudo exportar la lista de proveedores. Intente nuevamente.');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, con cross-filter)
// ============================================================================

export async function getSupplierSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<SingleFacetResult> {
  const companyId = await resolveCompanyId();
  if (!companyId) return null;

  const parsed = searchParams && Object.keys(searchParams).length > 0 ? parseListState(searchParams) : null;

  /** WHERE con todos los filtros activos MENOS el de la columna que se esta abriendo. */
  function crossWhere(excludeColumn: string): Promise<SupplierWhere> {
    return buildWhereClause(companyId as string, withoutOwnFilter(parsed ?? parseListState({}), excludeColumn));
  }

  try {
    const where = await crossWhere(columnId);

    if (columnId === 'vat_condition') {
      const rows = await prisma.suppliers.groupBy({ by: ['vat_condition_id'], where, _count: true });
      return {
        counts: new Map(rows.map((r) => [String(r.vat_condition_id), r._count])),
        resolvedOptions: rows
          .map((r) => ({
            id: String(r.vat_condition_id),
            name: isReceiverVatConditionId(r.vat_condition_id)
              ? RECEIVER_VAT_CONDITIONS[r.vat_condition_id].label
              : String(r.vat_condition_id),
          }))
          .sort((a, b) => a.name.localeCompare(b.name, 'es')),
      };
    }

    if (columnId === 'categories') {
      const [rows, withoutCategory] = await Promise.all([
        prisma.supplier_category_links.groupBy({ by: ['category_id'], where: { supplier: where }, _count: true }),
        prisma.suppliers.count({ where: { AND: [where, { category_links: { none: {} } }] } }),
      ]);
      const ids = rows.map((r) => r.category_id);
      const categories = ids.length
        ? await prisma.supplier_categories.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : [];
      const counts = new Map(rows.map((r) => [r.category_id, r._count]));
      if (withoutCategory > 0) counts.set(NULL_FILTER_VALUE, withoutCategory);
      return { counts, resolvedOptions: categories };
    }

    if (columnId === 'documents') {
      const dates = supplierDocumentDates();
      const entries = await Promise.all(
        SUPPLIER_DOCUMENT_STATES.map(async (state) => {
          const count = await prisma.suppliers.count({ where: { AND: [where, documentStateWhere(state, dates)] } });
          return [state, count] as const;
        })
      );
      return { counts: new Map<string, number>(entries) };
    }

    if (columnId === 'is_active') {
      const rows = await prisma.suppliers.groupBy({ by: ['is_active'], where, _count: true });
      return { counts: new Map(rows.map((r) => [String(r.is_active), r._count])) };
    }

    logger.warn('Facet no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet de proveedores', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// BANDA DE ATENCION
// ============================================================================

/**
 * Proveedores activos con documentacion vencida (misma definicion que el estado "Vencido" de la tabla).
 * Nunca rechaza: `null` si el usuario no puede ver proveedores o no se pudo contar.
 */
export async function getSuppliersAttention(): Promise<{ expiredDocuments: number } | null> {
  try {
    const companyId = await resolveCompanyId();
    if (!companyId) return null;
    const expiredDocuments = await prisma.suppliers.count({
      where: {
        AND: [{ company_id: companyId, is_active: true }, documentStateWhere('EXPIRED', supplierDocumentDates())],
      },
    });
    return { expiredDocuments };
  } catch (error) {
    logger.error('Error al contar proveedores con documentacion vencida', { data: { error } });
    return null;
  }
}

// ============================================================================
// TIPOS
// ============================================================================

export type SupplierListItem = Awaited<ReturnType<typeof getSuppliersPaginated>>['data'][number];
