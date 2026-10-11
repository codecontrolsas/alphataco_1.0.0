'use server';

import { checkPermissionServer } from '@/features/Permissions';
import { Prisma } from '@/generated/prisma/client';
import { treasury_movement_kind } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import { NULL_FILTER_VALUE, parseSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import {
  buildTreasuryDateRangeWhere,
  facetWhere,
  ownEntry,
  parseAmountText,
  safePaging,
  textValue,
} from '../../lib/filter-values';
import { MOVEMENT_STATE_LABELS, OPENING_OPERATION_LABEL } from './constants';

const logger = new Logger('features/Treasury/Movements/MovementsList');

type MovementWhere = Prisma.treasury_movementsWhereInput;
type MovementOrderBy = Prisma.treasury_movementsOrderByWithRelationInput;
type FilterState = ReturnType<typeof parseSearchParams>;

// ============================================================================
// CONSTANTS
// ============================================================================

/** Ordenables (campos directos). Las FK y los derivados se resuelven en SORT_MAP. */
const VALID_SORT_FIELDS = new Set(['date', 'kind', 'description', 'created_at']);

const SORT_MAP: Record<string, (dir: 'asc' | 'desc') => MovementOrderBy[]> = {
  account: (dir) => [{ account: { name: dir } }],
  concept: (dir) => [{ concept: { name: dir } }],
  // Ingreso: de menor a mayor importe; Egreso: el importe viene negativo, asi que se invierte.
  income: (dir) => [{ amount: dir }],
  expense: (dir) => [{ amount: dir === 'asc' ? 'desc' : 'asc' }],
  state: (dir) => [{ cancelled_at: { sort: dir, nulls: 'first' } }],
};

/** `date` es @db.Date; `created_at` es timestamptz (el dia elegido es el dia argentino). */
const DATE_COLUMNS = ['date'];
const TIMESTAMP_COLUMNS = ['created_at'];

const MOVEMENT_KINDS = Object.values(treasury_movement_kind);

const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/** Empresa si el usuario puede ver la tabla; `null` = sin acceso -> lista vacia. */
async function resolveCompanyId(): Promise<string | null> {
  const canView = await checkPermissionServer('tesoreria', 'movimientos', 'view');
  if (!canView) return null;
  return getActiveCompanyId();
}

/** Importe tipeado ("1234,56" o "1234.56") -> Decimal exacto; `null` si no es un numero o no entra en numeric(15,2). */
function parseAmount(text: string): Prisma.Decimal | null {
  const normalized = parseAmountText(text);
  return normalized ? new Prisma.Decimal(normalized) : null;
}

/** Numero de la orden de pago, transferencia, recibo u operacion de cheques de origen del movimiento. */
const originNumberContains = (value: string): MovementWhere => {
  const or: MovementWhere[] = [
    { payment_order_payment: { payment_order: { number: contains(value) } } },
    { transfer: { number: contains(value) } },
    { customer_receipt_payment: { receipt: { number: contains(value) } } },
    { check_operation: { number: contains(value) } },
  ];
  // La carga inicial no tiene numero: se busca por el texto que muestra la tabla
  if (value.length >= 3 && OPENING_OPERATION_LABEL.toLowerCase().includes(value.toLowerCase())) {
    or.push({ check_operation: { number: null } });
  }
  return { OR: or };
};

/** WHERE compartido entre paginated, export y facets. */
function buildWhereClause(companyId: string, state: FilterState): MovementWhere {
  const f = state.filters;
  const and: MovementWhere[] = [{ company_id: companyId }];

  const search = textValue(state.search);
  if (search) {
    and.push({
      OR: [
        { description: contains(search) },
        { account: { name: contains(search) } },
        { concept: { name: contains(search) } },
        originNumberContains(search),
      ],
    });
  }

  const account = facetWhere('account_id', f.account, { kind: 'uuid' });
  if (account) and.push(account as MovementWhere);
  const kind = facetWhere('kind', f.kind, { kind: 'enum', allowed: MOVEMENT_KINDS });
  if (kind) and.push(kind as MovementWhere);
  const concept = facetWhere('concept_id', f.concept, { kind: 'uuid', nullable: true });
  if (concept) and.push(concept as MovementWhere);
  and.push(
    buildTreasuryDateRangeWhere(f, { dateColumns: DATE_COLUMNS, timestampColumns: TIMESTAMP_COLUMNS }) as MovementWhere
  );

  // Estado (derivado de cancelled_at y de la línea de extracto). ACTIVE = vigente, con o sin
  // conciliar; RECONCILED = vigente conciliado (subconjunto de ACTIVE). Valores desconocidos se ignoran.
  const states = (f.state ?? []).filter((v) => ownEntry(MOVEMENT_STATE_LABELS, v) !== undefined);
  const stateClauses: MovementWhere[] = [];
  if (states.includes('ACTIVE')) stateClauses.push({ cancelled_at: null });
  else if (states.includes('RECONCILED')) stateClauses.push({ cancelled_at: null, statement_line: { isNot: null } });
  if (states.includes('CANCELLED')) stateClauses.push({ cancelled_at: { not: null } });
  if (stateClauses.length === 1) and.push(stateClauses[0]);
  else if (stateClauses.length > 1) and.push({ OR: stateClauses });

  // Texto
  const description = textValue(f.description?.[0]);
  if (description) and.push({ description: contains(description) });

  const origin = textValue(f.origin?.[0]);
  if (origin) and.push(originNumberContains(origin));

  const cancelReason = textValue(f.cancel_reason?.[0]);
  if (cancelReason) and.push({ cancel_reason: contains(cancelReason) });

  // Importes (exactos): el ingreso es positivo y el egreso se guarda negativo
  const income = textValue(f.income?.[0]);
  if (income) {
    const amount = parseAmount(income);
    and.push(amount ? { amount } : { id: { in: [] } });
  }
  const expense = textValue(f.expense?.[0]);
  if (expense) {
    const amount = parseAmount(expense);
    and.push(amount ? { amount: amount.negated() } : { id: { in: [] } });
  }

  return { AND: and };
}

const MOVEMENT_SELECT = {
  id: true,
  date: true,
  amount: true,
  kind: true,
  description: true,
  created_at: true,
  cancelled_at: true,
  cancel_reason: true,
  statement_line: { select: { id: true } },
  account: { select: { id: true, name: true } },
  concept: { select: { id: true, name: true } },
  transfer: { select: { id: true, number: true } },
  payment_order_payment: { select: { payment_order: { select: { id: true, number: true } } } },
  customer_receipt_payment: { select: { receipt: { select: { id: true, number: true } } } },
  check_operation: { select: { id: true, number: true } },
  third_party_check_id: true,
  own_check: { select: { id: true, number: true, payment_order_payment: { select: { payment_order: { select: { id: true, number: true } } } } } },
} as const;

function shape(rows: Prisma.treasury_movementsGetPayload<{ select: typeof MOVEMENT_SELECT }>[]) {
  return rows.map((r) => {
    // El débito de un cheque propio (OWN_CHECK) cuelga del cheque, que cuelga del medio de la orden.
    const order = r.payment_order_payment?.payment_order ?? r.own_check?.payment_order_payment?.payment_order ?? null;
    const receipt = r.customer_receipt_payment?.receipt ?? null;
    return {
      id: r.id,
      // Fecha valor (@db.Date): se toma el dia tal cual, sin correr zona horaria
      date: r.date.toISOString().slice(0, 10),
      amount: r.amount.toString(),
      kind: r.kind,
      description: r.description,
      created_at: r.created_at,
      cancelled: r.cancelled_at != null,
      cancel_reason: r.cancel_reason,
      // Conciliado = ya tiene una linea de extracto bancario asociada
      reconciled: r.statement_line !== null,
      account: { id: r.account.id, name: r.account.name },
      concept: r.concept ? { id: r.concept.id, name: r.concept.name } : null,
      transfer: r.transfer ? { id: r.transfer.id, number: r.transfer.number } : null,
      paymentOrder: order ? { id: order.id, number: order.number } : null,
      customerReceipt: receipt ? { id: receipt.id, number: receipt.number } : null,
      // Operacion de cheques (deposito, descuento, rechazo, carga inicial): sin numero = carga inicial
      checkOperation: r.check_operation
        ? { id: r.check_operation.id, number: r.check_operation.number ?? OPENING_OPERATION_LABEL, checkId: r.third_party_check_id }
        : null,
      ownCheck: r.own_check ? { id: r.own_check.id, number: r.own_check.number } : null,
    };
  });
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getTreasuryMovementsPaginated(searchParams: DataTableSearchParams) {
  const companyId = await resolveCompanyId();
  if (!companyId) return { data: [], total: 0 };

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = safePaging(state);
    const where = buildWhereClause(companyId, state);

    const resolvedSorts: MovementOrderBy[] = [];
    for (const s of state.sorting) {
      const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
      const mapper = ownEntry(SORT_MAP, s.id);
      if (mapper) resolvedSorts.push(...mapper(dir));
      else if (VALID_SORT_FIELDS.has(s.id)) resolvedSorts.push({ [s.id]: dir });
    }
    const orderBy: MovementOrderBy[] = [...resolvedSorts, { date: 'desc' }, { created_at: 'desc' }];

    const [rows, total] = await Promise.all([
      prisma.treasury_movements.findMany({ where, orderBy, skip, take, select: MOVEMENT_SELECT }),
      prisma.treasury_movements.count({ where }),
    ]);
    return { data: shape(rows), total };
  } catch (error) {
    logger.error('Error al obtener movimientos de tesoreria', { data: { error } });
    throw new Error('No se pudo obtener la lista de movimientos');
  }
}

// ============================================================================
// EXPORT (sin paginacion)
// ============================================================================

export async function getAllTreasuryMovementsForExport(searchParams: DataTableSearchParams) {
  const companyId = await resolveCompanyId();
  if (!companyId) return [];

  try {
    const state = parseSearchParams(searchParams);
    const where = buildWhereClause(companyId, state);
    const rows = await prisma.treasury_movements.findMany({
      where,
      orderBy: [{ date: 'desc' }, { created_at: 'desc' }],
      select: MOVEMENT_SELECT,
    });
    return shape(rows);
  } catch (error) {
    logger.error('Error al exportar movimientos de tesoreria', { data: { error } });
    throw new Error('No se pudo exportar la lista de movimientos');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, con cross-filter)
// ============================================================================

export async function getTreasuryMovementSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{ counts: Map<string, number>; resolvedOptions?: Array<{ id: string; name: string | null }> } | null> {
  const companyId = await resolveCompanyId();
  if (!companyId) return null;

  const parsed = searchParams && Object.keys(searchParams).length > 0 ? parseSearchParams(searchParams) : null;

  /** WHERE con todos los filtros activos MENOS el de la columna que se esta abriendo. */
  function crossWhere(excludeColumn: string): MovementWhere {
    const base: FilterState = parsed ?? parseSearchParams({});
    const filters = { ...base.filters };
    delete filters[excludeColumn];
    return buildWhereClause(companyId as string, { ...base, filters });
  }

  function toFacetMap(rows: { key: string | null; count: number }[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const { key, count } of rows) {
      const k = key == null ? NULL_FILTER_VALUE : key;
      map.set(k, (map.get(k) ?? 0) + count);
    }
    return map;
  }

  try {
    // La columna 'state' es la unica cuyo id no coincide con el filtro de la URL
    const where = crossWhere(columnId);

    if (columnId === 'kind') {
      const rows = await prisma.treasury_movements.groupBy({ by: ['kind'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: r.kind, count: r._count }))) };
    }

    if (columnId === 'state') {
      const [active, reconciled, cancelled] = await Promise.all([
        prisma.treasury_movements.count({ where: { AND: [where, { cancelled_at: null }] } }),
        prisma.treasury_movements.count({
          where: { AND: [where, { cancelled_at: null, statement_line: { isNot: null } }] },
        }),
        prisma.treasury_movements.count({ where: { AND: [where, { cancelled_at: { not: null } }] } }),
      ]);
      return {
        counts: new Map([
          ['ACTIVE', active],
          ['RECONCILED', reconciled],
          ['CANCELLED', cancelled],
        ]),
      };
    }

    if (columnId === 'account') {
      const rows = await prisma.treasury_movements.groupBy({ by: ['account_id'], where, _count: true });
      const ids = rows.map((r) => r.account_id);
      const accounts = ids.length
        ? await prisma.treasury_accounts.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : [];
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.account_id, count: r._count }))),
        resolvedOptions: accounts,
      };
    }

    if (columnId === 'concept') {
      const rows = await prisma.treasury_movements.groupBy({ by: ['concept_id'], where, _count: true });
      const ids = rows.flatMap((r) => (r.concept_id ? [r.concept_id] : []));
      const concepts = ids.length
        ? await prisma.treasury_concepts.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : [];
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.concept_id, count: r._count }))),
        resolvedOptions: concepts,
      };
    }

    logger.warn('Facet no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet de movimientos de tesoreria', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// TIPOS
// ============================================================================

export type TreasuryMovementListItem = Awaited<ReturnType<typeof getTreasuryMovementsPaginated>>['data'][number];
