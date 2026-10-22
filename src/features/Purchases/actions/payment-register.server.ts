'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import {
  assertNotBeforeEntry,
  assertTransition,
  lockChecks,
  moveCheck,
  type LockedCheck,
} from '@/features/Treasury/lib/checks';
import {
  assertBankAccount,
  assertMoneyAccount,
  cancelMovements,
  createMovement,
} from '@/features/Treasury/lib/movements';
import {
  assertFreeNumber,
  assertNumberUnused,
  issueOwnCheck,
  lockCheckbook,
  lockOwnChecks,
  moveOwnCheck,
  type LockedCheckbook,
} from '@/features/Treasury/lib/own-checks';
import { treasuryToday } from '@/features/Treasury/lib/today';
import { TreasuryError } from '@/features/Treasury/lib/treasury-errors';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { isUuid } from '@/shared/lib/uuid';
import { revalidatePath } from 'next/cache';
import {
  NO_PERMISSION,
  SESSION_EXPIRED,
  TRANSACTION_OPTIONS,
  firstIssue,
  toPurchaseActionError,
} from '../lib/action-errors';
import { NOT_FOUND, day, isoDay, revalidate } from '../lib/payment-action-helpers';
import { lockPaymentOrder, nextCertificateNumber } from '../lib/payment-locks';
import { assertPaymentOrderStillValid, assertWithholdingsStillValid } from '../lib/payment-revalidation';
import { cents, money } from '../lib/payment-totals';
import { PurchaseError } from '../lib/purchase-errors';
import { registerPaymentFormSchema, type RegisterPaymentFormValues } from '../schemas/payment-orders';
import { requiredReasonSchema } from '../schemas/requests';

const logger = new Logger('features/Purchases/payment-orders');
const TREASURY_PATH = '/dashboard/treasury';

/**
 * Endoso de un cheque de tercero (Tesoreria etapa 3a §3.4): el medio de pago lleva el cheque, su
 * cartera y su importe; sale de la cartera a la fecha de pago y queda ENDOSADO al proveedor.
 */
async function endorseCheck(
  tx: Prisma.TransactionClient,
  input: {
    check: LockedCheck;
    companyId: string;
    orderId: string;
    orderNumber: string;
    supplier: { id: string; name: string };
    paidOn: string;
    userId: string;
  }
) {
  const { check } = input;
  if (!check) throw new TreasuryError('El cheque no existe');
  const payment = await tx.payment_order_payments.create({
    data: {
      payment_order_id: input.orderId,
      method: 'THIRD_PARTY_CHECK',
      treasury_account_id: check.portfolioId,
      amount: new Prisma.Decimal(check.amount),
      third_party_check_id: check.id,
      check_number: check.number,
      check_bank: check.bank,
      check_due_on: day(check.paymentDate),
    },
    select: { id: true },
  });
  await createMovement(tx, {
    companyId: input.companyId,
    accountId: check.portfolioId,
    date: input.paidOn,
    amountCents: -cents(check.amount),
    kind: 'SUPPLIER_PAYMENT',
    paymentOrderPaymentId: payment.id,
    thirdPartyCheckId: check.id,
    description: `${input.orderNumber} — ${input.supplier.name} — Endoso del cheque N° ${check.number} (${check.bank})`,
    createdBy: input.userId,
  });
  await moveCheck(tx, {
    check,
    action: 'ENDORSE',
    date: input.paidOn,
    userId: input.userId,
    origin: { paymentOrderId: input.orderId },
    set: { supplierId: input.supplier.id },
  });
}

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/**
 * Registra el pago: fecha real (mismo mes que la prevista) y medios que suman el neto, desde
 * cuentas activas. Numera los certificados de retencion y deja la orden pagada.
 */
export async function registerPayment(
  id: string,
  values: RegisterPaymentFormValues
): Promise<ActionResult<{ number: string; certificates: string[] }>> {
  if (!(await checkPermissionServer('compras', 'pagos', 'update'))) return fail(NO_PERMISSION);
  if (!isUuid(id)) return fail(NOT_FOUND);
  const parsed = registerPaymentFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  const v = parsed.data;
  try {
    const result = await withActor(
      profile.credentialId,
      async (tx) => {
        const order = await lockPaymentOrder(tx, companyId, id, 'pay');
        const planned = isoDay(order.plannedOn)!;
        if (planned.slice(0, 7) !== v.paidOn.slice(0, 7)) {
          const month = MONTHS[Number(planned.slice(5, 7)) - 1];
          throw new PurchaseError(
            `Las retenciones se calcularon para ${month}: volvé la orden a borrador para recalcularlas con la fecha de pago`
          );
        }
        await assertPaymentOrderStillValid(tx, companyId, id);
        await assertWithholdingsStillValid(tx, companyId, order.supplier, id);
        // Neto 0 (todo compensado con NC o anticipos): se registra sin medios de pago.
        if (v.payments.length === 0 && cents(order.netTotal) !== BigInt(0))
          throw new PurchaseError('Agregá al menos un medio de pago');
        // Cheques de terceros (Tesoreria etapa 3a): se bloquean y tienen que seguir EN CARTERA. Su
        // importe y su cartera salen del cheque, no del formulario.
        const endorsedIds = v.payments.flatMap((p) =>
          p.method === 'THIRD_PARTY_CHECK' && p.thirdPartyCheckId ? [p.thirdPartyCheckId] : []
        );
        const endorsed = await lockChecks(tx, companyId, endorsedIds);
        for (const check of endorsed.values()) {
          assertTransition(check, 'ENDORSE');
          assertNotBeforeEntry(check, v.paidOn);
        }
        const amountOf = (p: (typeof v.payments)[number]) =>
          p.method === 'THIRD_PARTY_CHECK'
            ? cents(endorsed.get(p.thirdPartyCheckId ?? '')?.amount ?? '0')
            : cents(p.amount);
        // Cheques propios (Tesoreria etapa 3b): la chequera se bloquea (dos pagos no toman el mismo
        // numero) y su cuenta es la del medio. Un e-cheq sale de una cuenta bancaria.
        const checkbooks = new Map<string, LockedCheckbook>();
        for (const checkbookId of [
          ...new Set(v.payments.flatMap((p) => (p.method === 'CHECK' && p.checkbookId ? [p.checkbookId] : []))),
        ].sort()) {
          const checkbook = await lockCheckbook(tx, companyId, checkbookId);
          if (checkbook.retired) throw new PurchaseError('La chequera está dada de baja');
          checkbooks.set(checkbookId, checkbook);
        }
        const accountOf = (p: (typeof v.payments)[number]) =>
          p.method === 'CHECK' ? checkbooks.get(p.checkbookId ?? '')?.accountId ?? '' : p.accountId;
        // Cuenta inexistente, ajena, inactiva o una cartera: el mensaje de Tesoreria nombra la cuenta.
        const accountNames = new Map<string, string>();
        for (const p of v.payments) {
          if (p.method === 'THIRD_PARTY_CHECK' || accountNames.has(accountOf(p))) continue;
          const account =
            p.method === 'CHECK' || p.method === 'ECHECK'
              ? await assertBankAccount(tx, companyId, accountOf(p))
              : await assertMoneyAccount(tx, companyId, accountOf(p));
          accountNames.set(account.id, account.name);
        }
        const total = v.payments.reduce((acc, p) => acc + amountOf(p), BigInt(0));
        if (total !== cents(order.netTotal)) {
          throw new PurchaseError(
            `Los medios suman ${money(total)} y no suman el neto a pagar (${money(cents(order.netTotal))})`
          );
        }

        const withholdings = await tx.payment_order_withholdings.findMany({
          where: { payment_order_id: id },
          select: { id: true, tax: true },
        });
        const certificates: string[] = [];
        for (const w of withholdings) {
          const number = await nextCertificateNumber(tx, companyId, w.tax);
          await tx.payment_order_withholdings.update({ where: { id: w.id }, data: { certificate_number: number } });
          certificates.push(number);
        }
        // Transferencia y efectivo generan su movimiento en esta misma transaccion. Un cheque propio
        // (fisico o e-cheq) queda EMITIDO sin movimiento: el debito lo confirma un usuario cuando el
        // banco lo paga (spec Tesoreria etapa 3b §3.2).
        for (const p of v.payments) {
          if (p.method === 'THIRD_PARTY_CHECK') {
            await endorseCheck(tx, {
              check: endorsed.get(p.thirdPartyCheckId ?? '') as LockedCheck,
              companyId,
              orderId: id,
              orderNumber: order.number,
              supplier: order.supplier,
              paidOn: v.paidOn,
              userId: profile.id,
            });
            continue;
          }
          const accountId = accountOf(p);
          if (p.method === 'CHECK' || p.method === 'ECHECK') {
            const accountName = accountNames.get(accountId) ?? '';
            const checkbook = p.method === 'CHECK' ? (checkbooks.get(p.checkbookId ?? '') as LockedCheckbook) : null;
            // El número de un e-cheq se guarda sin espacios: "1234 5678" y "12345678" son el mismo.
            let number = p.checkNumber.replace(/\s+/g, '');
            if (checkbook) number = await assertFreeNumber(tx, checkbook, number);
            else await assertNumberUnused(tx, accountId, accountName, 'ECHECK', number);
            const bank = await tx.treasury_accounts.findUniqueOrThrow({
              where: { id: accountId },
              select: { bank_name: true, name: true },
            });
            const payment = await tx.payment_order_payments.create({
              data: {
                payment_order_id: id,
                method: p.method,
                treasury_account_id: accountId,
                amount: new Prisma.Decimal(money(cents(p.amount))),
                reference: p.reference || null,
                check_number: number,
                check_bank: bank.bank_name || bank.name,
                check_due_on: day(p.checkDueOn),
              },
              select: { id: true },
            });
            await issueOwnCheck(tx, {
              companyId,
              kind: p.method === 'CHECK' ? 'PHYSICAL' : 'ECHECK',
              accountId,
              accountName,
              checkbookId: checkbook?.id ?? null,
              number,
              amountCents: cents(p.amount),
              issueDate: v.paidOn,
              paymentDate: p.checkDueOn,
              supplierId: order.supplier.id,
              paymentOrderPaymentId: payment.id,
              paymentOrderId: id,
              userId: profile.id,
            });
            continue;
          }
          const payment = await tx.payment_order_payments.create({
            data: {
              payment_order_id: id,
              method: p.method,
              treasury_account_id: accountId,
              amount: new Prisma.Decimal(money(cents(p.amount))),
              reference: p.reference || null,
            },
            select: { id: true },
          });
          await createMovement(tx, {
            companyId,
            accountId,
            date: v.paidOn,
            amountCents: -cents(p.amount),
            kind: 'SUPPLIER_PAYMENT',
            paymentOrderPaymentId: payment.id,
            description: `${order.number} — ${order.supplier.name}`,
            createdBy: profile.id,
          });
        }
        await tx.payment_orders.update({
          where: { id },
          data: { status: 'PAID', paid_on: day(v.paidOn), paid_by: profile.id },
        });
        return { number: order.number, certificates };
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidate();
    // El pago (o su anulacion) mueve el saldo de las cuentas de Tesoreria.
    revalidatePath(TREASURY_PATH, 'layout');
    return ok(result);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'registrar el pago');
  }
}

/**
 * Anula (con motivo) en cualquier estado. Libera lo aplicado; si estaba pagada, sus certificados
 * quedan anulados. No se anula si un anticipo de esta orden ya se aplico en otra.
 */
export async function cancelPaymentOrder(id: string, reason: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'pagos', 'update'))) return fail(NO_PERMISSION);
  if (!isUuid(id)) return fail(NOT_FOUND);
  const motive = requiredReasonSchema.safeParse(reason);
  if (!motive.success) return fail(firstIssue(motive.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  try {
    await withActor(
      profile.credentialId,
      async (tx) => {
        const order = await lockPaymentOrder(tx, companyId, id, 'cancel');
        const used = await tx.$queryRaw<{ number: string }[]>`
        SELECT po.number FROM payment_order_lines a
        JOIN payment_order_lines x ON x.source_line_id = a.id
        JOIN payment_orders po ON po.id = x.payment_order_id
        WHERE a.payment_order_id = ${id}::uuid AND po.status <> 'CANCELLED'
        ORDER BY po.number LIMIT 1
      `;
        if (used[0])
          throw new PurchaseError(
            `El anticipo de la ${order.number} se aplicó en la ${used[0].number}: anulá esa primero`
          );
        const now = new Date();
        if (order.status === 'PAID') {
          // Los cheques de terceros endosados vuelven a la cartera, salvo que ya los hayan rechazado.
          const endorsedPayments = await tx.payment_order_payments.findMany({
            where: { payment_order_id: id, method: 'THIRD_PARTY_CHECK', third_party_check_id: { not: null } },
            select: { third_party_check_id: true },
          });
          const endorsed = await lockChecks(
            tx,
            companyId,
            endorsedPayments.map((p) => p.third_party_check_id as string)
          );
          for (const check of endorsed.values()) {
            if (check.status === 'REJECTED') {
              const rejection = await tx.$queryRaw<{ number: string }[]>`
              SELECT o.number FROM third_party_check_operation_items i JOIN third_party_check_operations o ON o.id = i.operation_id
              WHERE i.check_id = ${check.id}::uuid AND o.kind = 'REJECTION' AND o.cancelled_at IS NULL LIMIT 1
            `;
              throw new PurchaseError(
                `El cheque Nº ${check.number} endosado en esta orden fue rechazado: anulá primero el rechazo ${rejection[0]?.number ?? ''}`.trim()
              );
            }
            await moveCheck(tx, {
              check,
              action: 'UNDO_EXIT',
              date: treasuryToday(),
              userId: profile.id,
              origin: { paymentOrderId: id },
            });
          }
          // Cheques propios (Tesoreria etapa 3b): los emitidos se anulan (su numero no se reusa); uno
          // debitado o rechazado bloquea la anulacion hasta deshacer el debito o el rechazo.
          const ownPayments = await tx.own_checks.findMany({
            where: { payment_order_payment: { payment_order_id: id } },
            select: { id: true },
          });
          const own = await lockOwnChecks(
            tx,
            companyId,
            ownPayments.map((c) => c.id)
          );
          for (const check of own.values()) {
            if (check.status === 'DEBITED')
              throw new PurchaseError(
                `El cheque Nº ${check.number} de esta orden ya se debitó: deshacé primero el débito`
              );
            if (check.status === 'REJECTED')
              throw new PurchaseError(
                `El cheque Nº ${check.number} de esta orden fue rechazado: anulá primero el rechazo`
              );
            if (check.status === 'ISSUED') {
              await moveOwnCheck(tx, {
                check,
                action: 'CANCEL',
                date: treasuryToday(),
                userId: profile.id,
                reason: motive.data,
                paymentOrderId: id,
              });
            }
          }
          await tx.payment_order_withholdings.updateMany({
            where: { payment_order_id: id },
            data: { cancelled_at: now },
          });
          await cancelMovements(tx, { paymentOrderId: id }, { by: profile.id, reason: motive.data, at: now });
        }
        await tx.payment_orders.update({
          where: { id },
          data: { status: 'CANCELLED', cancelled_by: profile.id, cancelled_at: now, cancel_reason: motive.data },
        });
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidate();
    // El pago (o su anulacion) mueve el saldo de las cuentas de Tesoreria.
    revalidatePath(TREASURY_PATH, 'layout');
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'anular la orden de pago');
  }
}
