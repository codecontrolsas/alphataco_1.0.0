'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { AMOUNT_SCALE, formatScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';
import { checkPermissionServer } from '@/features/Permissions';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { NO_PERMISSION, UUID_RE, firstIssue, toTreasuryActionError } from '../lib/action-errors';
import { cents } from '../lib/check-helpers';
import { discountError, discountNet } from '../lib/check-discount';
import { CHECK_STATUS_LABELS, type CheckStatus } from '../lib/check-transitions';
import { assertNotBeforeEntry, createCheck, lockChecks, moveCheck, type LockedCheck } from '../lib/checks';
import { minCreditDate, rejectionMovementDate } from '../lib/checks-dates';
import { nextCheckOperationNumber } from '../lib/document-number';
import { assertBankAccount, assertPortfolioAccount, cancelMovements, createMovement, dateOnly } from '../lib/movements';
import { TreasuryError } from '../lib/treasury-errors';
import { depositSchema, discountSchema, openingChecksSchema, rejectionSchema, type DepositValues, type DiscountValues, type OpeningChecksValues, type RejectionValues } from '../schemas/checks';
import { cancelReasonSchema } from '../schemas/movements';
import { SESSION_EXPIRED, TRANSACTION_OPTIONS, localToday, revalidateTreasury } from './shared';
import { formatDay as dmy } from '../lib/dates';

/**
 * Operaciones de la cartera de cheques de terceros (spec Tesorería etapa 3a §3): carga inicial,
 * depósito, descuento, rechazo y sus anulaciones. Cada una bloquea sus cheques (`lockChecks`, en
 * orden de id), valida la transición dentro de la transacción y escribe el libro por
 * `lib/movements.ts`. El endoso vive en `registerPayment` de Compras.
 */

const logger = new Logger('features/Treasury/checks');

const OPERATION_NOT_FOUND = 'La operación no existe';
const decimal = (value: bigint) => new Prisma.Decimal(formatScaled(value, AMOUNT_SCALE));
const statusText = (status: CheckStatus) => CHECK_STATUS_LABELS[status].toLowerCase();

async function session() {
  const profile = await getServerAuthProfile();
  if (!profile) return null;
  return { profile, companyId: await getActiveCompanyId() };
}

function assertNotFuture(date: string, today: string) {
  if (date > today) throw new TreasuryError('La fecha no puede ser futura');
}

/** Carga inicial: cheques que ya estaban en mano, cada uno con su entrada a la cartera. */
export async function createOpeningChecks(values: OpeningChecksValues): Promise<ActionResult<{ count: number }>> {
  if (!(await checkPermissionServer('tesoreria', 'cheques', 'create'))) return fail(NO_PERMISSION);
  const parsed = openingChecksSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const ctx = await session();
  if (!ctx) return fail(SESSION_EXPIRED);
  const { profile, companyId } = ctx;
  const v = parsed.data;
  try {
    await withActor(
      profile.credentialId,
      async (tx) => {
        assertNotFuture(v.date, localToday());
        await assertPortfolioAccount(tx, companyId, v.portfolioId);
        const customer = await tx.customers.findFirst({ where: { id: v.customerId, company_id: companyId }, select: { name: true } });
        if (!customer) throw new TreasuryError('El cliente no existe');
        const operation = await tx.third_party_check_operations.create({
          data: { kind: 'OPENING', date: dateOnly(v.date), created_by: profile.id },
          select: { id: true },
        });
        for (const c of v.checks) {
          const amountCents = cents(c.amount);
          const check = await createCheck(tx, {
            companyId,
            portfolioId: v.portfolioId,
            customerId: v.customerId,
            userId: profile.id,
            date: v.date,
            data: { ...c, amountCents },
            origin: { openingOperationId: operation.id },
          });
          await createMovement(tx, {
            companyId,
            accountId: v.portfolioId,
            date: v.date,
            amountCents,
            kind: 'CHECK_OPERATION',
            checkOperationId: operation.id,
            thirdPartyCheckId: check.id,
            description: `Carga inicial — Cheque N° ${c.number.trim()} — ${customer.name}`,
            createdBy: profile.id,
          });
        }
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidateTreasury();
    return ok({ count: v.checks.length });
  } catch (error) {
    return toTreasuryActionError(error, logger, 'cargar los cheques');
  }
}

/** Depósito (CD-): sale cada cheque de su cartera hoy y entra al banco en su fecha de acreditación. */
export async function depositChecks(values: DepositValues): Promise<ActionResult<{ id: string; number: string }>> {
  if (!(await checkPermissionServer('tesoreria', 'cheques', 'create'))) return fail(NO_PERMISSION);
  const parsed = depositSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const ctx = await session();
  if (!ctx) return fail(SESSION_EXPIRED);
  const { profile, companyId } = ctx;
  const v = parsed.data;
  try {
    const created = await withActor(
      profile.credentialId,
      async (tx) => {
        assertNotFuture(v.date, localToday());
        const bank = await assertBankAccount(tx, companyId, v.bankAccountId);
        const checks = await lockChecks(tx, companyId, v.items.map((i) => i.checkId));
        for (const item of v.items) {
          const check = checks.get(item.checkId)!;
          assertExit(check, 'DEPOSIT');
          assertNotBeforeEntry(check, v.date);
          const min = minCreditDate(v.date, check.paymentDate);
          if (item.creditedOn < min) throw new TreasuryError(`Cheque Nº ${check.number}: la acreditación no puede ser anterior al ${dmy(min)}`);
        }
        const number = await nextCheckOperationNumber(tx, companyId, 'DEPOSIT');
        const operation = await tx.third_party_check_operations.create({
          data: {
            kind: 'DEPOSIT',
            number,
            date: dateOnly(v.date),
            bank_account_id: bank.id,
            slip_number: v.slipNumber || null,
            created_by: profile.id,
          },
          select: { id: true },
        });
        for (const item of v.items) {
          const check = checks.get(item.checkId)!;
          const amountCents = cents(check.amount);
          await tx.third_party_check_operation_items.create({
            data: { operation_id: operation.id, check_id: check.id, previous_status: check.status, credited_on: dateOnly(item.creditedOn) },
          });
          const description = `${number} — Cheque N° ${check.number} (${check.bank})`;
          await createMovement(tx, { companyId, accountId: check.portfolioId, date: v.date, amountCents: -amountCents, kind: 'CHECK_OPERATION', checkOperationId: operation.id, thirdPartyCheckId: check.id, description, createdBy: profile.id });
          await createMovement(tx, { companyId, accountId: bank.id, date: item.creditedOn, amountCents, kind: 'CHECK_OPERATION', checkOperationId: operation.id, thirdPartyCheckId: check.id, description, createdBy: profile.id });
          await moveCheck(tx, { check, action: 'DEPOSIT', date: v.date, userId: profile.id, origin: { operationId: operation.id }, set: { creditedOn: item.creditedOn, bankAccountId: bank.id } });
        }
        return { id: operation.id, number };
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidateTreasury();
    return ok(created);
  } catch (error) {
    return toTreasuryActionError(error, logger, 'depositar los cheques', 'El número de depósito ya está en uso. Intentá de nuevo');
  }
}

/** Descuento (CL-): salen los cheques de la cartera por su nominal y entra el neto al banco. */
export async function discountChecks(values: DiscountValues): Promise<ActionResult<{ id: string; number: string; net: string }>> {
  if (!(await checkPermissionServer('tesoreria', 'cheques', 'create'))) return fail(NO_PERMISSION);
  const parsed = discountSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const ctx = await session();
  if (!ctx) return fail(SESSION_EXPIRED);
  const { profile, companyId } = ctx;
  const v = parsed.data;
  try {
    const created = await withActor(
      profile.credentialId,
      async (tx) => {
        assertNotFuture(v.date, localToday());
        const bank = await assertBankAccount(tx, companyId, v.bankAccountId);
        const checks = await lockChecks(tx, companyId, v.checkIds);
        for (const check of checks.values()) {
          assertExit(check, 'DISCOUNT');
          assertNotBeforeEntry(check, v.date);
        }
        const interest = cents(v.interest);
        const fee = cents(v.fee);
        const { net } = discountNet({ nominals: [...checks.values()].map((c) => cents(c.amount)), interest, fee });
        const invalid = discountError(net);
        if (invalid) throw new TreasuryError(invalid);
        const number = await nextCheckOperationNumber(tx, companyId, 'DISCOUNT');
        const operation = await tx.third_party_check_operations.create({
          data: {
            kind: 'DISCOUNT',
            number,
            date: dateOnly(v.date),
            bank_account_id: bank.id,
            interest: decimal(interest),
            fee: decimal(fee),
            reference: v.reference || null,
            created_by: profile.id,
          },
          select: { id: true },
        });
        for (const check of checks.values()) {
          await tx.third_party_check_operation_items.create({ data: { operation_id: operation.id, check_id: check.id, previous_status: check.status } });
          await createMovement(tx, {
            companyId,
            accountId: check.portfolioId,
            date: v.date,
            amountCents: -cents(check.amount),
            kind: 'CHECK_OPERATION',
            checkOperationId: operation.id,
            thirdPartyCheckId: check.id,
            description: `${number} — Cheque N° ${check.number} (${check.bank})`,
            createdBy: profile.id,
          });
          await moveCheck(tx, { check, action: 'DISCOUNT', date: v.date, userId: profile.id, origin: { operationId: operation.id }, set: { bankAccountId: bank.id } });
        }
        await createMovement(tx, {
          companyId,
          accountId: bank.id,
          date: v.date,
          amountCents: net,
          kind: 'CHECK_OPERATION',
          checkOperationId: operation.id,
          description: `${number} — Descuento de ${checks.size} ${checks.size === 1 ? 'cheque' : 'cheques'} (neto)`,
          createdBy: profile.id,
        });
        return { id: operation.id, number, net: formatScaled(net, AMOUNT_SCALE) };
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidateTreasury();
    return ok(created);
  } catch (error) {
    return toTreasuryActionError(error, logger, 'descontar los cheques', 'El número de liquidación ya está en uso. Intentá de nuevo');
  }
}

/** Valida que el cheque pueda salir de la cartera con un mensaje que nombra su estado. */
function assertExit(check: LockedCheck, action: 'DEPOSIT' | 'DISCOUNT') {
  if (check.status !== 'IN_PORTFOLIO') {
    throw new TreasuryError(`El cheque Nº ${check.number} (${check.bank}) está ${statusText(check.status)}: no se puede ${action === 'DEPOSIT' ? 'depositar' : 'descontar'}`);
  }
}

/** La operación vigente que sacó el cheque de la cartera (depósito, descuento) o la orden que lo endosó. */
async function exitOf(tx: Pick<Prisma.TransactionClient, '$queryRaw'>, checkId: string): Promise<{ date: string; label: string } | null> {
  const rows = await tx.$queryRaw<{ date: string; label: string }[]>`
    SELECT o.date::text AS date,
           (CASE o.kind WHEN 'DEPOSIT' THEN 'depósito ' ELSE 'descuento ' END) || o.number AS label
    FROM third_party_check_operation_items i
    JOIN third_party_check_operations o ON o.id = i.operation_id
    WHERE i.check_id = ${checkId}::uuid AND o.kind IN ('DEPOSIT', 'DISCOUNT') AND o.cancelled_at IS NULL
    UNION ALL
    SELECT po.paid_on::text, 'orden de pago ' || po.number
    FROM payment_order_payments p
    JOIN payment_orders po ON po.id = p.payment_order_id
    WHERE p.third_party_check_id = ${checkId}::uuid AND po.status = 'PAID'
    ORDER BY 1 DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/** Rechazo (CR-): si estaba depositado o descontado, sale del banco; nace la deuda del cliente (y la del proveedor si estaba endosado). */
export async function rejectCheck(values: RejectionValues): Promise<ActionResult<{ id: string; number: string }>> {
  if (!(await checkPermissionServer('tesoreria', 'cheques', 'update'))) return fail(NO_PERMISSION);
  const parsed = rejectionSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const ctx = await session();
  if (!ctx) return fail(SESSION_EXPIRED);
  const { profile, companyId } = ctx;
  const v = parsed.data;
  try {
    const created = await withActor(
      profile.credentialId,
      async (tx) => {
        assertNotFuture(v.date, localToday());
        const check = (await lockChecks(tx, companyId, [v.checkId])).get(v.checkId)!;
        if (!['DEPOSITED', 'ENDORSED', 'DISCOUNTED'].includes(check.status)) {
          throw new TreasuryError(`El cheque Nº ${check.number} (${check.bank}) está ${statusText(check.status)}: no se puede rechazar`);
        }
        const exit = await exitOf(tx, check.id);
        if (exit && v.date < exit.date) throw new TreasuryError(`La fecha del rechazo no puede ser anterior al ${dmy(exit.date)} (${exit.label})`);
        const number = await nextCheckOperationNumber(tx, companyId, 'REJECTION');
        const operation = await tx.third_party_check_operations.create({
          data: {
            kind: 'REJECTION',
            number,
            date: dateOnly(v.date),
            reason: v.reason,
            returned_by: v.returnedBy,
            created_by: profile.id,
          },
          select: { id: true },
        });
        await tx.third_party_check_operation_items.create({ data: { operation_id: operation.id, check_id: check.id, previous_status: check.status } });
        if ((check.status === 'DEPOSITED' || check.status === 'DISCOUNTED') && check.bankAccountId) {
          await createMovement(tx, {
            companyId,
            accountId: check.bankAccountId,
            date: rejectionMovementDate(v.date, check.status === 'DEPOSITED' ? check.creditedOn : null),
            amountCents: -cents(check.amount),
            kind: 'CHECK_OPERATION',
            checkOperationId: operation.id,
            thirdPartyCheckId: check.id,
            description: `${number} — Rechazo del cheque N° ${check.number} (${check.bank}): ${v.reason}`,
            createdBy: profile.id,
          });
        }
        await moveCheck(tx, { check, action: 'REJECT', date: v.date, userId: profile.id, origin: { operationId: operation.id } });
        return { id: operation.id, number };
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidateTreasury();
    return ok(created);
  } catch (error) {
    return toTreasuryActionError(error, logger, 'registrar el rechazo', 'El número de rechazo ya está en uso. Intentá de nuevo');
  }
}

/** Dónde se usa la deuda de un cheque rechazado: un recibo o una orden de pago vigentes. */
async function assertDebtNotUsed(tx: Pick<Prisma.TransactionClient, '$queryRaw'>, checkId: string) {
  const receipts = await tx.$queryRaw<{ number: string | null; status: string }[]>`
    SELECT r.number, r.status::text AS status FROM customer_receipt_lines l JOIN customer_receipts r ON r.id = l.receipt_id
    WHERE l.third_party_check_id = ${checkId}::uuid AND l.kind = 'REJECTED_CHECK' AND r.status IN ('DRAFT', 'CONFIRMED')
    ORDER BY (r.status = 'CONFIRMED') DESC LIMIT 1
  `;
  const receipt = receipts[0];
  if (receipt?.status === 'CONFIRMED') throw new TreasuryError(`La deuda del cheque se cobró en ${receipt.number}: anulá ese recibo primero`);
  if (receipt) throw new TreasuryError('La deuda del cheque está en un recibo en borrador: quitala de ahí primero');
  const orders = await tx.$queryRaw<{ number: string; status: string }[]>`
    SELECT po.number, po.status::text AS status FROM payment_order_lines l JOIN payment_orders po ON po.id = l.payment_order_id
    WHERE l.third_party_check_id = ${checkId}::uuid AND l.kind = 'REJECTED_CHECK' AND po.status <> 'CANCELLED'
    ORDER BY (po.status = 'PAID') DESC LIMIT 1
  `;
  const order = orders[0];
  if (order?.status === 'PAID') throw new TreasuryError(`La deuda del cheque se pagó en la ${order.number}: anulá esa orden primero`);
  if (order) throw new TreasuryError(`La deuda del cheque está en la ${order.number}, sin pagar: quitala de ahí primero`);
}

/** Anula un depósito, un descuento o un rechazo (completo y con motivo, spec §3.7). */
export async function cancelCheckOperation(operationId: string, reason: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('tesoreria', 'cheques', 'delete'))) return fail(NO_PERMISSION);
  const motive = cancelReasonSchema.safeParse(reason);
  if (!motive.success) return fail(firstIssue(motive.error));
  if (!UUID_RE.test(operationId)) return fail(OPERATION_NOT_FOUND);
  const ctx = await session();
  if (!ctx) return fail(SESSION_EXPIRED);
  const { profile, companyId } = ctx;
  try {
    await withActor(
      profile.credentialId,
      async (tx) => {
        const rows = await tx.$queryRaw<{ id: string; kind: string; number: string | null; cancelled_at: Date | null }[]>`
          SELECT id, kind::text AS kind, number, cancelled_at FROM third_party_check_operations
          WHERE id = ${operationId}::uuid AND company_id = ${companyId}::uuid FOR UPDATE
        `;
        const operation = rows[0];
        if (!operation) throw new TreasuryError(OPERATION_NOT_FOUND);
        if (operation.cancelled_at) throw new TreasuryError('La operación ya está anulada');
        if (operation.kind === 'OPENING') throw new TreasuryError('Una carga inicial se anula cheque por cheque, desde su detalle');
        const items = await tx.third_party_check_operation_items.findMany({ where: { operation_id: operationId }, select: { check_id: true } });
        const checks = await lockChecks(tx, companyId, items.map((i) => i.check_id));
        const today = localToday();
        if (operation.kind === 'REJECTION') {
          for (const check of checks.values()) {
            if (check.status !== 'REJECTED') throw new TreasuryError(`El cheque Nº ${check.number} ya no está rechazado`);
            await assertDebtNotUsed(tx, check.id);
          }
          for (const check of checks.values()) {
            await moveCheck(tx, { check, action: 'UNDO_REJECTION', date: today, userId: profile.id, origin: { operationId } });
          }
        } else {
          const expected: CheckStatus = operation.kind === 'DEPOSIT' ? 'DEPOSITED' : 'DISCOUNTED';
          for (const check of checks.values()) {
            if (check.status === expected) continue;
            if (check.status === 'REJECTED') {
              const rejection = await tx.$queryRaw<{ number: string }[]>`
                SELECT o.number FROM third_party_check_operation_items i JOIN third_party_check_operations o ON o.id = i.operation_id
                WHERE i.check_id = ${check.id}::uuid AND o.kind = 'REJECTION' AND o.cancelled_at IS NULL LIMIT 1
              `;
              throw new TreasuryError(`El cheque Nº ${check.number} (${check.bank}) está rechazado: anulá primero el rechazo ${rejection[0]?.number ?? ''}`.trim());
            }
            throw new TreasuryError(`El cheque Nº ${check.number} (${check.bank}) está ${statusText(check.status)}: no se puede anular la operación`);
          }
          for (const check of checks.values()) {
            await moveCheck(tx, { check, action: 'UNDO_EXIT', date: today, userId: profile.id, origin: { operationId } });
          }
        }
        const at = new Date();
        await cancelMovements(tx, { checkOperationId: operationId }, { by: profile.id, reason: motive.data, at });
        await tx.third_party_check_operations.update({
          where: { id: operationId },
          data: { cancelled_by: profile.id, cancelled_at: at, cancel_reason: motive.data },
        });
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidateTreasury();
    return ok(null);
  } catch (error) {
    return toTreasuryActionError(error, logger, 'anular la operación');
  }
}

/** Anula la carga inicial de UN cheque que sigue en la cartera. */
export async function cancelOpeningCheck(checkId: string, reason: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('tesoreria', 'cheques', 'delete'))) return fail(NO_PERMISSION);
  const motive = cancelReasonSchema.safeParse(reason);
  if (!motive.success) return fail(firstIssue(motive.error));
  const ctx = await session();
  if (!ctx) return fail(SESSION_EXPIRED);
  const { profile, companyId } = ctx;
  try {
    await withActor(
      profile.credentialId,
      async (tx) => {
        const check = (await lockChecks(tx, companyId, [checkId])).get(checkId)!;
        if (!check.openingOperationId) throw new TreasuryError('El cheque vino de un recibo: se anula anulando el recibo');
        if (check.status !== 'IN_PORTFOLIO') {
          throw new TreasuryError(`El cheque Nº ${check.number} (${check.bank}) está ${statusText(check.status)}: anulá primero la operación que lo sacó de la cartera`);
        }
        const entry = await tx.treasury_movements.findMany({
          where: { check_operation_id: check.openingOperationId, third_party_check_id: check.id, cancelled_at: null },
          select: { id: true },
        });
        await cancelMovements(tx, { ids: entry.map((m) => m.id) }, { by: profile.id, reason: motive.data, at: new Date() });
        await moveCheck(tx, { check, action: 'CANCEL_ORIGIN', date: localToday(), userId: profile.id, origin: { operationId: check.openingOperationId } });
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidateTreasury();
    return ok(null);
  } catch (error) {
    return toTreasuryActionError(error, logger, 'anular el cheque');
  }
}
