import { ExportTooLargeError, fetchExportRowsInBatches, tooManyRowsMessage } from '@/shared/lib/export-batches';
import moment from 'moment';
import 'server-only';
import { DUE_INVOICES_EXPORT_MAX_ROWS } from '../Payments/DueInvoicesList/constants';

import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/lib/prisma';
import { INVOICE_SELECT, shape, type FilterState, type InvoiceWhere } from './due-invoices';
import { shapeDebt, type OpenDebt } from './due-invoices-debts';

type LightRow = {
  kind: 'INVOICE' | 'CHECK';
  id: string;
  supplier: string;
  salesPoint: number;
  number: bigint;
  cbteType: number | null;
  issue: number;
  due: number | null;
  total: Prisma.Decimal;
  pending: Prisma.Decimal;
};

const nullsLast = (a: number | null, b: number | null, dir: number) =>
  a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : dir * (a - b);

/** Comparador por columna (en memoria), para ordenar facturas y deudas de cheques en una sola lista. */
const LIGHT_COMPARATORS: Record<string, (a: LightRow, b: LightRow, dir: number) => number> = {
  supplier: (a, b, dir) => dir * a.supplier.localeCompare(b.supplier),
  number: (a, b, dir) =>
    dir * (a.salesPoint - b.salesPoint || (a.number < b.number ? -1 : a.number > b.number ? 1 : 0)),
  cbte_type: (a, b, dir) => nullsLast(a.cbteType, b.cbteType, dir),
  issue_date: (a, b, dir) => dir * (a.issue - b.issue),
  due_date: (a, b, dir) => nullsLast(a.due, b.due, dir),
  days: (a, b, dir) => nullsLast(a.due, b.due, dir),
  total: (a, b, dir) => dir * a.total.comparedTo(b.total),
  pending: (a, b, dir) => dir * a.pending.comparedTo(b.pending),
};

function compareLight(state: FilterState) {
  const sorts = state.sorting.flatMap((s) => {
    const cmp = Object.hasOwn(LIGHT_COMPARATORS, s.id) ? LIGHT_COMPARATORS[s.id] : undefined;
    return cmp ? [{ cmp, dir: s.desc ? -1 : 1 }] : [];
  });
  return (a: LightRow, b: LightRow) => {
    for (const { cmp, dir } of sorts) {
      const r = cmp(a, b, dir);
      if (r !== 0) return r;
    }
    // Orden por defecto: vencimiento, emision y numero
    return (
      nullsLast(a.due, b.due, 1) ||
      a.issue - b.issue ||
      (a.number < b.number ? -1 : a.number > b.number ? 1 : 0) ||
      a.id.localeCompare(b.id)
    );
  };
}

/**
 * Lista unificada (facturas + deudas por cheques rechazados): solo se usa cuando hay deudas que
 * pasan los filtros. Ordena TODO el conjunto filtrado en memoria y pagina por ids (igual que el
 * orden por pendiente), asi el orden vale para todas las paginas.
 */
export async function listUnified(
  where: InvoiceWhere,
  state: FilterState,
  pendingMap: Map<string, string>,
  debts: OpenDebt[],
  page: { skip: number; take: number } | null,
  companyId: string
) {
  const invoices = await prisma.supplier_invoices.findMany({
    where,
    select: {
      id: true,
      cbte_type: true,
      sales_point: true,
      number: true,
      issue_date: true,
      due_date: true,
      total: true,
      supplier: { select: { name: true } },
    },
  });
  const light: LightRow[] = [
    ...invoices.map(
      (i): LightRow => ({
        kind: 'INVOICE',
        id: i.id,
        supplier: i.supplier.name,
        salesPoint: i.sales_point,
        number: i.number,
        cbteType: i.cbte_type,
        issue: i.issue_date.getTime(),
        due: i.due_date ? i.due_date.getTime() : null,
        total: new Prisma.Decimal(i.total),
        pending: new Prisma.Decimal(pendingMap.get(i.id) ?? 0),
      })
    ),
    ...debts.map((d): LightRow => {
      const due = moment.utc(d.rejected_on, 'YYYY-MM-DD', true).valueOf();
      return {
        kind: 'CHECK',
        id: d.id,
        supplier: d.supplier_name,
        salesPoint: -1,
        number: BigInt(0),
        cbteType: null,
        issue: due,
        due,
        total: new Prisma.Decimal(d.amount),
        pending: new Prisma.Decimal(d.pending),
      };
    }),
  ].sort(compareLight(state));

  // Export (sin pagina): el conjunto completo tiene tope y las facturas se traen por tandas
  if (!page && light.length > DUE_INVOICES_EXPORT_MAX_ROWS)
    throw new ExportTooLargeError(tooManyRowsMessage('comprobantes')(DUE_INVOICES_EXPORT_MAX_ROWS));

  const slice = page ? light.slice(page.skip, page.skip + page.take) : light;
  const invoiceIds = slice.filter((r) => r.kind === 'INVOICE').map((r) => r.id);
  const rows = !invoiceIds.length
    ? []
    : page
      ? await prisma.supplier_invoices.findMany({ where: { id: { in: invoiceIds } }, select: INVOICE_SELECT })
      : await fetchExportRowsInBatches({
          maxRows: DUE_INVOICES_EXPORT_MAX_ROWS,
          listIds: async (take) => invoiceIds.slice(0, take).map((id) => ({ id })),
          fetchByIds: (ids) =>
            prisma.supplier_invoices.findMany({
              where: { id: { in: ids }, company_id: companyId },
              select: INVOICE_SELECT,
            }),
          tooLargeMessage: tooManyRowsMessage('comprobantes'),
        });
  const shapedInvoices = new Map(shape(rows, pendingMap).map((r) => [r.id, r]));
  const debtsById = new Map(debts.map((d) => [d.id, d]));

  const data = slice.flatMap((r) => {
    if (r.kind === 'INVOICE') {
      const item = shapedInvoices.get(r.id);
      return item ? [item] : [];
    }
    const debt = debtsById.get(r.id);
    return debt ? [shapeDebt(debt)] : [];
  });
  return { data, total: light.length };
}
