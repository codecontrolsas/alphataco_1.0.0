'use server';

import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { NULL_FILTER_VALUE, stateToPrismaParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { exportFailure, fetchExportRowsInBatches, tooManyRowsMessage } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { toFacetMap, withoutOwnFilter } from '@/shared/lib/table-facets';
import { resolveSorts, type SingleFacetResult } from '@/shared/lib/table-list-query';
import {
  DEFAULT_ORDER_BY,
  INVOICE_SELECT,
  SORT_MAP,
  VALID_SORT_FIELDS,
  buildWhereClause,
  parseListState,
  resolveCompanyId,
  shape,
  todayDate,
  type FilterState,
  type InvoiceOrderBy,
  type InvoiceWhere,
} from '../../lib/due-invoices';
import { debtMatches, loadOpenCheckDebts, todayText, type OpenDebt } from '../../lib/due-invoices-debts';
import { listUnified } from '../../lib/due-invoices-unified';
import { openInvoicePendingMap } from '../../lib/payment-balances';
import { getPaymentsSectionCount } from '../../lib/section-counts';
import { DUE_INVOICES_EXPORT_MAX_ROWS } from './constants';

const logger = new Logger('features/Purchases/Payments/DueInvoicesList');

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getDueInvoicesPaginated(searchParams: DataTableSearchParams) {
  const companyId = await resolveCompanyId();
  if (!companyId) return { data: [], total: 0 };

  try {
    const state = parseListState(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const pendingMap = await openInvoicePendingMap(prisma, companyId);
    const where = buildWhereClause(companyId, state, pendingMap);

    // Deudas por cheques rechazados que pasan los filtros: si hay, la lista es unificada
    const today = todayText();
    const debts = (await loadOpenCheckDebts(companyId)).filter((d) => debtMatches(d, state, today));
    if (debts.length > 0) return await listUnified(where, state, pendingMap, debts, { skip, take }, companyId);

    // Pendiente: no es un campo de la tabla (sale del mapa), asi que cuando es el primer criterio
    // se ordena el conjunto filtrado completo en memoria y se pagina por ids. Sigue siendo
    // server-side (ordena TODAS las paginas, no solo la visible).
    const primary = state.sorting[0];
    if (primary?.id === 'pending') {
      const dir = primary.desc ? -1 : 1;
      const matches = await prisma.supplier_invoices.findMany({ where, select: { id: true } });
      const sorted = matches
        .map((m) => ({ id: m.id, pending: new Prisma.Decimal(pendingMap.get(m.id) ?? 0) }))
        .sort((a, b) => dir * a.pending.comparedTo(b.pending) || a.id.localeCompare(b.id));
      const pageIds = sorted.slice(skip, skip + take).map((m) => m.id);
      const rows = await prisma.supplier_invoices.findMany({ where: { id: { in: pageIds } }, select: INVOICE_SELECT });
      const byId = new Map(rows.map((r) => [r.id, r]));
      const ordered = pageIds.flatMap((id) => byId.get(id) ?? []);
      return { data: shape(ordered, pendingMap), total: sorted.length };
    }

    const resolvedSorts = resolveSorts<InvoiceOrderBy>(state.sorting, VALID_SORT_FIELDS, SORT_MAP);
    const orderBy: InvoiceOrderBy[] = resolvedSorts.length
      ? [...resolvedSorts, { issue_date: 'asc' }]
      : DEFAULT_ORDER_BY;

    const [rows, total] = await Promise.all([
      prisma.supplier_invoices.findMany({ where, orderBy, skip, take, select: INVOICE_SELECT }),
      prisma.supplier_invoices.count({ where }),
    ]);
    return { data: shape(rows, pendingMap), total };
  } catch (error) {
    logger.error('Error al obtener vencimientos', { data: { error } });
    throw new Error('No se pudo obtener la lista de vencimientos');
  }
}

// ============================================================================
// EXPORT (sin paginacion)
// ============================================================================

export async function getAllDueInvoicesForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<DueInvoiceListItem[]>> {
  const companyId = await resolveCompanyId();
  if (!companyId) return { ok: true, data: [] };

  try {
    const state = parseListState(searchParams);
    const pendingMap = await openInvoicePendingMap(prisma, companyId);
    const where = buildWhereClause(companyId, state, pendingMap);
    const today = todayText();
    const debts = (await loadOpenCheckDebts(companyId)).filter((d) => debtMatches(d, state, today));
    if (debts.length > 0)
      return { ok: true, data: (await listUnified(where, state, pendingMap, debts, null, companyId)).data };

    const orderBy: InvoiceOrderBy[] = [...DEFAULT_ORDER_BY, { id: 'asc' }];
    const rows = await fetchExportRowsInBatches({
      maxRows: DUE_INVOICES_EXPORT_MAX_ROWS,
      listIds: (take) => prisma.supplier_invoices.findMany({ where, orderBy, select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.supplier_invoices.findMany({
          where: { id: { in: ids }, company_id: companyId },
          select: INVOICE_SELECT,
        }),
      tooLargeMessage: tooManyRowsMessage('comprobantes'),
    });
    return { ok: true, data: shape(rows, pendingMap) };
  } catch (error) {
    logger.error('Error al exportar vencimientos', { data: { error } });
    return exportFailure(error, 'No se pudo exportar la lista de vencimientos. Intente nuevamente.');
  }
}

// ============================================================================
// BANDA DE ATENCION
// ============================================================================

/**
 * Comprobantes vencidos con saldo (`pagos:view`). Usa el mismo contador que la sub-navegacion
 * (`getPaymentsSectionCount`), que coincide con la lista filtrada por Días = Vencido. Nunca rechaza:
 * `null` si no corresponde o no se pudo contar (no se muestra la banda).
 */
export async function getDueInvoicesAttention(): Promise<{ overdue: number } | null> {
  try {
    const overdue = await getPaymentsSectionCount();
    return overdue == null ? null : { overdue };
  } catch (error) {
    logger.error('Error al contar vencimientos', { data: { error } });
    return null;
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, con cross-filter)
// ============================================================================

export async function getDueInvoiceSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<SingleFacetResult> {
  const companyId = await resolveCompanyId();
  if (!companyId) return null;

  const parsed = searchParams && Object.keys(searchParams).length > 0 ? parseListState(searchParams) : null;

  try {
    const pendingMap = await openInvoicePendingMap(prisma, companyId);

    /** WHERE con todos los filtros activos MENOS el de la columna que se esta abriendo. */
    const crossState = (excludeColumn: string): FilterState =>
      withoutOwnFilter(parsed ?? parseListState({}), excludeColumn);
    const crossWhere = (excludeColumn: string): InvoiceWhere =>
      buildWhereClause(companyId, crossState(excludeColumn), pendingMap);
    /** Deudas por cheques rechazados que pasan los filtros activos MENOS el de la columna. */
    const crossDebts = async (excludeColumn: string): Promise<OpenDebt[]> => {
      const state = crossState(excludeColumn);
      const today = todayText();
      return (await loadOpenCheckDebts(companyId)).filter((d) => debtMatches(d, state, today));
    };

    const where = crossWhere(columnId);

    if (columnId === 'cbte_type') {
      const rows = await prisma.supplier_invoices.groupBy({ by: ['cbte_type'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: r.cbte_type, count: r._count }))) };
    }

    if (columnId === 'days') {
      const today = todayDate();
      const [overdue, upcoming, none] = await Promise.all([
        prisma.supplier_invoices.count({ where: { AND: [where, { due_date: { lt: today } }] } }),
        prisma.supplier_invoices.count({ where: { AND: [where, { due_date: { gte: today } }] } }),
        prisma.supplier_invoices.count({ where: { AND: [where, { due_date: null }] } }),
      ]);
      const debts = await crossDebts('days');
      const today_ = todayText();
      const debtOverdue = debts.filter((d) => d.rejected_on < today_).length;
      return {
        counts: new Map([
          ['overdue', overdue + debtOverdue],
          ['upcoming', upcoming + (debts.length - debtOverdue)],
          ['none', none],
        ]),
      };
    }

    if (columnId === 'supplier') {
      const rows = await prisma.supplier_invoices.groupBy({ by: ['supplier_id'], where, _count: true });
      const debts = await crossDebts('supplier');
      const debtCounts = new Map<string, number>();
      for (const d of debts) debtCounts.set(d.supplier_id, (debtCounts.get(d.supplier_id) ?? 0) + 1);
      const ids = [...new Set([...rows.map((r) => r.supplier_id), ...debtCounts.keys()])];
      const suppliers = ids.length
        ? await prisma.suppliers.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : [];
      return {
        counts: toFacetMap([
          ...rows.map((r) => ({ key: r.supplier_id as string | null, count: r._count })),
          ...[...debtCounts].map(([key, count]) => ({ key: key as string | null, count })),
        ]),
        resolvedOptions: suppliers,
      };
    }

    if (columnId === 'orders') {
      // M:M: cuantos comprobantes (distintos) tiene cada orden en curso; sin orden = "Sin orden"
      const invoices = await prisma.supplier_invoices.findMany({
        where,
        select: { payment_lines: INVOICE_SELECT.payment_lines },
      });
      const counts = new Map<string, number>();
      const names = new Map<string, string>();
      for (const inv of invoices) {
        const seen = new Set<string>();
        for (const l of inv.payment_lines) {
          const order = l.payment_order;
          names.set(order.id, order.number);
          if (!seen.has(order.id)) {
            seen.add(order.id);
            counts.set(order.id, (counts.get(order.id) ?? 0) + 1);
          }
        }
        if (seen.size === 0) counts.set(NULL_FILTER_VALUE, (counts.get(NULL_FILTER_VALUE) ?? 0) + 1);
      }
      for (const debt of await crossDebts('orders')) {
        for (const o of debt.orders) {
          names.set(o.id, o.number);
          counts.set(o.id, (counts.get(o.id) ?? 0) + 1);
        }
        if (debt.orders.length === 0) counts.set(NULL_FILTER_VALUE, (counts.get(NULL_FILTER_VALUE) ?? 0) + 1);
      }
      const resolvedOptions = [...names.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => b.name.localeCompare(a.name));
      return { counts, resolvedOptions };
    }

    logger.warn('Facet no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet de vencimientos', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// TIPOS
// ============================================================================

export type DueInvoiceListItem = Awaited<ReturnType<typeof getDueInvoicesPaginated>>['data'][number];
