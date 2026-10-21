'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { AMOUNT_SCALE, formatScaled, parseScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';
import { checkPermissionServer } from '@/features/Permissions';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { NO_PERMISSION, UUID_RE, firstIssue, toTreasuryActionError } from '../lib/action-errors';
import { nextTransferNumber } from '../lib/document-number';
import { assertMoneyAccount, cancelMovements, createMovement, dateOnly } from '../lib/movements';
import { TreasuryError } from '../lib/treasury-errors';
import { cancelReasonSchema } from '../schemas/movements';
import { transferFormSchema, type TransferFormValues } from '../schemas/transfers';
import { SESSION_EXPIRED, TRANSACTION_OPTIONS, revalidateTreasury } from './shared';

/**
 * Transferencias entre cuentas (spec Tesorería etapa 1 §3). Generan dos movimientos con la misma
 * fecha; no se editan: se anulan (los dos movimientos juntos) y se cargan de nuevo.
 */

const logger = new Logger('features/Treasury/transfers');

const NOT_FOUND = 'La transferencia no existe';

export async function createTransfer(values: TransferFormValues): Promise<ActionResult<{ id: string; number: string }>> {
  if (!(await checkPermissionServer('tesoreria', 'transferencias', 'create'))) return fail(NO_PERMISSION);
  const parsed = transferFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  const v = parsed.data;
  try {
    const created = await withActor(
      profile.credentialId,
      async (tx) => {
        await assertMoneyAccount(tx, companyId, v.fromAccountId);
        await assertMoneyAccount(tx, companyId, v.toAccountId);
        const cents = parseScaled(v.amount, AMOUNT_SCALE)!;
        const number = await nextTransferNumber(tx, companyId);
        const transfer = await tx.treasury_transfers.create({
          data: {
            number,
            date: dateOnly(v.date),
            from_account_id: v.fromAccountId,
            to_account_id: v.toAccountId,
            amount: new Prisma.Decimal(formatScaled(cents, AMOUNT_SCALE)),
            notes: v.notes.trim() ? v.notes.trim() : null,
            created_by: profile.id,
          },
          select: { id: true, number: true },
        });
        const description = v.notes.trim() ? `${number} — ${v.notes.trim()}` : number;
        const common = { companyId, date: v.date, kind: 'TRANSFER' as const, transferId: transfer.id, description, createdBy: profile.id };
        await createMovement(tx, { ...common, accountId: v.fromAccountId, amountCents: -cents });
        await createMovement(tx, { ...common, accountId: v.toAccountId, amountCents: cents });
        return transfer;
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidateTreasury();
    return ok(created);
  } catch (error) {
    return toTreasuryActionError(error, logger, 'registrar la transferencia');
  }
}

/** Anula la transferencia y sus dos movimientos. La fila se toma con `FOR UPDATE`. */
export async function cancelTransfer(id: string, reason: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('tesoreria', 'transferencias', 'update'))) return fail(NO_PERMISSION);
  const motive = cancelReasonSchema.safeParse(reason);
  if (!motive.success) return fail(firstIssue(motive.error));
  if (!UUID_RE.test(id)) return fail(NOT_FOUND);
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  try {
    await withActor(
      profile.credentialId,
      async (tx) => {
        const rows = await tx.$queryRaw<{ number: string; cancelled_at: Date | null }[]>`
          SELECT number, cancelled_at FROM treasury_transfers
          WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid
          FOR UPDATE
        `;
        const transfer = rows[0];
        if (!transfer) throw new TreasuryError(NOT_FOUND);
        if (transfer.cancelled_at) throw new TreasuryError(`La ${transfer.number} ya estaba anulada`);
        const cancel = { by: profile.id, reason: motive.data, at: new Date() };
        await tx.treasury_transfers.update({
          where: { id },
          data: { cancelled_by: cancel.by, cancelled_at: cancel.at, cancel_reason: cancel.reason },
        });
        await cancelMovements(tx, { transferId: id }, cancel);
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidateTreasury();
    return ok(null);
  } catch (error) {
    return toTreasuryActionError(error, logger, 'anular la transferencia');
  }
}
