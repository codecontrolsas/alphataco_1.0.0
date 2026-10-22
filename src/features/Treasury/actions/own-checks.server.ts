'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { lockTreasuryAccount } from '../lib/account-lock';
import {
  NO_PERMISSION,
  UUID_RE,
  assertNotFuture,
  firstIssue,
  toTreasuryActionError,
  treasurySession,
} from '../lib/action-errors';
import { formatDay as dmy, isoDay } from '../lib/dates';
import { assertBankAccount, cancelMovements } from '../lib/movements';
import { checkbookStatus, normalizeCheckNumber, ownCheckAlert } from '../lib/own-check-transitions';
import {
  assertOwnTransition,
  debitOwnCheck,
  lockCheckbook,
  lockOwnChecks,
  moveOwnCheck,
  voidCheckNumber,
} from '../lib/own-checks';
import { supplierCheckDebts } from '../lib/rejected-checks';
import { TreasuryError } from '../lib/treasury-errors';
import {
  checkbookSchema,
  debitOwnChecksSchema,
  ownCheckReasonSchema,
  rejectOwnCheckSchema,
  voidCheckNumberSchema,
  type CheckbookValues,
  type DebitOwnChecksValues,
  type RejectOwnCheckValues,
  type VoidCheckNumberValues,
} from '../schemas/own-checks';
import { SESSION_EXPIRED, TRANSACTION_OPTIONS, localToday, revalidateTreasury } from './shared';

/**
 * Chequeras y cheques propios (spec Tesorería etapa 3b §3). La emisión vive en `registerPayment`
 * de Compras; acá están el alta y la baja de chequeras, los números inutilizados, el débito
 * confirmado, el rechazo y sus anulaciones. Cada operación bloquea lo que toca y escribe el libro
 * por `lib/movements.ts`.
 */

const logger = new Logger('features/Treasury/own-checks');

const CHECK_NOT_FOUND = 'El cheque no existe';

/** Alta de una chequera: cuenta bancaria activa y un rango que no se superpone con otra chequera de la cuenta. */
export async function createCheckbook(values: CheckbookValues): Promise<ActionResult<{ id: string }>> {
  if (!(await checkPermissionServer('tesoreria', 'cheques-propios', 'create'))) return fail(NO_PERMISSION);
  const parsed = checkbookSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const ctx = await treasurySession();
  if (!ctx) return fail(SESSION_EXPIRED);
  const { profile, companyId } = ctx;
  const first = Number(normalizeCheckNumber(parsed.data.firstNumber));
  const last = Number(normalizeCheckNumber(parsed.data.lastNumber));
  try {
    const created = await withActor(
      profile.credentialId,
      async (tx) => {
        const account = await assertBankAccount(tx, companyId, parsed.data.accountId);
        // La cuenta se bloquea: dos altas a la vez no pueden superponer rangos.
        await lockTreasuryAccount(tx, account.id);
        const overlap = await tx.checkbooks.findFirst({
          where: { account_id: account.id, first_number: { lte: last }, last_number: { gte: first } },
          select: { first_number: true, last_number: true },
        });
        if (overlap) {
          throw new TreasuryError(
            `El rango se superpone con la chequera del ${overlap.first_number} al ${overlap.last_number} de «${account.name}»`
          );
        }
        return tx.checkbooks.create({
          data: { account_id: account.id, first_number: first, last_number: last, created_by: profile.id },
          select: { id: true },
        });
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidateTreasury();
    return ok(created);
  } catch (error) {
    return toTreasuryActionError(error, logger, 'crear la chequera');
  }
}

/** Baja de una chequera (con motivo): sus números libres dejan de ofrecerse. */
export async function retireCheckbook(checkbookId: string, reason: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('tesoreria', 'cheques-propios', 'delete'))) return fail(NO_PERMISSION);
  const motive = ownCheckReasonSchema.safeParse(reason);
  if (!motive.success) return fail(firstIssue(motive.error));
  const ctx = await treasurySession();
  if (!ctx) return fail(SESSION_EXPIRED);
  const { profile, companyId } = ctx;
  try {
    await withActor(
      profile.credentialId,
      async (tx) => {
        const checkbook = await lockCheckbook(tx, companyId, checkbookId);
        if (checkbook.retired) throw new TreasuryError('La chequera ya está dada de baja');
        await tx.checkbooks.update({
          where: { id: checkbook.id },
          data: { retired_at: new Date(), retired_by: profile.id, retire_reason: motive.data },
        });
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidateTreasury();
    return ok(null);
  } catch (error) {
    return toTreasuryActionError(error, logger, 'dar de baja la chequera');
  }
}

/** Inutiliza un número libre de una chequera (roto, perdido, mal llenado). */
export async function voidOwnCheckNumber(values: VoidCheckNumberValues): Promise<ActionResult<{ number: string }>> {
  if (!(await checkPermissionServer('tesoreria', 'cheques-propios', 'create'))) return fail(NO_PERMISSION);
  const parsed = voidCheckNumberSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const ctx = await treasurySession();
  if (!ctx) return fail(SESSION_EXPIRED);
  const { profile, companyId } = ctx;
  try {
    const result = await withActor(
      profile.credentialId,
      async (tx) => {
        const checkbook = await lockCheckbook(tx, companyId, parsed.data.checkbookId);
        return voidCheckNumber(tx, {
          companyId,
          checkbook,
          number: parsed.data.number,
          reason: parsed.data.reason,
          date: localToday(),
          userId: profile.id,
        });
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidateTreasury();
    return ok({ number: result.number });
  } catch (error) {
    return toTreasuryActionError(error, logger, 'inutilizar el número');
  }
}

/**
 * Confirma el débito de uno o varios cheques EMITIDOS en una fecha (no futura ni anterior a la fecha
 * de pago de ninguno): cada uno sale del banco con un movimiento OWN_CHECK.
 */
export async function debitOwnChecks(values: DebitOwnChecksValues): Promise<ActionResult<{ count: number }>> {
  if (!(await checkPermissionServer('tesoreria', 'cheques-propios', 'update'))) return fail(NO_PERMISSION);
  const parsed = debitOwnChecksSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const ctx = await treasurySession();
  if (!ctx) return fail(SESSION_EXPIRED);
  const { profile, companyId } = ctx;
  const v = parsed.data;
  try {
    const count = await withActor(
      profile.credentialId,
      async (tx) => {
        assertNotFuture(v.date, localToday());
        const checks = await lockOwnChecks(tx, companyId, v.checkIds);
        for (const check of checks.values())
          await debitOwnCheck(tx, { check, date: v.date, companyId, userId: profile.id });
        return checks.size;
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidateTreasury();
    return ok({ count });
  } catch (error) {
    return toTreasuryActionError(error, logger, 'confirmar el débito');
  }
}

/** Deshace un débito marcado por error (con motivo): anula el movimiento y el cheque vuelve a EMITIDO. */
export async function undoOwnCheckDebit(checkId: string, reason: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('tesoreria', 'cheques-propios', 'delete'))) return fail(NO_PERMISSION);
  const motive = ownCheckReasonSchema.safeParse(reason);
  if (!motive.success) return fail(firstIssue(motive.error));
  if (!UUID_RE.test(checkId)) return fail(CHECK_NOT_FOUND);
  const ctx = await treasurySession();
  if (!ctx) return fail(SESSION_EXPIRED);
  const { profile, companyId } = ctx;
  try {
    await withActor(
      profile.credentialId,
      async (tx) => {
        const check = (await lockOwnChecks(tx, companyId, [checkId])).get(checkId)!;
        assertOwnTransition(check, 'UNDO_DEBIT');
        await cancelMovements(tx, { ownCheckId: check.id }, { by: profile.id, reason: motive.data, at: new Date() });
        await moveOwnCheck(tx, {
          check,
          action: 'UNDO_DEBIT',
          date: localToday(),
          userId: profile.id,
          reason: motive.data,
        });
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidateTreasury();
    return ok(null);
  } catch (error) {
    return toTreasuryActionError(error, logger, 'deshacer el débito');
  }
}

/** Registra el rechazo de un cheque EMITIDO: no mueve plata y vuelve la deuda con el proveedor. */
export async function rejectOwnCheck(checkId: string, values: RejectOwnCheckValues): Promise<ActionResult> {
  if (!(await checkPermissionServer('tesoreria', 'cheques-propios', 'update'))) return fail(NO_PERMISSION);
  const parsed = rejectOwnCheckSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  if (!UUID_RE.test(checkId)) return fail(CHECK_NOT_FOUND);
  const ctx = await treasurySession();
  if (!ctx) return fail(SESSION_EXPIRED);
  const { profile, companyId } = ctx;
  const v = parsed.data;
  try {
    await withActor(
      profile.credentialId,
      async (tx) => {
        assertNotFuture(v.date, localToday());
        const check = (await lockOwnChecks(tx, companyId, [checkId])).get(checkId)!;
        assertOwnTransition(check, 'REJECT');
        if (v.date < check.issueDate)
          throw new TreasuryError(`La fecha del rechazo no puede ser anterior a la emisión (${dmy(check.issueDate)})`);
        await moveOwnCheck(tx, { check, action: 'REJECT', date: v.date, userId: profile.id, reason: v.reason });
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidateTreasury();
    return ok(null);
  } catch (error) {
    return toTreasuryActionError(error, logger, 'registrar el rechazo');
  }
}

/** Anula el rechazo (con motivo) si su deuda no está en ninguna orden de pago vigente. */
export async function undoOwnCheckRejection(checkId: string, reason: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('tesoreria', 'cheques-propios', 'delete'))) return fail(NO_PERMISSION);
  const motive = ownCheckReasonSchema.safeParse(reason);
  if (!motive.success) return fail(firstIssue(motive.error));
  if (!UUID_RE.test(checkId)) return fail(CHECK_NOT_FOUND);
  const ctx = await treasurySession();
  if (!ctx) return fail(SESSION_EXPIRED);
  const { profile, companyId } = ctx;
  try {
    await withActor(
      profile.credentialId,
      async (tx) => {
        const check = (await lockOwnChecks(tx, companyId, [checkId])).get(checkId)!;
        assertOwnTransition(check, 'UNDO_REJECTION');
        const orders = await tx.$queryRaw<{ number: string; status: string }[]>`
          SELECT po.number, po.status::text AS status FROM payment_order_lines l JOIN payment_orders po ON po.id = l.payment_order_id
          WHERE l.own_check_id = ${check.id}::uuid AND l.kind = 'REJECTED_CHECK' AND po.status <> 'CANCELLED'
          ORDER BY (po.status = 'PAID') DESC LIMIT 1
        `;
        const order = orders[0];
        if (order?.status === 'PAID')
          throw new TreasuryError(`La deuda del cheque se pagó en la ${order.number}: anulá esa orden primero`);
        if (order)
          throw new TreasuryError(`La deuda del cheque está en la ${order.number}, sin pagar: quitala de ahí primero`);
        await moveOwnCheck(tx, {
          check,
          action: 'UNDO_REJECTION',
          date: localToday(),
          userId: profile.id,
          reason: motive.data,
        });
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidateTreasury();
    return ok(null);
  } catch (error) {
    return toTreasuryActionError(error, logger, 'anular el rechazo');
  }
}

/** Chequeras de la empresa con su uso: números usados y libres, próximo número y estado calculado. */
export async function getCheckbooks() {
  if (!(await checkPermissionServer('tesoreria', 'cheques-propios', 'view'))) return [];
  const companyId = await getActiveCompanyId();
  return loadCheckbooks(companyId, { includeRetired: true });
}

export type CheckbookRow = Awaited<ReturnType<typeof getCheckbooks>>[number];

/** Lectura compartida con el pago de Compras (que solo ofrece las chequeras con números libres). */
async function loadCheckbooks(companyId: string, options: { includeRetired: boolean }) {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      account_id: string;
      account_name: string;
      account_active: boolean;
      first_number: number;
      last_number: number;
      retired_at: Date | null;
      retire_reason: string | null;
      free: number;
      next_number: number | null;
      free_numbers: number[];
    }[]
  >`
    SELECT cb.id, cb.account_id, a.name AS account_name, a.is_active AS account_active, cb.first_number, cb.last_number,
           cb.retired_at, cb.retire_reason, f.free::int AS free, f.next_number,
           ARRAY(
             SELECT n FROM generate_series(cb.first_number, cb.last_number) n
             WHERE NOT EXISTS (SELECT 1 FROM own_checks o WHERE o.account_id = cb.account_id AND o.kind = 'PHYSICAL' AND o.number = n::text)
             ORDER BY n LIMIT 20
           ) AS free_numbers
    FROM checkbooks cb
    JOIN treasury_accounts a ON a.id = cb.account_id
    CROSS JOIN LATERAL (
      SELECT COUNT(*) AS free, MIN(n) AS next_number
      FROM generate_series(cb.first_number, cb.last_number) n
      WHERE NOT EXISTS (SELECT 1 FROM own_checks o WHERE o.account_id = cb.account_id AND o.kind = 'PHYSICAL' AND o.number = n::text)
    ) f
    WHERE cb.company_id = ${companyId}::uuid AND (${options.includeRetired} OR cb.retired_at IS NULL)
    ORDER BY cb.retired_at IS NOT NULL, a.name, cb.first_number
  `;
  return rows.map((r) => {
    const size = r.last_number - r.first_number + 1;
    return {
      id: r.id,
      account: { id: r.account_id, name: r.account_name, active: r.account_active },
      firstNumber: r.first_number,
      lastNumber: r.last_number,
      size,
      used: size - r.free,
      free: r.free,
      nextNumber: r.next_number === null ? null : String(r.next_number),
      /** Los primeros números libres: el pago con varios cheques de la chequera propone uno distinto a cada medio. */
      freeNumbers: r.free_numbers.map(String),
      status: checkbookStatus({ retired: r.retired_at !== null, free: r.free }),
      retireReason: r.retire_reason,
    };
  });
}

/** Chequeras para pagar en Compras: vigentes, de cuentas activas y con números libres. */
export async function getCheckbooksForPayment() {
  if (!(await checkPermissionServer('compras', 'pagos', 'update'))) return [];
  const companyId = await getActiveCompanyId();
  return (await loadCheckbooks(companyId, { includeRetired: false })).filter(
    (c) => c.status === 'ACTIVE' && c.account.active
  );
}

/** Encabezado de la tab: total EMITIDO por cuenta y cuántos están pendientes de confirmar. */
export async function getOwnChecksHeader() {
  if (!(await checkPermissionServer('tesoreria', 'cheques-propios', 'view'))) return null;
  const companyId = await getActiveCompanyId();
  const today = localToday();
  const [byAccount, pending] = await Promise.all([
    prisma.$queryRaw<{ account_id: string; name: string; total: string; count: number }[]>`
      SELECT a.id AS account_id, a.name, SUM(c.amount)::numeric(15,2)::text AS total, COUNT(*)::int AS count
      FROM own_checks c JOIN treasury_accounts a ON a.id = c.account_id
      WHERE c.company_id = ${companyId}::uuid AND c.status = 'ISSUED'
      GROUP BY a.id, a.name ORDER BY a.name
    `,
    prisma.own_checks.count({
      where: { company_id: companyId, status: 'ISSUED', payment_date: { lt: new Date(`${today}T00:00:00.000Z`) } },
    }),
  ]);
  return {
    issued: byAccount.map((r) => ({ accountId: r.account_id, name: r.name, total: r.total, count: r.count })),
    pendingConfirmation: pending,
  };
}

/** Detalle del cheque propio: datos, aviso, historial con sus documentos y deuda si está rechazado. */
export async function getOwnCheckDetail(checkId: string) {
  if (!(await checkPermissionServer('tesoreria', 'cheques-propios', 'view'))) return null;
  if (!UUID_RE.test(checkId)) return null;
  const companyId = await getActiveCompanyId();
  const row = await prisma.own_checks.findFirst({
    where: { id: checkId, company_id: companyId },
    select: {
      id: true,
      kind: true,
      number: true,
      amount: true,
      issue_date: true,
      payment_date: true,
      status: true,
      debited_on: true,
      rejected_on: true,
      reject_reason: true,
      void_reason: true,
      account: { select: { id: true, name: true, bank_name: true } },
      checkbook: { select: { id: true, first_number: true, last_number: true } },
      supplier: { select: { id: true, name: true } },
      payment_order_payment: { select: { payment_order: { select: { id: true, number: true } } } },
      events: {
        orderBy: { created_at: 'asc' },
        select: {
          id: true,
          from_status: true,
          to_status: true,
          date: true,
          reason: true,
          created_at: true,
          user: { select: { fullname: true, email: true } },
          payment_order: { select: { id: true, number: true } },
        },
      },
    },
  });
  if (!row) return null;
  const today = localToday();
  const paymentDate = isoDay(row.payment_date);
  const debt = row.status === 'REJECTED' ? (await supplierCheckDebts(prisma, [row.id])).get(row.id) ?? null : null;
  return {
    id: row.id,
    kind: row.kind,
    number: row.number,
    amount: row.amount?.toFixed(2) ?? null,
    issueDate: isoDay(row.issue_date)!,
    paymentDate,
    status: row.status,
    alert: ownCheckAlert(row.status, paymentDate, today),
    debitedOn: isoDay(row.debited_on),
    rejectedOn: isoDay(row.rejected_on),
    rejectReason: row.reject_reason,
    voidReason: row.void_reason,
    account: { id: row.account.id, name: row.account.name, bankName: row.account.bank_name },
    checkbook: row.checkbook
      ? { id: row.checkbook.id, range: `${row.checkbook.first_number} al ${row.checkbook.last_number}` }
      : null,
    supplier: row.supplier,
    paymentOrder: row.payment_order_payment?.payment_order ?? null,
    events: row.events.map((e) => ({
      id: e.id,
      fromStatus: e.from_status,
      toStatus: e.to_status,
      date: isoDay(e.date)!,
      reason: e.reason,
      createdAt: e.created_at.toISOString(),
      user: e.user.fullname ?? e.user.email ?? '',
      paymentOrder: e.payment_order,
    })),
    debt,
    today,
  };
}

export type OwnCheckDetail = NonNullable<Awaited<ReturnType<typeof getOwnCheckDetail>>>;

/** Datos del diálogo de chequera: cuentas bancarias activas. */
export async function getCheckbookFormData() {
  if (!(await checkPermissionServer('tesoreria', 'cheques-propios', 'create'))) return { accounts: [] };
  const companyId = await getActiveCompanyId();
  const accounts = await prisma.treasury_accounts.findMany({
    where: { company_id: companyId, kind: 'BANK', is_active: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  return { accounts };
}
