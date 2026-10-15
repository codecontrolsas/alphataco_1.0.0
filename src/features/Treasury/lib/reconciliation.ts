import 'server-only';

import { Prisma } from '@/generated/prisma/client';
import { AUTO_MATCH_DAYS } from '../schemas/reconciliation';
import { TreasuryError } from './treasury-errors';
import { UUID_RE } from '../schemas/shared';
import { compareAmounts } from '@/features/Comercial/Facturacion/lib/invoice-math';

/**
 * Conciliación bancaria (spec Tesorería etapa 4 §3): ÚNICA escritura del estado de las líneas del
 * extracto. Toda operación sobre una cuenta toma primero su candado (`lockAccountReconciliation`):
 * las operaciones de una misma cuenta se serializan y dos usuarios no concilian el mismo movimiento.
 */

type RawTx = Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'>;


export type BankLineStatus = 'PENDING' | 'MATCHED' | 'CREATED' | 'IGNORED';

export type LockedLine = {
  id: string;
  accountId: string;
  statementId: string;
  date: string;
  amount: string;
  description: string;
  status: BankLineStatus;
  movementId: string | null;
};

/** Candado de la conciliación de una cuenta (advisory lock de la transacción). */
export async function lockAccountReconciliation(tx: RawTx, accountId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`reconcile:${accountId}`}, 0))`;
}

/** La línea de la empresa, con `FOR UPDATE`, después de tomar el candado de su cuenta. */
export async function lockLine(tx: RawTx, companyId: string, lineId: string): Promise<LockedLine> {
  if (!UUID_RE.test(lineId)) throw new TreasuryError('La línea no existe');
  const peek = await tx.$queryRaw<{ account_id: string }[]>`
    SELECT account_id FROM bank_statement_lines WHERE id = ${lineId}::uuid AND company_id = ${companyId}::uuid
  `;
  if (!peek[0]) throw new TreasuryError('La línea no existe');
  await lockAccountReconciliation(tx, peek[0].account_id);
  const rows = await tx.$queryRaw<
    { id: string; account_id: string; statement_id: string; date: string; amount: string; description: string; status: BankLineStatus; movement_id: string | null }[]
  >`
    SELECT id, account_id, statement_id, date::text AS date, amount::text AS amount, description, status::text AS status, movement_id
    FROM bank_statement_lines WHERE id = ${lineId}::uuid FOR UPDATE
  `;
  const r = rows[0];
  // Se borró la importación entre la primera lectura y el candado.
  if (!r) throw new TreasuryError('La línea no existe');
  return { id: r.id, accountId: r.account_id, statementId: r.statement_id, date: r.date, amount: r.amount, description: r.description, status: r.status, movementId: r.movement_id };
}

export function assertPending(line: LockedLine): void {
  if (line.status !== 'PENDING') throw new TreasuryError('La línea ya no está pendiente: actualizá la pantalla');
}

/** El movimiento es de la cuenta, está vigente, no está conciliado y tiene el importe de la línea. */
export async function lockMatchableMovement(tx: RawTx, line: LockedLine, movementId: string): Promise<void> {
  if (!UUID_RE.test(movementId)) throw new TreasuryError('El movimiento no existe');
  const rows = await tx.$queryRaw<{ account_id: string; amount: string; cancelled: boolean; reconciled: boolean }[]>`
    SELECT m.account_id, m.amount::text AS amount, m.cancelled_at IS NOT NULL AS cancelled,
           EXISTS (SELECT 1 FROM bank_statement_lines bl WHERE bl.movement_id = m.id) AS reconciled
    FROM treasury_movements m WHERE m.id = ${movementId}::uuid FOR UPDATE OF m
  `;
  const m = rows[0];
  if (!m || m.account_id !== line.accountId) throw new TreasuryError('El movimiento no existe');
  if (m.cancelled) throw new TreasuryError('El movimiento está anulado');
  if (m.reconciled) throw new TreasuryError('El movimiento ya está conciliado con otra línea');
  if (compareAmounts(m.amount, line.amount) !== 0) throw new TreasuryError('El movimiento no tiene el importe de la línea');
}

/** Cambia el estado de la línea (con lo que exige el estado nuevo). */
export async function setLineStatus(
  tx: Pick<Prisma.TransactionClient, 'bank_statement_lines'>,
  lineId: string,
  status: BankLineStatus,
  input: { userId: string; movementId?: string; ignoreReason?: string }
): Promise<void> {
  const reconciled = status === 'PENDING' ? { reconciled_by: null, reconciled_at: null } : { reconciled_by: input.userId, reconciled_at: new Date() };
  await tx.bank_statement_lines.update({
    where: { id: lineId },
    data: {
      status,
      movement_id: status === 'MATCHED' || status === 'CREATED' ? (input.movementId ?? null) : null,
      ignore_reason: status === 'IGNORED' ? (input.ignoreReason ?? null) : null,
      ...reconciled,
    },
  });
}

/**
 * Conciliación automática de las líneas pendientes de una cuenta (spec §3.2): mismo importe, fecha a
 * ±3 días, ambos sin conciliar; solo los pares donde la línea tiene un único candidato y ese
 * movimiento es candidato de una sola línea. Supone el candado de la cuenta tomado. Devuelve cuántas concilió.
 */
export async function autoMatchAccount(tx: Prisma.TransactionClient, accountId: string, userId: string): Promise<number> {
  const pairs = await tx.$queryRaw<{ line_id: string; movement_id: string }[]>`
    SELECT l.id AS line_id, m.id AS movement_id
    FROM bank_statement_lines l
    JOIN treasury_movements m
      ON m.account_id = l.account_id AND m.amount = l.amount AND m.cancelled_at IS NULL
     AND m.date BETWEEN l.date - ${AUTO_MATCH_DAYS}::int AND l.date + ${AUTO_MATCH_DAYS}::int
     AND NOT EXISTS (SELECT 1 FROM bank_statement_lines x WHERE x.movement_id = m.id)
    WHERE l.account_id = ${accountId}::uuid AND l.status = 'PENDING'
  `;
  const perLine = new Map<string, string[]>();
  const perMovement = new Map<string, number>();
  for (const p of pairs) {
    perLine.set(p.line_id, [...(perLine.get(p.line_id) ?? []), p.movement_id]);
    perMovement.set(p.movement_id, (perMovement.get(p.movement_id) ?? 0) + 1);
  }
  const unique = [...perLine.entries()].filter(([, ms]) => ms.length === 1 && perMovement.get(ms[0]!) === 1).map(([line, ms]) => ({ line, movement: ms[0]! }));
  if (unique.length === 0) return 0;
  // Los movimientos se bloquean (otra anulación compite por ellos) y se vuelve a mirar que sigan vigentes.
  const ids = unique.map((u) => u.movement).sort();
  const alive = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM treasury_movements WHERE id = ANY(${ids}::uuid[]) AND cancelled_at IS NULL ORDER BY id FOR UPDATE
  `;
  const aliveIds = new Set(alive.map((a) => a.id));
  let matched = 0;
  for (const u of unique) {
    if (!aliveIds.has(u.movement)) continue;
    await setLineStatus(tx, u.line, 'MATCHED', { userId, movementId: u.movement });
    matched += 1;
  }
  return matched;
}

/** Rango de fechas de una importación (para el resumen y el panel del libro). */
export function statementRange(lines: { date: string }[]): { from: string; to: string } | null {
  if (lines.length === 0) return null;
  const dates = lines.map((l) => l.date).sort();
  return { from: dates[0]!, to: dates[dates.length - 1]! };
}

