import 'server-only';

import { Prisma } from '@/generated/prisma/client';
import type { treasury_movement_kind } from '@/generated/prisma/enums';
import { isFuture } from './movement-rules';
import { indicatorsFromBuckets, withRunningBalance, type AccountIndicators } from './statement-math';

/**
 * Única lectura de saldos (spec Tesorería etapa 1 §3). La clasificación pasado/futuro vive acá:
 * saldo = vigentes con fecha <= hoy; a debitar / a acreditar = vigentes negativos / positivos con
 * fecha > hoy. "Hoy" llega como parámetro (fecha local del servidor), nunca `CURRENT_DATE`.
 */

type BalancesDb = Pick<Prisma.TransactionClient, '$queryRaw' | 'treasury_movements'>;

export const ZERO_INDICATORS: AccountIndicators = { balance: '0.00', toDebit: '0.00', toCredit: '0.00', projected: '0.00' };

/**
 * Indicadores por cuenta en UNA consulta. Las cuentas sin movimientos no figuran (usar ZERO_INDICATORS).
 * Los cheques propios EMITIDOS (sin débito confirmado) suman a "A debitar" cualquiera sea su fecha
 * (spec Tesorería etapa 3b §3.8): no mueven el saldo hasta que alguien confirma el débito.
 */
export async function getAccountIndicators(
  db: BalancesDb,
  companyId: string,
  today: string,
  accountIds?: string[]
): Promise<Map<string, AccountIndicators>> {
  const onlyAccounts = accountIds ? Prisma.sql`AND account_id = ANY(${accountIds}::uuid[])` : Prisma.empty;
  const rows = await db.$queryRaw<{ account_id: string; balance: string; to_debit: string; to_credit: string }[]>`
    SELECT account_id,
           COALESCE(SUM(amount) FILTER (WHERE kind = 'BOOK' AND date <= ${today}::date), 0)::numeric(15,2)::text AS balance,
           COALESCE(SUM(amount) FILTER (WHERE kind = 'ISSUED' OR (date > ${today}::date AND amount < 0)), 0)::numeric(15,2)::text AS to_debit,
           COALESCE(SUM(amount) FILTER (WHERE kind = 'BOOK' AND date > ${today}::date AND amount > 0), 0)::numeric(15,2)::text AS to_credit
    FROM (
      SELECT 'BOOK' AS kind, account_id, date, amount FROM treasury_movements
      WHERE company_id = ${companyId}::uuid AND cancelled_at IS NULL ${onlyAccounts}
      UNION ALL
      SELECT 'ISSUED', account_id, payment_date, -amount FROM own_checks
      WHERE company_id = ${companyId}::uuid AND status = 'ISSUED' ${onlyAccounts}
    ) t
    GROUP BY account_id
  `;
  return new Map(rows.map((r) => [r.account_id, indicatorsFromBuckets({ balance: r.balance, toDebit: r.to_debit, toCredit: r.to_credit })]));
}

/** Cheques propios EMITIDOS de una cuenta (lo que forma su parte de "A debitar"), por fecha de pago. */
export async function getIssuedOwnChecks(db: Pick<Prisma.TransactionClient, 'own_checks'>, companyId: string, accountId: string) {
  const rows = await db.own_checks.findMany({
    where: { company_id: companyId, account_id: accountId, status: 'ISSUED' },
    orderBy: [{ payment_date: 'asc' }, { number: 'asc' }],
    select: { id: true, number: true, kind: true, amount: true, payment_date: true, supplier: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    kind: r.kind,
    amount: r.amount?.toFixed(2) ?? '0.00',
    paymentDate: r.payment_date ? r.payment_date.toISOString().slice(0, 10) : null,
    supplier: r.supplier?.name ?? null,
  }));
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Extracto de una cuenta entre `from` y `to` (inclusive): saldo anterior, filas con acumulado y saldo final. */
export async function getAccountStatement(db: BalancesDb, companyId: string, accountId: string, from: string, to: string, today: string) {
  const previousRows = await db.$queryRaw<{ previous: string }[]>`
    SELECT COALESCE(SUM(amount), 0)::numeric(15,2)::text AS previous
    FROM treasury_movements
    WHERE company_id = ${companyId}::uuid AND account_id = ${accountId}::uuid AND cancelled_at IS NULL AND date < ${from}::date
  `;
  const movements = await db.treasury_movements.findMany({
    where: { company_id: companyId, account_id: accountId, date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) } },
    orderBy: [{ date: 'asc' }, { created_at: 'asc' }],
    select: {
      id: true,
      date: true,
      amount: true,
      kind: true,
      description: true,
      cancelled_at: true,
      cancel_reason: true,
      concept: { select: { name: true } },
      transfer: { select: { id: true, number: true } },
      payment_order_payment: { select: { payment_order: { select: { id: true, number: true } } } },
      customer_receipt_payment: { select: { receipt: { select: { id: true, number: true } } } },
      check_operation: { select: { id: true, number: true, kind: true } },
      third_party_check: { select: { id: true, number: true } },
      statement_line: { select: { id: true } },
      own_check: { select: { id: true, number: true, payment_order_payment: { select: { payment_order: { select: { id: true, number: true } } } } } },
    },
  });
  const rows = movements.map((m) => {
    const date = isoDay(m.date);
    return {
      id: m.id,
      date,
      amount: m.amount.toFixed(2),
      kind: m.kind as treasury_movement_kind,
      concept: m.concept?.name ?? null,
      description: m.description,
      transfer: m.transfer,
      // El débito de un cheque propio (OWN_CHECK) cuelga del cheque, que cuelga del medio de la orden.
      paymentOrder: m.payment_order_payment?.payment_order ?? m.own_check?.payment_order_payment?.payment_order ?? null,
      ownCheck: m.own_check ? { id: m.own_check.id, number: m.own_check.number } : null,
      customerReceipt: m.customer_receipt_payment?.receipt ?? null,
      checkOperation: m.check_operation ? { id: m.check_operation.id, number: m.check_operation.number ?? 'Carga inicial', kind: m.check_operation.kind } : null,
      thirdPartyCheck: m.third_party_check,
      cancelled: m.cancelled_at !== null,
      cancelReason: m.cancel_reason,
      // Conciliado con una línea del extracto (etapa 4).
      reconciled: m.statement_line !== null,
      future: isFuture(date, today),
    };
  });
  const previous = previousRows[0]?.previous ?? '0.00';
  return { previous, ...withRunningBalance(previous, rows) };
}

export type AccountStatement = Awaited<ReturnType<typeof getAccountStatement>>;

/**
 * Saldo de la cuenta al final de `date` (vigentes con fecha <= date), sin contar `excludeMovementId`
 * (el movimiento que se está editando). Para mostrar en el formulario cómo queda la cuenta.
 */
export async function getBalanceOn(
  db: Pick<Prisma.TransactionClient, '$queryRaw'>,
  companyId: string,
  accountId: string,
  date: string,
  excludeMovementId?: string
): Promise<string> {
  const exclude = excludeMovementId ? Prisma.sql`AND id <> ${excludeMovementId}::uuid` : Prisma.empty;
  const rows = await db.$queryRaw<{ balance: string }[]>`
    SELECT COALESCE(SUM(amount), 0)::numeric(15,2)::text AS balance
    FROM treasury_movements
    WHERE company_id = ${companyId}::uuid AND account_id = ${accountId}::uuid AND cancelled_at IS NULL
      AND date <= ${date}::date ${exclude}
  `;
  return rows[0]?.balance ?? '0.00';
}
