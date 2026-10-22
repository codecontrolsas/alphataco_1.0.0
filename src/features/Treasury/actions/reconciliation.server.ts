'use server';

import { AMOUNT_SCALE, amountOf, formatScaled, parseScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';
import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { NO_PERMISSION, UUID_RE, firstIssue, toTreasuryActionError, treasurySession } from '../lib/action-errors';
import { conceptAllows } from '../lib/movement-rules';
import { assertBankAccount, cancelMovements, createMovement } from '../lib/movements';
import { debitOwnCheck, lockOwnChecks } from '../lib/own-checks';
import {
  assertPending,
  autoMatchAccount,
  lockAccountReconciliation,
  lockLine,
  lockMatchableMovement,
  setLineStatus,
  statementRange,
} from '../lib/reconciliation';
import { buildStatementLines } from '../lib/statement-parse';
import { TreasuryError } from '../lib/treasury-errors';
import { cancelReasonSchema } from '../schemas/movements';
import {
  MAX_STATEMENT_ROWS,
  debitCheckLineSchema,
  ignoreLineSchema,
  importStatementSchema,
  matchLineSchema,
  registerLineSchema,
  type DebitCheckLineValues,
  type IgnoreLineValues,
  type ImportStatementValues,
  type MatchLineValues,
  type RegisterLineValues,
  type StatementProfileValues,
} from '../schemas/reconciliation';
import { SESSION_EXPIRED, TRANSACTION_OPTIONS, localToday, revalidateTreasury } from './shared';

/**
 * Conciliación bancaria (spec Tesorería etapa 4 §3): importar extractos, conciliar (automática y a
 * mano), registrar líneas como movimientos, ignorarlas, confirmar el débito de un cheque propio
 * desde su línea y deshacer. Las líneas las cambia solo `lib/reconciliation.ts`; el libro, `lib/movements.ts`.
 */

const logger = new Logger('features/Treasury/reconciliation');

const LINE_NOT_FOUND = 'La línea no existe';

const toProfile = (p: StatementProfileValues) => ({
  headerRow: p.headerRow,
  dateColumn: p.dateColumn,
  descriptionColumn: p.descriptionColumn,
  referenceColumn: p.referenceColumn || null,
  amountColumn: p.amountMode === 'SINGLE' ? p.amountColumn : null,
  debitColumn: p.amountMode === 'SPLIT' ? p.debitColumn : null,
  creditColumn: p.amountMode === 'SPLIT' ? p.creditColumn : null,
  dateFormat: p.dateFormat,
  decimalSeparator: p.decimalSeparator,
});

/**
 * Importa un extracto: guarda el perfil de la cuenta, vuelve a parsear las filas, rechaza todo si
 * alguna es inválida, saltea las ya importadas y corre la conciliación automática.
 */
export async function importStatement(
  values: ImportStatementValues
): Promise<ActionResult<{ statementId: string | null; imported: number; skipped: number; matched: number }>> {
  if (!(await checkPermissionServer('tesoreria', 'conciliacion', 'create'))) return fail(NO_PERMISSION);
  const parsed = importStatementSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const ctx = await treasurySession();
  if (!ctx) return fail(SESSION_EXPIRED);
  const { profile, companyId } = ctx;
  const v = parsed.data;
  const statementProfile = toProfile(v.profile);
  const { lines, errors } = buildStatementLines(v.rows, statementProfile);
  if (errors.length > 0)
    return fail(
      errors.length > 3 ? `${errors.slice(0, 3).join(' · ')} · y ${errors.length - 3} más` : errors.join(' · ')
    );
  if (lines.length === 0) return fail('El archivo no tiene movimientos con fecha e importe');
  if (lines.length > MAX_STATEMENT_ROWS)
    return fail(`El archivo tiene más de ${MAX_STATEMENT_ROWS} movimientos: partilo en varios`);
  try {
    const result = await withActor(
      profile.credentialId,
      async (tx) => {
        await assertBankAccount(tx, companyId, v.accountId);
        await lockAccountReconciliation(tx, v.accountId);
        const profileData = {
          header_row: statementProfile.headerRow,
          date_column: statementProfile.dateColumn,
          description_column: statementProfile.descriptionColumn,
          reference_column: statementProfile.referenceColumn,
          amount_column: statementProfile.amountColumn,
          debit_column: statementProfile.debitColumn,
          credit_column: statementProfile.creditColumn,
          date_format: statementProfile.dateFormat,
          decimal_separator: statementProfile.decimalSeparator,
          updated_by: profile.id,
        };
        await tx.bank_statement_profiles.upsert({
          where: { account_id: v.accountId },
          create: { company_id: companyId, account_id: v.accountId, ...profileData },
          update: profileData,
        });
        const existing = await tx.bank_statement_lines.findMany({
          where: { account_id: v.accountId, line_key: { in: lines.map((l) => l.key) } },
          select: { line_key: true },
        });
        const known = new Set(existing.map((e) => e.line_key));
        const fresh = lines.filter((l) => !known.has(l.key));
        const skipped = lines.length - fresh.length;
        if (fresh.length === 0) return { statementId: null, imported: 0, skipped, matched: 0 };
        const range = statementRange(fresh)!;
        const statement = await tx.bank_statements.create({
          data: {
            account_id: v.accountId,
            file_name: v.fileName,
            date_from: new Date(`${range.from}T00:00:00.000Z`),
            date_to: new Date(`${range.to}T00:00:00.000Z`),
            line_count: fresh.length,
            skipped_count: skipped,
            created_by: profile.id,
          },
          select: { id: true },
        });
        await tx.bank_statement_lines.createMany({
          data: fresh.map((l) => ({
            statement_id: statement.id,
            company_id: companyId,
            account_id: v.accountId,
            row_number: l.row,
            date: new Date(`${l.date}T00:00:00.000Z`),
            description: l.description,
            reference: l.reference,
            amount: new Prisma.Decimal(formatScaled(l.amountCents, AMOUNT_SCALE)),
            line_key: l.key,
          })),
        });
        const matched = await autoMatchAccount(tx, v.accountId, profile.id);
        return { statementId: statement.id, imported: fresh.length, skipped, matched };
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidateTreasury();
    return ok(result);
  } catch (error) {
    return toTreasuryActionError(
      error,
      logger,
      'importar el extracto',
      'Ese extracto ya se está importando. Intentá de nuevo'
    );
  }
}

/** Vuelve a correr la conciliación automática de una cuenta. */
export async function autoReconcileAccount(accountId: string): Promise<ActionResult<{ matched: number }>> {
  if (!(await checkPermissionServer('tesoreria', 'conciliacion', 'update'))) return fail(NO_PERMISSION);
  const ctx = await treasurySession();
  if (!ctx) return fail(SESSION_EXPIRED);
  const { profile, companyId } = ctx;
  try {
    const matched = await withActor(
      profile.credentialId,
      async (tx) => {
        await assertBankAccount(tx, companyId, accountId);
        await lockAccountReconciliation(tx, accountId);
        return autoMatchAccount(tx, accountId, profile.id);
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidateTreasury();
    return ok({ matched });
  } catch (error) {
    return toTreasuryActionError(error, logger, 'conciliar automáticamente');
  }
}

/** Concilia a mano una línea pendiente con un movimiento sin conciliar del mismo importe. */
export async function matchLine(values: MatchLineValues): Promise<ActionResult> {
  if (!(await checkPermissionServer('tesoreria', 'conciliacion', 'update'))) return fail(NO_PERMISSION);
  const parsed = matchLineSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const ctx = await treasurySession();
  if (!ctx) return fail(SESSION_EXPIRED);
  const { profile, companyId } = ctx;
  try {
    await withActor(
      profile.credentialId,
      async (tx) => {
        const line = await lockLine(tx, companyId, parsed.data.lineId);
        assertPending(line);
        await lockMatchableMovement(tx, line, parsed.data.movementId);
        await setLineStatus(tx, line.id, 'MATCHED', { userId: profile.id, movementId: parsed.data.movementId });
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidateTreasury();
    return ok(null);
  } catch (error) {
    return toTreasuryActionError(
      error,
      logger,
      'conciliar la línea',
      'El movimiento ya está conciliado con otra línea'
    );
  }
}

/** Registra una línea pendiente: crea su movimiento manual (con concepto) en la fecha de la línea, ya conciliado. */
export async function registerLine(values: RegisterLineValues): Promise<ActionResult> {
  if (!(await checkPermissionServer('tesoreria', 'conciliacion', 'update'))) return fail(NO_PERMISSION);
  const parsed = registerLineSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const ctx = await treasurySession();
  if (!ctx) return fail(SESSION_EXPIRED);
  const { profile, companyId } = ctx;
  const v = parsed.data;
  try {
    await withActor(
      profile.credentialId,
      async (tx) => {
        const line = await lockLine(tx, companyId, v.lineId);
        assertPending(line);
        const concept = await tx.treasury_concepts.findFirst({
          where: { id: v.conceptId, company_id: companyId },
          select: { name: true, direction: true, is_active: true },
        });
        if (!concept) throw new TreasuryError('El concepto no existe');
        if (!concept.is_active) throw new TreasuryError(`El concepto «${concept.name}» está inactivo`);
        const direction = line.amount.startsWith('-') ? 'OUT' : 'IN';
        if (!conceptAllows(concept.direction, direction)) {
          throw new TreasuryError(
            `El concepto «${concept.name}» es solo de ${concept.direction === 'IN' ? 'ingresos' : 'egresos'}`
          );
        }
        const cents = parseScaled(line.amount, AMOUNT_SCALE) ?? BigInt(0);
        const movement = await createMovement(tx, {
          companyId,
          accountId: line.accountId,
          date: line.date,
          amountCents: cents,
          kind: 'MANUAL',
          conceptId: v.conceptId,
          description: v.description || line.description,
          createdBy: profile.id,
        });
        await setLineStatus(tx, line.id, 'CREATED', { userId: profile.id, movementId: movement.id });
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidateTreasury();
    return ok(null);
  } catch (error) {
    return toTreasuryActionError(error, logger, 'registrar la línea');
  }
}

/** Ignora una línea pendiente (con motivo). */
export async function ignoreLine(values: IgnoreLineValues): Promise<ActionResult> {
  if (!(await checkPermissionServer('tesoreria', 'conciliacion', 'update'))) return fail(NO_PERMISSION);
  const parsed = ignoreLineSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const ctx = await treasurySession();
  if (!ctx) return fail(SESSION_EXPIRED);
  const { profile, companyId } = ctx;
  try {
    await withActor(
      profile.credentialId,
      async (tx) => {
        const line = await lockLine(tx, companyId, parsed.data.lineId);
        assertPending(line);
        await setLineStatus(tx, line.id, 'IGNORED', { userId: profile.id, ignoreReason: parsed.data.reason });
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidateTreasury();
    return ok(null);
  } catch (error) {
    return toTreasuryActionError(error, logger, 'ignorar la línea');
  }
}

/** Confirma el débito de un cheque propio emitido desde su línea del extracto y los concilia (spec §3.4). */
export async function debitCheckFromLine(values: DebitCheckLineValues): Promise<ActionResult> {
  if (!(await checkPermissionServer('tesoreria', 'conciliacion', 'update'))) return fail(NO_PERMISSION);
  if (!(await checkPermissionServer('tesoreria', 'cheques-propios', 'update'))) return fail(NO_PERMISSION);
  const parsed = debitCheckLineSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const ctx = await treasurySession();
  if (!ctx) return fail(SESSION_EXPIRED);
  const { profile, companyId } = ctx;
  try {
    await withActor(
      profile.credentialId,
      async (tx) => {
        const line = await lockLine(tx, companyId, parsed.data.lineId);
        assertPending(line);
        if (line.date > localToday()) throw new TreasuryError('La fecha de la línea es futura');
        const check = (await lockOwnChecks(tx, companyId, [parsed.data.checkId])).get(parsed.data.checkId)!;
        if (check.accountId !== line.accountId) throw new TreasuryError('El cheque es de otra cuenta');
        if (amountOf(check.amount ?? '0') !== -amountOf(line.amount))
          throw new TreasuryError('El cheque no tiene el importe de la línea');
        const { movementId } = await debitOwnCheck(tx, { check, date: line.date, companyId, userId: profile.id });
        await setLineStatus(tx, line.id, 'MATCHED', { userId: profile.id, movementId });
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidateTreasury();
    return ok(null);
  } catch (error) {
    return toTreasuryActionError(error, logger, 'confirmar el débito del cheque');
  }
}

/**
 * Deshace una línea: conciliada o ignorada → pendiente; registrada → además se anula el movimiento
 * creado (con motivo). La línea se libera primero: un movimiento conciliado no se puede anular.
 */
export async function unmatchLine(lineId: string, reason: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('tesoreria', 'conciliacion', 'delete'))) return fail(NO_PERMISSION);
  const motive = cancelReasonSchema.safeParse(reason);
  if (!motive.success) return fail(firstIssue(motive.error));
  if (!UUID_RE.test(lineId)) return fail(LINE_NOT_FOUND);
  const ctx = await treasurySession();
  if (!ctx) return fail(SESSION_EXPIRED);
  const { profile, companyId } = ctx;
  try {
    await withActor(
      profile.credentialId,
      async (tx) => {
        const line = await lockLine(tx, companyId, lineId);
        if (line.status === 'PENDING') throw new TreasuryError('La línea ya está pendiente');
        await setLineStatus(tx, line.id, 'PENDING', { userId: profile.id });
        if (line.status === 'CREATED' && line.movementId) {
          await cancelMovements(
            tx,
            { ids: [line.movementId] },
            { by: profile.id, reason: `Desconciliado del extracto: ${motive.data}`, at: new Date() }
          );
        }
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidateTreasury();
    return ok(null);
  } catch (error) {
    return toTreasuryActionError(error, logger, 'desconciliar la línea');
  }
}

/** Borra una importación si ninguna de sus líneas está conciliada ni registrada. */
export async function deleteStatement(statementId: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('tesoreria', 'conciliacion', 'delete'))) return fail(NO_PERMISSION);
  if (!UUID_RE.test(statementId)) return fail('La importación no existe');
  const ctx = await treasurySession();
  if (!ctx) return fail(SESSION_EXPIRED);
  const { profile, companyId } = ctx;
  try {
    await withActor(
      profile.credentialId,
      async (tx) => {
        const statement = await tx.bank_statements.findFirst({
          where: { id: statementId, company_id: companyId },
          select: { id: true, account_id: true },
        });
        if (!statement) throw new TreasuryError('La importación no existe');
        await lockAccountReconciliation(tx, statement.account_id);
        const used = await tx.bank_statement_lines.count({
          where: { statement_id: statement.id, status: { in: ['MATCHED', 'CREATED'] } },
        });
        if (used > 0)
          throw new TreasuryError(
            `La importación tiene ${used} ${used === 1 ? 'línea conciliada' : 'líneas conciliadas'}: desconcilialas primero`
          );
        await tx.bank_statements.delete({ where: { id: statement.id } });
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidateTreasury();
    return ok(null);
  } catch (error) {
    return toTreasuryActionError(error, logger, 'borrar la importación');
  }
}
