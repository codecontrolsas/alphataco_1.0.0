'use server';

import { AMOUNT_SCALE, formatScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';
import { checkPermissionServer } from '@/features/Permissions';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { UUID_RE } from '../lib/action-errors';
import { cents } from '../lib/check-helpers';
import { depositDeadline, depositWarning, depositWarningCutoffs } from '../lib/checks-dates';
import { customerCheckDebts, supplierCheckDebts } from '../lib/rejected-checks';
import { localToday } from './shared';
import { isoDay } from '../lib/dates';

/** Lecturas de la cartera de cheques de terceros (detalle, encabezado, datos de los formularios de operación). Sin efectos. */

/** Detalle del cheque: datos, aviso de vencimiento, historial con sus documentos, deudas y la última operación anulable. */
export async function getCheckDetail(checkId: string) {
  if (!(await checkPermissionServer('tesoreria', 'cheques', 'view'))) return null;
  if (!UUID_RE.test(checkId)) return null;
  const companyId = await getActiveCompanyId();
  const row = await prisma.third_party_checks.findFirst({
    where: { id: checkId, company_id: companyId },
    select: {
      id: true,
      kind: true,
      number: true,
      bank: true,
      drawer_name: true,
      drawer_cuit: true,
      issue_date: true,
      payment_date: true,
      amount: true,
      status: true,
      credited_on: true,
      rejected_from: true,
      opening_operation_id: true,
      customer: { select: { id: true, name: true } },
      portfolio: { select: { id: true, name: true } },
      bank_account: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true } },
      receipt_payment: { select: { receipt: { select: { id: true, number: true } } } },
      events: {
        orderBy: { created_at: 'asc' },
        select: {
          id: true,
          from_status: true,
          to_status: true,
          date: true,
          created_at: true,
          user: { select: { fullname: true, email: true } },
          operation: { select: { id: true, kind: true, number: true } },
          receipt: { select: { id: true, number: true } },
          payment_order: { select: { id: true, number: true } },
        },
      },
      operation_items: {
        where: { operation: { cancelled_at: null, kind: { not: 'OPENING' } } },
        orderBy: { operation: { created_at: 'desc' } },
        take: 1,
        select: { operation: { select: { id: true, kind: true, number: true, date: true, reason: true, returned_by: true, interest: true, fee: true } } },
      },
      payment_payments: {
        where: { payment_order: { status: 'PAID' } },
        take: 1,
        select: { payment_order: { select: { id: true, number: true, paid_on: true } } },
      },
    },
  });
  if (!row) return null;
  const today = localToday();
  const paymentDate = isoDay(row.payment_date);
  const [customerDebt, supplierDebt] =
    row.status === 'REJECTED'
      ? await Promise.all([customerCheckDebts(prisma, [row.id]), supplierCheckDebts(prisma, [row.id])])
      : [new Map(), new Map()];
  const opLabel = (op: { kind: string; number: string | null }) => (op.kind === 'OPENING' ? 'Carga inicial' : (op.number ?? ''));
  const last = row.operation_items[0]?.operation ?? null;
  const endorsement = row.status === 'ENDORSED' || row.rejected_from === 'ENDORSED' ? (row.payment_payments[0]?.payment_order ?? null) : null;
  return {
    id: row.id,
    kind: row.kind,
    number: row.number,
    bank: row.bank,
    drawerName: row.drawer_name,
    drawerCuit: row.drawer_cuit,
    issueDate: isoDay(row.issue_date),
    paymentDate,
    depositDeadline: depositDeadline(paymentDate),
    depositWarning: row.status === 'IN_PORTFOLIO' ? depositWarning(paymentDate, today) : 'OK',
    amount: row.amount.toFixed(2),
    status: row.status,
    creditedOn: row.credited_on ? isoDay(row.credited_on) : null,
    rejectedFrom: row.rejected_from,
    customer: row.customer,
    portfolio: row.portfolio,
    bankAccount: row.bank_account,
    supplier: row.supplier,
    receipt: row.receipt_payment?.receipt ?? null,
    fromOpening: row.opening_operation_id !== null,
    events: row.events.map((e) => ({
      id: e.id,
      fromStatus: e.from_status,
      toStatus: e.to_status,
      date: isoDay(e.date),
      createdAt: e.created_at.toISOString(),
      user: e.user.fullname ?? e.user.email ?? '',
      document: e.operation
        ? { label: opLabel(e.operation), href: null }
        : e.receipt
          ? { label: e.receipt.number ?? 'Recibo', href: `/dashboard/treasury/receipts/${e.receipt.id}` }
          : e.payment_order
            ? { label: e.payment_order.number, href: `/dashboard/purchases/payments/${e.payment_order.id}` }
            : null,
    })),
    customerDebt: customerDebt.get(row.id) ?? null,
    supplierDebt: supplierDebt.get(row.id) ?? null,
    /** Lo que se puede anular desde el cheque: su última operación vigente (o la OP que lo endosó, que se anula en Compras). */
    lastOperation: last
      ? {
          id: last.id,
          kind: last.kind,
          number: last.number,
          date: isoDay(last.date),
          reason: last.reason,
          returnedBy: last.returned_by,
          interest: last.interest.toFixed(2),
          fee: last.fee.toFixed(2),
        }
      : null,
    endorsement: endorsement ? { id: endorsement.id, number: endorsement.number, paidOn: endorsement.paid_on ? isoDay(endorsement.paid_on) : null } : null,
  };
}

/** Encabezado de la tab: total en cartera por cartera y cuántos cheques vencen pronto o ya vencieron para depositar. */
export async function getChecksHeader() {
  if (!(await checkPermissionServer('tesoreria', 'cheques', 'view'))) return null;
  const companyId = await getActiveCompanyId();
  const { expiredBefore, warnUntil } = depositWarningCutoffs(localToday());
  const inPortfolio = { company_id: companyId, status: 'IN_PORTFOLIO' as const };
  // Todo se agrega en la base: ni los cheques ni sus importes viajan a JS para sumarlos.
  const [portfolios, totals, expired, warned] = await Promise.all([
    prisma.treasury_accounts.findMany({
      where: { company_id: companyId, kind: 'CHECK_PORTFOLIO', is_active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.third_party_checks.groupBy({ by: ['portfolio_id'], where: inPortfolio, _sum: { amount: true }, _count: { _all: true } }),
    prisma.third_party_checks.count({ where: { ...inPortfolio, payment_date: { lt: new Date(`${expiredBefore}T00:00:00.000Z`) } } }),
    prisma.third_party_checks.count({ where: { ...inPortfolio, payment_date: { lte: new Date(`${warnUntil}T00:00:00.000Z`) } } }),
  ]);
  const byPortfolio = new Map(totals.map((t) => [t.portfolio_id, { total: cents(t._sum.amount ? t._sum.amount.toFixed(2) : '0'), count: t._count._all }]));
  return {
    portfolios: portfolios.map((p) => ({
      id: p.id,
      name: p.name,
      total: formatScaled(byPortfolio.get(p.id)?.total ?? BigInt(0), AMOUNT_SCALE),
      count: byPortfolio.get(p.id)?.count ?? 0,
    })),
    // `warned` incluye los vencidos: "por vencer" son los que aún no pasaron el plazo.
    dueSoon: warned - expired,
    expired,
  };
}

/** Para los formularios de depósito y descuento: los cheques elegidos (solo EN CARTERA) y las cuentas bancarias activas. */
export async function getCheckOperationFormData(checkIds: string[]) {
  if (!(await checkPermissionServer('tesoreria', 'cheques', 'create'))) return null;
  const ids = checkIds.filter((id) => UUID_RE.test(id)).slice(0, 200);
  const companyId = await getActiveCompanyId();
  const [checks, banks, portfolios] = await Promise.all([
    ids.length
      ? prisma.third_party_checks.findMany({
          where: { id: { in: ids }, company_id: companyId, status: 'IN_PORTFOLIO' },
          select: { id: true, number: true, bank: true, drawer_name: true, amount: true, payment_date: true },
          orderBy: { payment_date: 'asc' },
        })
      : Promise.resolve([]),
    prisma.treasury_accounts.findMany({ where: { company_id: companyId, kind: 'BANK', is_active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.treasury_accounts.findMany({ where: { company_id: companyId, kind: 'CHECK_PORTFOLIO', is_active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  return {
    today: localToday(),
    checks: checks.map((c) => ({ id: c.id, number: c.number, bank: c.bank, drawerName: c.drawer_name, amount: c.amount.toFixed(2), paymentDate: isoDay(c.payment_date) })),
    banks,
    portfolios,
  };
}
