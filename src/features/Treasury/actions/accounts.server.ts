'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions';
import { AMOUNT_SCALE, parseScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { NO_PERMISSION, UUID_RE, firstIssue, toTreasuryActionError } from '../lib/action-errors';
import { ZERO_INDICATORS, getAccountIndicators } from '../lib/balances';
import { createMovement } from '../lib/movements';
import { treasuryAccountFormSchema, type TreasuryAccountFormValues } from '../schemas/accounts';
import { SESSION_EXPIRED, TRANSACTION_OPTIONS, localToday, revalidateTreasury } from './shared';

/**
 * Cuentas bancarias y cajas (spec Tesorería etapa 1 §2.1). Se administran en Configuración de
 * Tesorería; Compras las usa para pagar.
 */

const logger = new Logger('features/Treasury/accounts');

const NOT_FOUND = 'La cuenta no existe';
const duplicate = (name: string) => `Ya existe la cuenta «${name}»`;

async function accountsWithIndicators(companyId: string, onlyActive: boolean) {
  const accounts = await prisma.treasury_accounts.findMany({
    where: { company_id: companyId, ...(onlyActive ? { is_active: true } : {}) },
    select: { id: true, kind: true, name: true, bank_name: true, account_number: true, cbu: true, is_active: true },
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
  });
  const indicators = await getAccountIndicators(prisma, companyId, localToday());
  return accounts.map((a) => ({ ...a, ...(indicators.get(a.id) ?? ZERO_INDICATORS) }));
}

/**
 * Todas las cuentas de la empresa con su saldo, a debitar, a acreditar y proyectado. Las ve quien
 * configura Tesorería y quien ve los pagos de Compras (el selector de cuentas muestra el saldo).
 */
export async function getTreasuryAccounts() {
  const allowed = await Promise.all([
    checkPermissionServer('tesoreria', 'config-tesoreria', 'view'),
    checkPermissionServer('compras', 'pagos', 'view'),
  ]);
  if (!allowed.some(Boolean)) return [];
  return accountsWithIndicators(await getActiveCompanyId(), false);
}

export type TreasuryAccountRow = Awaited<ReturnType<typeof getTreasuryAccounts>>[number];

/** Tarjetas de la tab Cuentas: solo las activas. */
export async function getTreasuryAccountCards() {
  if (!(await checkPermissionServer('tesoreria', 'cuentas', 'view'))) return [];
  return accountsWithIndicators(await getActiveCompanyId(), true);
}

/** Cuentas activas para elegir en un movimiento, una transferencia o un recibo (con saldo). */
export async function getActiveTreasuryAccountOptions() {
  const allowed = await Promise.all([
    checkPermissionServer('tesoreria', 'movimientos', 'view'),
    checkPermissionServer('tesoreria', 'transferencias', 'view'),
    checkPermissionServer('tesoreria', 'cuentas', 'view'),
    checkPermissionServer('tesoreria', 'cobranzas', 'view'),
  ]);
  if (!allowed.some(Boolean)) return [];
  return accountsWithIndicators(await getActiveCompanyId(), true);
}

const orNull = (value: string) => (value.trim() ? value.trim() : null);

async function findDuplicate(companyId: string, name: string, exceptId?: string) {
  return prisma.treasury_accounts.findFirst({
    where: { company_id: companyId, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { name: true },
  });
}

/** Alta de cuenta o caja, con su saldo inicial opcional en la misma transacción. */
export async function createTreasuryAccount(values: TreasuryAccountFormValues): Promise<ActionResult<{ id: string }>> {
  if (!(await checkPermissionServer('tesoreria', 'config-tesoreria', 'update'))) return fail(NO_PERMISSION);
  const parsed = treasuryAccountFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  const v = parsed.data;
  try {
    const existing = await findDuplicate(companyId, v.name);
    if (existing) return fail(duplicate(existing.name));
    const created = await withActor(
      profile.credentialId,
      async (tx) => {
        const account = await tx.treasury_accounts.create({
          data: {
            company_id: companyId,
            kind: v.kind,
            name: v.name,
            bank_name: v.kind === 'BANK' ? orNull(v.bankName) : null,
            account_number: v.kind === 'BANK' ? orNull(v.accountNumber) : null,
            cbu: v.kind === 'BANK' ? orNull(v.cbu) : null,
          },
          select: { id: true },
        });
        if (v.openingAmount) {
          await createMovement(tx, {
            companyId,
            accountId: account.id,
            date: v.openingDate,
            amountCents: parseScaled(v.openingAmount, AMOUNT_SCALE)!,
            kind: 'OPENING',
            createdBy: profile.id,
          });
        }
        return account;
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidateTreasury();
    return ok(created);
  } catch (error) {
    return toTreasuryActionError(error, logger, 'crear la cuenta', duplicate(v.name));
  }
}

/** Edita los datos de la cuenta. El saldo inicial se edita aparte (es un movimiento). */
export async function updateTreasuryAccount(id: string, values: TreasuryAccountFormValues): Promise<ActionResult> {
  if (!(await checkPermissionServer('tesoreria', 'config-tesoreria', 'update'))) return fail(NO_PERMISSION);
  const parsed = treasuryAccountFormSchema.safeParse({ ...values, openingDate: '', openingAmount: '' });
  if (!parsed.success) return fail(firstIssue(parsed.error));
  if (!UUID_RE.test(id)) return fail(NOT_FOUND);
  const companyId = await getActiveCompanyId();
  const v = parsed.data;
  try {
    const existing = await findDuplicate(companyId, v.name, id);
    if (existing) return fail(duplicate(existing.name));
    const { count } = await prisma.treasury_accounts.updateMany({
      where: { id, company_id: companyId },
      data: {
        kind: v.kind,
        name: v.name,
        bank_name: v.kind === 'BANK' ? orNull(v.bankName) : null,
        account_number: v.kind === 'BANK' ? orNull(v.accountNumber) : null,
        cbu: v.kind === 'BANK' ? orNull(v.cbu) : null,
      },
    });
    if (count === 0) return fail(NOT_FOUND);
    revalidateTreasury();
    return ok(null);
  } catch (error) {
    return toTreasuryActionError(error, logger, 'actualizar la cuenta', duplicate(v.name));
  }
}

/**
 * Desactivar no toca los movimientos ni los pagos: la cuenta deja de aceptar movimientos nuevos y
 * de ofrecerse al pagar. El formulario confirma antes si el saldo no es 0.
 */
export async function setTreasuryAccountActive(id: string, isActive: boolean): Promise<ActionResult> {
  if (!(await checkPermissionServer('tesoreria', 'config-tesoreria', 'update'))) return fail(NO_PERMISSION);
  if (!UUID_RE.test(id)) return fail(NOT_FOUND);
  const companyId = await getActiveCompanyId();
  try {
    const { count } = await prisma.treasury_accounts.updateMany({ where: { id, company_id: companyId }, data: { is_active: isActive } });
    if (count === 0) return fail(NOT_FOUND);
    revalidateTreasury();
    return ok(null);
  } catch (error) {
    return toTreasuryActionError(error, logger, isActive ? 'reactivar la cuenta' : 'desactivar la cuenta');
  }
}

/** Solo una cuenta sin movimientos (ni anulados) ni pagos de Compras se borra; si no, se desactiva. */
export async function deleteTreasuryAccount(id: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('tesoreria', 'config-tesoreria', 'update'))) return fail(NO_PERMISSION);
  if (!UUID_RE.test(id)) return fail(NOT_FOUND);
  const companyId = await getActiveCompanyId();
  try {
    const account = await prisma.treasury_accounts.findFirst({
      where: { id, company_id: companyId },
      select: { _count: { select: { movements: true, payments: true, transfers_from: true, transfers_to: true } } },
    });
    if (!account) return fail(NOT_FOUND);
    const c = account._count;
    if (c.movements + c.payments + c.transfers_from + c.transfers_to > 0) return fail('La cuenta tiene movimientos: desactivala');
    await prisma.treasury_accounts.delete({ where: { id } });
    revalidateTreasury();
    return ok(null);
  } catch (error) {
    return toTreasuryActionError(error, logger, 'borrar la cuenta');
  }
}
