import 'server-only';

import { AMOUNT_SCALE, formatScaled, parseScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';
import { Prisma } from '@/generated/prisma/client';
import { createMovement, dateOnly } from './movements';
import { nextOwnCheckStatus, normalizeCheckNumber, ownCheckTransitionError, type OwnCheckAction, type OwnCheckStatus } from './own-check-transitions';
import { TreasuryError } from './treasury-errors';
import { UUID_RE } from '../schemas/shared';
import { formatDay } from './dates';

/**
 * Cheques propios (spec Tesorería etapa 3b §3): ÚNICA escritura de `own_checks.status` y de su
 * historial (`own_check_events`). La emisión (en `registerPayment`) bloquea la chequera; las demás
 * operaciones bloquean los cheques con `lockOwnChecks` y aplican la transición con `moveOwnCheck`,
 * siempre dentro de su transacción. Los movimientos del libro los escribe `lib/movements.ts`.
 */

type OwnChecksTx = Pick<Prisma.TransactionClient, '$queryRaw' | 'own_checks' | 'own_check_events'>;
type RawTx = Pick<Prisma.TransactionClient, '$queryRaw'>;

const NUMBER_KEY = 'own_checks_number_key';

export type OwnCheckKind = 'PHYSICAL' | 'ECHECK';

export type LockedOwnCheck = {
  id: string;
  companyId: string;
  kind: OwnCheckKind;
  accountId: string;
  accountName: string;
  number: string;
  amount: string | null;
  issueDate: string;
  paymentDate: string | null;
  supplierId: string | null;
  status: OwnCheckStatus;
  debitedOn: string | null;
  paymentOrderPaymentId: string | null;
};

type LockedRow = {
  id: string;
  company_id: string;
  kind: OwnCheckKind;
  account_id: string;
  account_name: string;
  number: string;
  amount: string | null;
  issue_date: string;
  payment_date: string | null;
  supplier_id: string | null;
  status: OwnCheckStatus;
  debited_on: string | null;
  payment_order_payment_id: string | null;
};

/** Toma las filas de los cheques con `FOR UPDATE`, en orden de id. Si falta alguno: "El cheque no existe". */
export async function lockOwnChecks(tx: RawTx, companyId: string, ids: readonly string[]): Promise<Map<string, LockedOwnCheck>> {
  const unique = [...new Set(ids)];
  const result = new Map<string, LockedOwnCheck>();
  if (unique.length === 0) return result;
  if (unique.some((id) => !UUID_RE.test(id))) throw new TreasuryError('El cheque no existe');
  const rows = await tx.$queryRaw<LockedRow[]>`
    SELECT c.id, c.company_id, c.kind::text AS kind, c.account_id, a.name AS account_name, c.number, c.amount::text AS amount,
           c.issue_date::text AS issue_date, c.payment_date::text AS payment_date, c.supplier_id, c.status::text AS status,
           c.debited_on::text AS debited_on, c.payment_order_payment_id
    FROM own_checks c
    JOIN treasury_accounts a ON a.id = c.account_id
    WHERE c.id = ANY(${unique}::uuid[]) AND c.company_id = ${companyId}::uuid
    ORDER BY c.id
    FOR UPDATE OF c
  `;
  if (rows.length !== unique.length) throw new TreasuryError('El cheque no existe');
  for (const r of rows) {
    result.set(r.id, {
      id: r.id,
      companyId: r.company_id,
      kind: r.kind,
      accountId: r.account_id,
      accountName: r.account_name,
      number: r.number,
      amount: r.amount,
      issueDate: r.issue_date,
      paymentDate: r.payment_date,
      supplierId: r.supplier_id,
      status: r.status,
      debitedOn: r.debited_on,
      paymentOrderPaymentId: r.payment_order_payment_id,
    });
  }
  return result;
}

/** Valida la transición; si no está permitida, el mensaje nombra el cheque, su cuenta y su estado. */
export function assertOwnTransition(check: LockedOwnCheck, action: OwnCheckAction): OwnCheckStatus {
  const next = nextOwnCheckStatus(check.status, action);
  if (!next) throw new TreasuryError(ownCheckTransitionError(check, action));
  return next;
}

/**
 * Cambia el estado del cheque (con las columnas que exige el estado nuevo) y escribe el evento.
 * `paymentOrderId` va cuando la orden de pago causa el cambio (anularla); `reason`, en los que llevan motivo.
 */
export async function moveOwnCheck(
  tx: OwnChecksTx,
  input: { check: LockedOwnCheck; action: OwnCheckAction; date: string; userId: string; reason?: string | null; paymentOrderId?: string | null }
): Promise<OwnCheckStatus> {
  const { check, action } = input;
  const next = assertOwnTransition(check, action);
  let data: Prisma.own_checksUncheckedUpdateInput;
  switch (action) {
    case 'DEBIT':
      data = { status: next, debited_on: dateOnly(input.date) };
      break;
    case 'UNDO_DEBIT':
      data = { status: next, debited_on: null };
      break;
    case 'REJECT':
      if (!input.reason) throw new Error('El rechazo necesita motivo');
      data = { status: next, rejected_on: dateOnly(input.date), reject_reason: input.reason };
      break;
    case 'UNDO_REJECTION':
      data = { status: next, rejected_on: null, reject_reason: null };
      break;
    case 'CANCEL':
      data = { status: next };
      break;
  }
  await tx.own_checks.update({ where: { id: check.id }, data });
  await tx.own_check_events.create({
    data: {
      check_id: check.id,
      from_status: check.status,
      to_status: next,
      date: dateOnly(input.date),
      payment_order_id: input.paymentOrderId ?? null,
      reason: input.reason ?? null,
      user_id: input.userId,
    },
  });
  return next;
}

export type LockedCheckbook = {
  id: string;
  accountId: string;
  accountName: string;
  accountActive: boolean;
  firstNumber: number;
  lastNumber: number;
  retired: boolean;
};

/**
 * Toma la chequera con `FOR UPDATE` (dos pagos no toman el mismo número) y la cuenta con `FOR SHARE`: así una
 * desactivación concurrente (`setTreasuryAccountActive`, que la toma con `FOR UPDATE`) espera a la emisión en curso
 * en vez de no verla. Orden de locks: chequera → cuenta; la desactivación solo toma la cuenta, no hay ciclo.
 */
export async function lockCheckbook(tx: RawTx, companyId: string, checkbookId: string): Promise<LockedCheckbook> {
  if (!UUID_RE.test(checkbookId)) throw new TreasuryError('La chequera no existe');
  const rows = await tx.$queryRaw<
    { id: string; account_id: string; account_name: string; is_active: boolean; first_number: number; last_number: number; retired: boolean }[]
  >`
    SELECT cb.id, cb.account_id, a.name AS account_name, a.is_active, cb.first_number, cb.last_number, cb.retired_at IS NOT NULL AS retired
    FROM checkbooks cb JOIN treasury_accounts a ON a.id = cb.account_id
    WHERE cb.id = ${checkbookId}::uuid AND cb.company_id = ${companyId}::uuid
    FOR UPDATE OF cb FOR SHARE OF a
  `;
  const row = rows[0];
  if (!row) throw new TreasuryError('La chequera no existe');
  return {
    id: row.id,
    accountId: row.account_id,
    accountName: row.account_name,
    accountActive: row.is_active,
    firstNumber: row.first_number,
    lastNumber: row.last_number,
    retired: row.retired,
  };
}

/** Próximo número libre de la chequera en su cuenta (los usados por cualquier cheque físico de la cuenta, aunque estén anulados). */
export async function nextFreeNumber(tx: RawTx, checkbook: Pick<LockedCheckbook, 'accountId' | 'firstNumber' | 'lastNumber'>): Promise<string | null> {
  const rows = await tx.$queryRaw<{ n: number }[]>`
    SELECT n FROM generate_series(${checkbook.firstNumber}::int, ${checkbook.lastNumber}::int) n
    WHERE NOT EXISTS (
      SELECT 1 FROM own_checks o WHERE o.account_id = ${checkbook.accountId}::uuid AND o.kind = 'PHYSICAL' AND o.number = n::text
    )
    ORDER BY n LIMIT 1
  `;
  return rows[0] ? String(rows[0].n) : null;
}

/** El número es de la chequera, que sigue vigente, y está libre en la cuenta. Devuelve el número normalizado. */
export async function assertFreeNumber(tx: RawTx, checkbook: LockedCheckbook, raw: string): Promise<string> {
  if (checkbook.retired) throw new TreasuryError('La chequera está dada de baja');
  const number = normalizeCheckNumber(raw);
  if (number === null) throw new TreasuryError('Número de cheque inválido');
  const n = Number(number);
  if (n < checkbook.firstNumber || n > checkbook.lastNumber) {
    throw new TreasuryError(`El Nº ${number} no es de la chequera (del ${checkbook.firstNumber} al ${checkbook.lastNumber})`);
  }
  await assertNumberUnused(tx, checkbook.accountId, checkbook.accountName, 'PHYSICAL', number);
  return number;
}

/** El número no se usó en la cuenta para ese tipo de cheque (ni anulado). */
export async function assertNumberUnused(tx: RawTx, accountId: string, accountName: string, kind: OwnCheckKind, number: string): Promise<void> {
  const used = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM own_checks WHERE account_id = ${accountId}::uuid AND kind = ${kind}::own_check_kind AND number = ${number} LIMIT 1
  `;
  if (used[0]) throw new TreasuryError(usedMessage(number, accountName));
}

const usedMessage = (number: string, accountName: string) => `El cheque Nº ${number} ya se usó en la cuenta «${accountName}»`;

/** El 23505 del índice de números (Prisma lo informa como P2002): otro pago tomó el número a la vez. */
function isNumberKeyViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const text = `${error.message} ${JSON.stringify(error.meta ?? {})}`;
  return text.includes(NUMBER_KEY) || text.includes('number');
}

/** Emite un cheque propio (EMITIDO, sin movimiento) unido al medio de la orden de pago, con su primer evento. */
export async function issueOwnCheck(
  tx: OwnChecksTx,
  input: {
    companyId: string;
    kind: OwnCheckKind;
    accountId: string;
    accountName: string;
    checkbookId: string | null;
    number: string;
    amountCents: bigint;
    issueDate: string;
    paymentDate: string;
    supplierId: string;
    paymentOrderPaymentId: string;
    paymentOrderId: string;
    userId: string;
  }
): Promise<{ id: string }> {
  let created: { id: string };
  try {
    created = await tx.own_checks.create({
      data: {
        company_id: input.companyId,
        kind: input.kind,
        account_id: input.accountId,
        checkbook_id: input.checkbookId,
        number: input.number,
        amount: new Prisma.Decimal(formatScaled(input.amountCents, AMOUNT_SCALE)),
        issue_date: dateOnly(input.issueDate),
        payment_date: dateOnly(input.paymentDate),
        supplier_id: input.supplierId,
        payment_order_payment_id: input.paymentOrderPaymentId,
        created_by: input.userId,
      },
      select: { id: true },
    });
  } catch (error) {
    if (isNumberKeyViolation(error)) throw new TreasuryError(usedMessage(input.number, input.accountName));
    throw error;
  }
  await tx.own_check_events.create({
    data: {
      check_id: created.id,
      from_status: null,
      to_status: 'ISSUED',
      date: dateOnly(input.issueDate),
      payment_order_id: input.paymentOrderId,
      user_id: input.userId,
    },
  });
  return created;
}

/** Inutiliza un número libre de la chequera (roto, perdido, mal llenado): queda ANULADO y no se vuelve a ofrecer. */
export async function voidCheckNumber(
  tx: OwnChecksTx,
  input: { companyId: string; checkbook: LockedCheckbook; number: string; reason: string; date: string; userId: string }
): Promise<{ id: string; number: string }> {
  const number = await assertFreeNumber(tx, input.checkbook, input.number);
  let created: { id: string };
  try {
    created = await tx.own_checks.create({
      data: {
        company_id: input.companyId,
        kind: 'PHYSICAL',
        account_id: input.checkbook.accountId,
        checkbook_id: input.checkbook.id,
        number,
        issue_date: dateOnly(input.date),
        status: 'CANCELLED',
        void_reason: input.reason,
        created_by: input.userId,
      },
      select: { id: true },
    });
  } catch (error) {
    if (isNumberKeyViolation(error)) throw new TreasuryError(usedMessage(number, input.checkbook.accountName));
    throw error;
  }
  await tx.own_check_events.create({
    data: { check_id: created.id, from_status: null, to_status: 'CANCELLED', date: dateOnly(input.date), reason: input.reason, user_id: input.userId },
  });
  return { id: created.id, number };
}


/**
 * Confirma el débito de UN cheque emitido (spec etapa 3b §3.3): la fecha no puede ser anterior a su
 * fecha de pago; sale de su cuenta con un movimiento OWN_CHECK y queda DEBITADO. Lo usan el débito
 * desde la tabla y la conciliación con el extracto (etapa 4). Devuelve el id del movimiento.
 */
export async function debitOwnCheck(
  tx: Prisma.TransactionClient,
  input: { check: LockedOwnCheck; date: string; companyId: string; userId: string }
): Promise<{ movementId: string }> {
  const { check } = input;
  assertOwnTransition(check, 'DEBIT');
  if (check.paymentDate && input.date < check.paymentDate) {
    throw new TreasuryError(`Cheque Nº ${check.number}: su fecha de pago es el ${formatDay(check.paymentDate)}; el débito no puede ser anterior`);
  }
  const extra = await tx.own_checks.findUniqueOrThrow({
    where: { id: check.id },
    select: { supplier: { select: { name: true } }, payment_order_payment: { select: { payment_order: { select: { number: true } } } } },
  });
  const movement = await createMovement(tx, {
    companyId: input.companyId,
    accountId: check.accountId,
    date: input.date,
    amountCents: -(parseScaled(check.amount ?? '0', AMOUNT_SCALE) ?? BigInt(0)),
    kind: 'OWN_CHECK',
    ownCheckId: check.id,
    description: [`Débito del cheque Nº ${check.number}`, extra.supplier?.name, extra.payment_order_payment?.payment_order.number].filter(Boolean).join(' — '),
    createdBy: input.userId,
  });
  await moveOwnCheck(tx, { check, action: 'DEBIT', date: input.date, userId: input.userId });
  return { movementId: movement.id };
}
