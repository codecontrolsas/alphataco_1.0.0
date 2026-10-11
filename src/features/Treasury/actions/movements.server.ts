'use server';

import moment from 'moment';
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
import { conceptAllows, signedCents, type MovementDirection } from '../lib/movement-rules';
import { assertActiveAccount, assertEditableMovement, cancelMovements, createMovement, dateOnly, lockMovement } from '../lib/movements';
import { TreasuryError } from '../lib/treasury-errors';
import {
  cancelReasonSchema,
  manualMovementFormSchema,
  openingBalanceFormSchema,
  type ManualMovementFormValues,
  type OpeningBalanceFormValues,
} from '../schemas/movements';
import { SESSION_EXPIRED, TRANSACTION_OPTIONS, revalidateTreasury } from './shared';

/**
 * Movimientos manuales y saldo inicial (spec Tesorería etapa 1 §3). Los automáticos
 * (transferencias y pagos de Compras) no se editan ni se anulan desde acá.
 */

const logger = new Logger('features/Treasury/movements');

const NOT_FOUND = 'El movimiento no existe';

type Tx = Prisma.TransactionClient;

/**
 * El concepto existe en la empresa, está activo y admite el sentido. `allowInactive`: al editar
 * un movimiento que ya tenía ese concepto, puede conservarlo aunque se haya desactivado después.
 */
async function assertConcept(
  tx: Pick<Tx, 'treasury_concepts'>,
  companyId: string,
  conceptId: string,
  direction: MovementDirection,
  allowInactive = false
) {
  const concept = await tx.treasury_concepts.findFirst({
    where: { id: conceptId, company_id: companyId },
    select: { name: true, direction: true, is_active: true },
  });
  if (!concept) throw new TreasuryError('El concepto no existe');
  if (!concept.is_active && !allowInactive) throw new TreasuryError(`El concepto «${concept.name}» está inactivo`);
  if (!conceptAllows(concept.direction, direction)) {
    throw new TreasuryError(`El concepto «${concept.name}» es solo de ${concept.direction === 'IN' ? 'ingresos' : 'egresos'}`);
  }
}

async function canEditMovements() {
  return checkPermissionServer('tesoreria', 'movimientos', 'update');
}

export async function createManualMovement(values: ManualMovementFormValues): Promise<ActionResult<{ id: string }>> {
  if (!(await checkPermissionServer('tesoreria', 'movimientos', 'create'))) return fail(NO_PERMISSION);
  const parsed = manualMovementFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  const v = parsed.data;
  try {
    const created = await withActor(
      profile.credentialId,
      async (tx) => {
        await assertConcept(tx, companyId, v.conceptId, v.direction);
        return createMovement(tx, {
          companyId,
          accountId: v.accountId,
          date: v.date,
          amountCents: signedCents(v.direction, v.amount),
          kind: 'MANUAL',
          conceptId: v.conceptId,
          description: v.description,
          createdBy: profile.id,
        });
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidateTreasury();
    return ok(created);
  } catch (error) {
    return toTreasuryActionError(error, logger, 'registrar el movimiento');
  }
}

/** Edita todos los campos de un manual vigente. */
export async function updateManualMovement(id: string, values: ManualMovementFormValues): Promise<ActionResult> {
  if (!(await canEditMovements())) return fail(NO_PERMISSION);
  const parsed = manualMovementFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  if (!UUID_RE.test(id)) return fail(NOT_FOUND);
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  const v = parsed.data;
  try {
    await withActor(
      profile.credentialId,
      async (tx) => {
        const movement = await lockMovement(tx, companyId, id);
        if (movement.cancelled) throw new TreasuryError('El movimiento está anulado');
        assertEditableMovement(movement);
        if (movement.kind !== 'MANUAL') throw new TreasuryError('El saldo inicial se edita desde la cuenta');
        // Una cuenta inactiva no acepta movimientos nuevos, pero el movimiento puede quedarse en la
        // suya; lo mismo con el concepto. Pasarlo a otra cuenta o concepto exige que estén activos.
        if (v.accountId !== movement.accountId) await assertActiveAccount(tx, companyId, v.accountId);
        await assertConcept(tx, companyId, v.conceptId, v.direction, v.conceptId === movement.conceptId);
        await tx.treasury_movements.update({
          where: { id },
          data: {
            account_id: v.accountId,
            date: dateOnly(v.date),
            amount: new Prisma.Decimal(formatScaled(signedCents(v.direction, v.amount), AMOUNT_SCALE)),
            concept_id: v.conceptId,
            description: v.description.trim() ? v.description.trim() : null,
          },
        });
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidateTreasury();
    return ok(null);
  } catch (error) {
    return toTreasuryActionError(error, logger, 'actualizar el movimiento');
  }
}

/** Anula un manual o un saldo inicial vigente, con motivo. */
export async function cancelManualMovement(id: string, reason: string): Promise<ActionResult> {
  if (!(await canEditMovements())) return fail(NO_PERMISSION);
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
        const movement = await lockMovement(tx, companyId, id);
        assertEditableMovement(movement);
        if (movement.cancelled) throw new TreasuryError('El movimiento ya estaba anulado');
        await cancelMovements(tx, { ids: [id] }, { by: profile.id, reason: motive.data, at: new Date() });
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidateTreasury();
    return ok(null);
  } catch (error) {
    return toTreasuryActionError(error, logger, 'anular el movimiento');
  }
}

async function canSetOpening() {
  const allowed = await Promise.all([canEditMovements(), checkPermissionServer('tesoreria', 'config-tesoreria', 'update')]);
  return allowed.some(Boolean);
}

/** Un solo saldo inicial vigente por cuenta: el segundo se rechaza nombrando la fecha del vigente. */
export async function createOpeningBalance(values: OpeningBalanceFormValues): Promise<ActionResult<{ id: string }>> {
  if (!(await canSetOpening())) return fail(NO_PERMISSION);
  const parsed = openingBalanceFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  const v = parsed.data;
  try {
    const created = await withActor(
      profile.credentialId,
      async (tx) => {
        const current = await tx.treasury_movements.findFirst({
          where: { company_id: companyId, account_id: v.accountId, kind: 'OPENING', cancelled_at: null },
          select: { date: true },
        });
        if (current) {
          throw new TreasuryError(`La cuenta ya tiene saldo inicial al ${moment.utc(current.date).format('DD/MM/YYYY')}: editalo`);
        }
        return createMovement(tx, {
          companyId,
          accountId: v.accountId,
          date: v.date,
          amountCents: parseScaled(v.amount, AMOUNT_SCALE)!,
          kind: 'OPENING',
          createdBy: profile.id,
        });
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidateTreasury();
    return ok(created);
  } catch (error) {
    return toTreasuryActionError(error, logger, 'cargar el saldo inicial', 'La cuenta ya tiene saldo inicial: editalo');
  }
}

/** Edita fecha e importe del saldo inicial vigente (la cuenta no cambia). */
export async function updateOpeningBalance(id: string, values: OpeningBalanceFormValues): Promise<ActionResult> {
  if (!(await canSetOpening())) return fail(NO_PERMISSION);
  const parsed = openingBalanceFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  if (!UUID_RE.test(id)) return fail(NOT_FOUND);
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  const v = parsed.data;
  try {
    await withActor(
      profile.credentialId,
      async (tx) => {
        const movement = await lockMovement(tx, companyId, id);
        if (movement.kind !== 'OPENING' || movement.accountId !== v.accountId) throw new TreasuryError(NOT_FOUND);
        if (movement.cancelled) throw new TreasuryError('El saldo inicial está anulado');
        await assertActiveAccount(tx, companyId, movement.accountId);
        await tx.treasury_movements.update({
          where: { id },
          data: { date: dateOnly(v.date), amount: new Prisma.Decimal(formatScaled(parseScaled(v.amount, AMOUNT_SCALE)!, AMOUNT_SCALE)) },
        });
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidateTreasury();
    return ok(null);
  } catch (error) {
    return toTreasuryActionError(error, logger, 'actualizar el saldo inicial');
  }
}

/** Saldos iniciales vigentes de todas las cuentas de la empresa (para Configuración), por cuenta. */
export async function getOpeningBalances(): Promise<Record<string, { id: string; date: string; amount: string }>> {
  if (!(await checkPermissionServer('tesoreria', 'config-tesoreria', 'view'))) return {};
  const companyId = await getActiveCompanyId();
  const rows = await prisma.treasury_movements.findMany({
    where: { company_id: companyId, kind: 'OPENING', cancelled_at: null },
    select: { id: true, account_id: true, date: true, amount: true },
  });
  return Object.fromEntries(rows.map((r) => [r.account_id, { id: r.id, date: r.date.toISOString().slice(0, 10), amount: r.amount.toFixed(2) }]));
}

/** Detalle de un movimiento para el formulario de edición y el link a su origen. */
export async function getMovementDetail(id: string) {
  if (!(await checkPermissionServer('tesoreria', 'movimientos', 'view'))) return null;
  if (!UUID_RE.test(id)) return null;
  const companyId = await getActiveCompanyId();
  const m = await prisma.treasury_movements.findFirst({
    where: { id, company_id: companyId },
    select: {
      id: true,
      account_id: true,
      account: { select: { id: true, name: true, kind: true, is_active: true } },
      date: true,
      amount: true,
      kind: true,
      concept_id: true,
      description: true,
      cancelled_at: true,
      cancel_reason: true,
      transfer: { select: { id: true, number: true } },
      payment_order_payment: { select: { payment_order: { select: { id: true, number: true } } } },
      customer_receipt_payment: { select: { receipt: { select: { id: true, number: true } } } },
    },
  });
  if (!m) return null;
  const negative = m.amount.isNegative();
  return {
    id: m.id,
    accountId: m.account_id,
    account: m.account,
    date: m.date.toISOString().slice(0, 10),
    amount: m.amount.toFixed(2),
    direction: (negative ? 'OUT' : 'IN') as MovementDirection,
    absAmount: m.amount.abs().toFixed(2),
    kind: m.kind,
    conceptId: m.concept_id,
    description: m.description ?? '',
    cancelled: m.cancelled_at !== null,
    cancelReason: m.cancel_reason,
    transfer: m.transfer,
    paymentOrder: m.payment_order_payment?.payment_order ?? null,
    customerReceipt: m.customer_receipt_payment?.receipt ?? null,
  };
}

export type MovementDetail = NonNullable<Awaited<ReturnType<typeof getMovementDetail>>>;
