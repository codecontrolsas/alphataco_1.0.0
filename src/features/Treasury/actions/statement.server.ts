'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { UUID_RE } from '@/features/Treasury/schemas/shared';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import {
  ZERO_INDICATORS,
  getAccountIndicators,
  getAccountStatement,
  getBalanceOn,
  getIssuedOwnChecks,
} from '../lib/balances';
import { accountStatementRangeError } from '../lib/statement-range';
import { isCalendarDay } from '../schemas/shared';
import { localToday } from './shared';

/**
 * Extracto de una cuenta entre `from` y `to` (spec Tesorería etapa 1 §3): datos de la cuenta, sus
 * indicadores de hoy, saldo anterior, movimientos con saldo acumulado y saldo final. Lo usan la
 * página del extracto y su Excel. null si la cuenta no es de la empresa, no hay permiso o el período es inválido
 * (fechas inexistentes, «Hasta» anterior a «Desde» o más de 12 meses: ver `accountStatementRangeError`).
 */
export async function getAccountStatementData(accountId: string, from: string, to: string) {
  if (!(await checkPermissionServer('tesoreria', 'cuentas', 'view'))) return null;
  if (!UUID_RE.test(accountId) || accountStatementRangeError(from, to) !== null) return null;
  const companyId = await getActiveCompanyId();
  const account = await prisma.treasury_accounts.findFirst({
    where: { id: accountId, company_id: companyId },
    select: { id: true, kind: true, name: true, bank_name: true, account_number: true, cbu: true, is_active: true },
  });
  if (!account) return null;
  const today = localToday();
  const [indicators, statement, issuedChecks] = await Promise.all([
    getAccountIndicators(prisma, companyId, today, [accountId]),
    getAccountStatement(prisma, companyId, accountId, from, to, today),
    // Cheques propios emitidos sin débito confirmado: forman parte de "A debitar" (etapa 3b).
    account.kind === 'BANK' ? getIssuedOwnChecks(prisma, companyId, accountId) : Promise.resolve([]),
  ]);
  return {
    account,
    indicators: indicators.get(accountId) ?? ZERO_INDICATORS,
    from,
    to,
    issuedChecks,
    today,
    ...statement,
  };
}

export type AccountStatementData = NonNullable<Awaited<ReturnType<typeof getAccountStatementData>>>;

/**
 * Saldo de una cuenta al final de `date`, sin contar el movimiento que se edita. Lo usan los
 * formularios de movimiento y transferencia para mostrar cómo queda la cuenta (y pedir confirmación
 * si una caja queda en negativo). null si no hay permiso o la cuenta no es de la empresa.
 */
export async function getAccountBalanceOn(accountId: string, date: string, excludeMovementId?: string) {
  const allowed = await Promise.all([
    checkPermissionServer('tesoreria', 'movimientos', 'view'),
    checkPermissionServer('tesoreria', 'transferencias', 'view'),
  ]);
  if (!allowed.some(Boolean)) return null;
  if (!UUID_RE.test(accountId) || !isCalendarDay(date) || (excludeMovementId && !UUID_RE.test(excludeMovementId)))
    return null;
  const companyId = await getActiveCompanyId();
  const exists = await prisma.treasury_accounts.count({ where: { id: accountId, company_id: companyId } });
  if (!exists) return null;
  return getBalanceOn(prisma, companyId, accountId, date, excludeMovementId);
}
