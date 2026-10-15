'use server';

import { amountOf } from '@/features/Comercial/Facturacion/lib/invoice-math';
import { checkPermissionServer } from '@/features/Permissions';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import moment from 'moment';
import { UUID_RE } from '../lib/action-errors';
import { getCustomerStatement } from '../lib/customer-statement';
import { COLLECTABLE_CBTE_TYPES, isCollectable } from '../lib/receipt-rules';
import { invoiceBalanceSql, invoiceBalances } from '../lib/receivables';
import { TreasuryError } from '../lib/treasury-errors';
import { isCalendarDay } from '../schemas/shared';
import { localToday } from './shared';

/**
 * Lecturas de Cobranzas fuera del recibo (spec Tesorería etapa 2 §4): cuenta corriente del
 * cliente, resumen de "A cobrar", clientes para elegir y el pendiente que muestra la factura en
 * Comercial. Todo con `tesoreria:cobranzas:view`.
 */

const logger = new Logger('features/Treasury/customer-statement');

const canView = () => checkPermissionServer('tesoreria', 'cobranzas', 'view');

/** Buscar clientes lo hacen también quienes cargan cheques (carga inicial): ya veían el catálogo en ese formulario. */
const canSearchCustomers = async () => (await canView()) || (await checkPermissionServer('tesoreria', 'cheques', 'create'));

/** Cuenta corriente del cliente entre `from` y `to` (null si no existe o sin permiso). */
export async function getCustomerStatementData(customerId: string, from: string, to: string) {
  if (!(await canView())) return null;
  if (!UUID_RE.test(customerId) || !isCalendarDay(from) || !isCalendarDay(to)) return null;
  const companyId = await getActiveCompanyId();
  try {
    return { from, to, ...(await getCustomerStatement(prisma, companyId, customerId, from, to)) };
  } catch (error) {
    if (error instanceof TreasuryError) return null;
    logger.error('Error al leer la cuenta corriente', { data: { error, customerId } });
    throw error;
  }
}

export type CustomerStatementData = NonNullable<Awaited<ReturnType<typeof getCustomerStatementData>>>;

/**
 * Clientes para los selectores de Cobranzas: por razón social o CUIT (prefijo de 3 a 11 dígitos).
 * `activeOnly` para un recibo nuevo; la cuenta corriente busca también los dados de baja.
 * Cada resultado trae además `name` y `cuit` por separado (para precargar al librador de un cheque).
 */
export async function searchCollectionCustomers(query: string, activeOnly = true) {
  if (!(await canSearchCustomers())) return { items: [], total: 0 };
  const companyId = await getActiveCompanyId();
  const term = query.trim();
  const digits = term.replace(/\D/g, '');
  const where: Prisma.customersWhereInput = {
    company_id: companyId,
    ...(activeOnly ? { is_active: true } : {}),
    ...(term
      ? {
          OR: [
            { name: { contains: term, mode: 'insensitive' as const } },
            ...(digits.length >= 3 && digits.length <= 11
              ? [{ cuit: { gte: BigInt(digits.padEnd(11, '0')), lte: BigInt(digits.padEnd(11, '9')) } }]
              : []),
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.customers.findMany({ where, select: { id: true, name: true, cuit: true, client_email: true, is_active: true }, orderBy: { name: 'asc' }, take: 30 }),
    prisma.customers.count({ where }),
  ]);
  return {
    items: rows.map((c) => ({
      id: c.id,
      label: `${c.name} · CUIT ${c.cuit.toString()}${c.is_active === false ? ' (inactivo)' : ''}`,
      email: c.client_email,
      name: c.name,
      cuit: c.cuit.toString(),
    })),
    total,
  };
}

/** Totales de "A cobrar" por moneda: vencido y a vencer en los próximos 30 días. */
export async function getReceivablesSummary() {
  if (!(await canView())) return [];
  const companyId = await getActiveCompanyId();
  const today = localToday();
  const limit = moment(today, 'YYYY-MM-DD').add(30, 'days').format('YYYY-MM-DD');
  const where = Prisma.sql`i.company_id = ${companyId}::uuid AND i.status = 'autorizada' AND i.cbte_type = ANY(${[...COLLECTABLE_CBTE_TYPES]}::int[])`;
  const rows = await prisma.$queryRaw<{ currency: string; overdue: string; due_soon: string; total: string; count: bigint }[]>`
    SELECT b.currency,
           COALESCE(SUM(b.pending) FILTER (WHERE b.due_date < ${today}::date), 0)::numeric(15,2)::text AS overdue,
           COALESCE(SUM(b.pending) FILTER (WHERE b.due_date >= ${today}::date AND b.due_date <= ${limit}::date), 0)::numeric(15,2)::text AS due_soon,
           SUM(b.pending)::numeric(15,2)::text AS total,
           COUNT(*) AS count
    FROM (${invoiceBalanceSql(where, null)}) b
    WHERE b.pending > 0
    GROUP BY b.currency
    ORDER BY (b.currency = 'ARS') DESC, b.currency
  `;
  return rows.map((r) => ({ currency: r.currency.trim(), overdue: r.overdue, dueSoon: r.due_soon, total: r.total, count: Number(r.count) }));
}

export type ReceivablesSummary = Awaited<ReturnType<typeof getReceivablesSummary>>;

export type InvoiceReceivableState = 'PENDING' | 'IN_DRAFT' | 'COLLECTED' | 'NO_BALANCE';

/**
 * Pendiente de cobro de un comprobante, para el detalle de la factura en Comercial. null sin
 * permiso, si no es cobrable o si no está autorizado. `state`: con saldo libre, reservado en un
 * borrador, cobrado, o sin saldo por notas de crédito (sin cobros).
 */
export async function getInvoiceReceivable(
  invoiceId: string
): Promise<{ pending: string; reserved: string; currency: string; customerId: string; state: InvoiceReceivableState } | null> {
  if (!(await canView())) return null;
  if (!UUID_RE.test(invoiceId)) return null;
  const companyId = await getActiveCompanyId();
  const balance = (await invoiceBalances(prisma, [invoiceId])).get(invoiceId);
  if (!balance || balance.companyId !== companyId || balance.status !== 'autorizada' || !isCollectable(balance.cbteType)) return null;
  const positive = (value: string) => amountOf(value) > BigInt(0);
  const state: InvoiceReceivableState = positive(balance.pending)
    ? 'PENDING'
    : positive(balance.reserved)
      ? 'IN_DRAFT'
      : positive(balance.collected)
        ? 'COLLECTED'
        : 'NO_BALANCE';
  return { pending: balance.pending, reserved: balance.reserved, currency: balance.currency, customerId: balance.customerId, state };
}
