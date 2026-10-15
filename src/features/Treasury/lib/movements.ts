import 'server-only';

import { AMOUNT_SCALE, formatScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';
import { Prisma } from '@/generated/prisma/client';
import type { treasury_movement_kind } from '@/generated/prisma/enums';
import { TreasuryError } from './treasury-errors';
import { UUID_RE } from '../schemas/shared';

/**
 * Única escritura del libro de movimientos (spec Tesorería etapa 1 §3). La llaman las actions de
 * Tesorería, `registerPayment` / `cancelPaymentOrder` de Compras y los recibos de cobranza,
 * siempre dentro de la transacción del documento de origen. Ningún otro código crea ni anula `treasury_movements`.
 */

type MovementsTx = Pick<Prisma.TransactionClient, 'treasury_movements' | 'treasury_accounts' | '$queryRaw'>;


/** `YYYY-MM-DD` → Date para una columna `@db.Date` (medianoche UTC, sin corrimiento). */
export const dateOnly = (value: string) => new Date(`${value}T00:00:00.000Z`);

/** La cuenta existe en la empresa y está activa. Devuelve su nombre y tipo. */
export async function assertActiveAccount(
  tx: Pick<Prisma.TransactionClient, 'treasury_accounts'>,
  companyId: string,
  accountId: string
): Promise<{ id: string; name: string; kind: 'BANK' | 'CASH' | 'CHECK_PORTFOLIO' }> {
  if (!UUID_RE.test(accountId)) throw new TreasuryError('La cuenta no existe');
  const account = await tx.treasury_accounts.findFirst({
    where: { id: accountId, company_id: companyId },
    select: { id: true, name: true, kind: true, is_active: true },
  });
  if (!account) throw new TreasuryError('La cuenta no existe');
  if (!account.is_active) throw new TreasuryError(`La cuenta «${account.name}» está inactiva`);
  return { id: account.id, name: account.name, kind: account.kind };
}

export const PORTFOLIO_WITHOUT_OPENING = 'Una cartera no lleva saldo inicial: cargá sus cheques con la carga inicial';

/** Cuenta o caja de plata: una cartera de cheques no admite movimientos manuales, transferencias ni medios que no sean cheques. */
export async function assertMoneyAccount(
  tx: Pick<Prisma.TransactionClient, 'treasury_accounts'>,
  companyId: string,
  accountId: string
): Promise<{ id: string; name: string; kind: 'BANK' | 'CASH' }> {
  const account = await assertActiveAccount(tx, companyId, accountId);
  if (account.kind === 'CHECK_PORTFOLIO') throw new TreasuryError(`La cartera «${account.name}» solo mueve cheques`);
  return { id: account.id, name: account.name, kind: account.kind };
}

/** Cartera de cheques activa de la empresa (adonde entran los cheques recibidos). */
export async function assertPortfolioAccount(
  tx: Pick<Prisma.TransactionClient, 'treasury_accounts'>,
  companyId: string,
  accountId: string
): Promise<{ id: string; name: string }> {
  const account = await assertActiveAccount(tx, companyId, accountId);
  if (account.kind !== 'CHECK_PORTFOLIO') throw new TreasuryError('Los cheques van a una cartera de cheques');
  return { id: account.id, name: account.name };
}

/** Cuenta bancaria activa (destino de depósitos y descuentos de cheques). */
export async function assertBankAccount(
  tx: Pick<Prisma.TransactionClient, 'treasury_accounts'>,
  companyId: string,
  accountId: string
): Promise<{ id: string; name: string }> {
  const account = await assertActiveAccount(tx, companyId, accountId);
  if (account.kind !== 'BANK') throw new TreasuryError('Elegí una cuenta bancaria');
  return { id: account.id, name: account.name };
}

export type CreateMovementInput = {
  companyId: string;
  accountId: string;
  /** Fecha valor, `YYYY-MM-DD`. */
  date: string;
  /** Con signo: positivo entra, negativo sale. */
  amountCents: bigint;
  kind: treasury_movement_kind;
  conceptId?: string | null;
  description?: string | null;
  transferId?: string | null;
  paymentOrderPaymentId?: string | null;
  customerReceiptPaymentId?: string | null;
  checkOperationId?: string | null;
  thirdPartyCheckId?: string | null;
  /** Cheque propio debitado (solo OWN_CHECK). */
  ownCheckId?: string | null;
  createdBy: string;
};

/** Crea un movimiento en una cuenta activa de la empresa. */
export async function createMovement(tx: MovementsTx, input: CreateMovementInput): Promise<{ id: string }> {
  if (input.amountCents === BigInt(0)) throw new TreasuryError('El importe no puede ser 0');
  await assertActiveAccount(tx, input.companyId, input.accountId);
  return tx.treasury_movements.create({
    data: {
      company_id: input.companyId,
      account_id: input.accountId,
      date: dateOnly(input.date),
      amount: new Prisma.Decimal(formatScaled(input.amountCents, AMOUNT_SCALE)),
      kind: input.kind,
      concept_id: input.conceptId ?? null,
      description: input.description?.trim() ? input.description.trim() : null,
      transfer_id: input.transferId ?? null,
      payment_order_payment_id: input.paymentOrderPaymentId ?? null,
      customer_receipt_payment_id: input.customerReceiptPaymentId ?? null,
      check_operation_id: input.checkOperationId ?? null,
      third_party_check_id: input.thirdPartyCheckId ?? null,
      own_check_id: input.ownCheckId ?? null,
      created_by: input.createdBy,
    },
    select: { id: true },
  });
}

/**
 * Anula los movimientos vigentes de un origen (ids sueltos, una transferencia, los medios de una
 * orden de pago, los de un recibo de cobranza, los de una operación de cheques o el débito de un cheque propio). Los ya anulados no se tocan: conservan su motivo y fecha. Devuelve cuántos anuló.
 */
export async function cancelMovements(
  tx: Pick<Prisma.TransactionClient, 'treasury_movements' | '$queryRaw'>,
  where: { ids?: string[]; transferId?: string; paymentOrderId?: string; customerReceiptId?: string; checkOperationId?: string; ownCheckId?: string },
  cancel: { by: string; reason: string; at: Date }
): Promise<number> {
  const origin: Prisma.treasury_movementsWhereInput[] = [];
  if (where.ids?.length) origin.push({ id: { in: where.ids } });
  if (where.transferId) origin.push({ transfer_id: where.transferId });
  if (where.paymentOrderId) origin.push({ payment_order_payment: { payment_order_id: where.paymentOrderId } });
  if (where.customerReceiptId) origin.push({ customer_receipt_payment: { receipt_id: where.customerReceiptId } });
  if (where.checkOperationId) origin.push({ check_operation_id: where.checkOperationId });
  if (where.ownCheckId) origin.push({ own_check_id: where.ownCheckId });
  if (origin.length === 0) return 0;
  // Un movimiento conciliado con el extracto está trabado (etapa 4): se rechaza antes de anular nada.
  // Primero se bloquean los movimientos y DESPUÉS, en otra sentencia, se mira si están conciliados:
  // así se ve una conciliación que estaba en curso (y que tenía la fila tomada) cuando termina.
  const targets = await tx.treasury_movements.findMany({ where: { cancelled_at: null, OR: origin }, select: { id: true } });
  if (targets.length === 0) return 0;
  const ids = targets.map((t) => t.id).sort();
  await tx.$queryRaw`SELECT id FROM treasury_movements WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`;
  const reconciled = await tx.$queryRaw<{ date: string; amount: string }[]>`
    SELECT m.date::text AS date, m.amount::text AS amount FROM treasury_movements m
    WHERE m.id = ANY(${ids}::uuid[]) AND EXISTS (SELECT 1 FROM bank_statement_lines bl WHERE bl.movement_id = m.id)
    LIMIT 1
  `;
  if (reconciled[0]) throw new TreasuryError(reconciledMessage(reconciled[0].date, reconciled[0].amount));
  const { count } = await tx.treasury_movements.updateMany({
    where: { cancelled_at: null, OR: origin },
    data: { cancelled_by: cancel.by, cancelled_at: cancel.at, cancel_reason: cancel.reason },
  });
  return count;
}

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const pesos = (amount: string) => {
  const [int = '0', dec = '00'] = amount.replace('-', '').split('.');
  return `$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
};

/** "El movimiento del 05/10 por $ 1.500,00 está conciliado con el extracto: desconcilialo primero". */
export function reconciledMessage(date: string, amount: string): string {
  return `El movimiento del ${dm(date)} por ${pesos(amount)} está conciliado con el extracto: desconcilialo primero`;
}

export type LockedMovement = {
  id: string;
  accountId: string;
  conceptId: string | null;
  date: string;
  amount: string;
  kind: treasury_movement_kind;
  cancelled: boolean;
  transferNumber: string | null;
  paymentOrderNumber: string | null;
  receiptNumber: string | null;
  checkOperationNumber: string | null;
  ownCheckNumber: string | null;
  /** Conciliado con una línea del extracto (etapa 4): no se edita ni se anula. */
  reconciled: boolean;
};

/** Toma la fila del movimiento con `FOR UPDATE` (editar y anular compiten por ella). */
export async function lockMovement(tx: Pick<Prisma.TransactionClient, '$queryRaw'>, companyId: string, id: string): Promise<LockedMovement> {
  if (!UUID_RE.test(id)) throw new TreasuryError('El movimiento no existe');
  const rows = await tx.$queryRaw<
    {
      id: string;
      account_id: string;
      concept_id: string | null;
      date: string;
      amount: string;
      kind: treasury_movement_kind;
      cancelled_at: Date | null;
      transfer_number: string | null;
      payment_order_number: string | null;
      receipt_number: string | null;
      check_operation_number: string | null;
      own_check_number: string | null;
    }[]
  >`
    SELECT m.id, m.account_id, m.concept_id, m.date::text AS date, m.amount::text AS amount, m.kind::text AS kind, m.cancelled_at,
           t.number AS transfer_number, po.number AS payment_order_number, cr.number AS receipt_number,
           co.number AS check_operation_number, oc.number AS own_check_number
    FROM treasury_movements m
    LEFT JOIN treasury_transfers t ON t.id = m.transfer_id
    LEFT JOIN payment_order_payments p ON p.id = m.payment_order_payment_id
    LEFT JOIN payment_orders po ON po.id = p.payment_order_id
    LEFT JOIN customer_receipt_payments crp ON crp.id = m.customer_receipt_payment_id
    LEFT JOIN customer_receipts cr ON cr.id = crp.receipt_id
    LEFT JOIN third_party_check_operations co ON co.id = m.check_operation_id
    LEFT JOIN own_checks oc ON oc.id = m.own_check_id
    WHERE m.id = ${id}::uuid AND m.company_id = ${companyId}::uuid
    FOR UPDATE OF m
  `;
  const row = rows[0];
  if (!row) throw new TreasuryError('El movimiento no existe');
  // En otra sentencia, después del FOR UPDATE: ve una conciliación que terminó mientras se esperaba la fila.
  const reconciled = await tx.$queryRaw<{ reconciled: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM bank_statement_lines WHERE movement_id = ${id}::uuid) AS reconciled
  `;
  return {
    id: row.id,
    accountId: row.account_id,
    conceptId: row.concept_id,
    date: row.date,
    amount: row.amount,
    kind: row.kind,
    cancelled: row.cancelled_at !== null,
    transferNumber: row.transfer_number,
    paymentOrderNumber: row.payment_order_number,
    receiptNumber: row.receipt_number,
    checkOperationNumber: row.check_operation_number,
    ownCheckNumber: row.own_check_number,
    reconciled: reconciled[0]?.reconciled ?? false,
  };
}

/** Un movimiento conciliado con el extracto no se edita ni se anula (etapa 4 §3.8). */
export function assertNotReconciled(movement: LockedMovement): void {
  if (movement.reconciled) throw new TreasuryError(reconciledMessage(movement.date, movement.amount));
}

/** Un movimiento automático no se toca desde Movimientos: se revierte desde su documento. */
export function assertEditableMovement(movement: LockedMovement): void {
  if (movement.kind === 'TRANSFER') {
    throw new TreasuryError(`Este movimiento es de la transferencia ${movement.transferNumber}. Para revertirlo, anulá la transferencia`);
  }
  if (movement.kind === 'SUPPLIER_PAYMENT') {
    throw new TreasuryError(`Este movimiento es del pago de la ${movement.paymentOrderNumber}. Para revertirlo, anulá la orden de pago`);
  }
  if (movement.kind === 'CUSTOMER_RECEIPT') {
    throw new TreasuryError(`Este movimiento es del recibo ${movement.receiptNumber}. Para revertirlo, anulá el recibo`);
  }
  if (movement.kind === 'CHECK_OPERATION') {
    throw new TreasuryError(
      movement.checkOperationNumber
        ? `Este movimiento es de la operación de cheques ${movement.checkOperationNumber}. Para revertirlo, anulá la operación`
        : 'Este movimiento es de la carga inicial de cheques. Para revertirlo, anulá el cheque desde su detalle'
    );
  }
  if (movement.kind === 'OWN_CHECK') {
    throw new TreasuryError(`Este movimiento es el débito del cheque propio Nº ${movement.ownCheckNumber}. Para revertirlo, deshacé el débito desde el cheque`);
  }
}
