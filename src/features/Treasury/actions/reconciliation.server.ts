'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { AMOUNT_SCALE, amountOf, formatScaled, parseScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';
import { checkPermissionServer } from '@/features/Permissions';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { NO_PERMISSION, UUID_RE, firstIssue, toTreasuryActionError } from '../lib/action-errors';
import { conceptAllows } from '../lib/movement-rules';
import { assertBankAccount, cancelMovements, createMovement } from '../lib/movements';
import { debitOwnCheck, lockOwnChecks } from '../lib/own-checks';
import { assertPending, autoMatchAccount, lockAccountReconciliation, lockLine, lockMatchableMovement, setLineStatus, statementRange } from '../lib/reconciliation';
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
import { isoDay } from '../lib/dates';

/**
 * Conciliación bancaria (spec Tesorería etapa 4 §3): importar extractos, conciliar (automática y a
 * mano), registrar líneas como movimientos, ignorarlas, confirmar el débito de un cheque propio
 * desde su línea y deshacer. Las líneas las cambia solo `lib/reconciliation.ts`; el libro, `lib/movements.ts`.
 */

const logger = new Logger('features/Treasury/reconciliation');

const LINE_NOT_FOUND = 'La línea no existe';
/** Máximo de líneas y de movimientos que muestra el panel (el resumen suma todos). */
const LINES_LIMIT = 500;
const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDay(d);
};

async function session() {
  const profile = await getServerAuthProfile();
  if (!profile) return null;
  return { profile, companyId: await getActiveCompanyId() };
}

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
export async function importStatement(values: ImportStatementValues): Promise<ActionResult<{ statementId: string | null; imported: number; skipped: number; matched: number }>> {
  if (!(await checkPermissionServer('tesoreria', 'conciliacion', 'create'))) return fail(NO_PERMISSION);
  const parsed = importStatementSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const ctx = await session();
  if (!ctx) return fail(SESSION_EXPIRED);
  const { profile, companyId } = ctx;
  const v = parsed.data;
  const statementProfile = toProfile(v.profile);
  const { lines, errors } = buildStatementLines(v.rows, statementProfile);
  if (errors.length > 0) return fail(errors.length > 3 ? `${errors.slice(0, 3).join(' · ')} · y ${errors.length - 3} más` : errors.join(' · '));
  if (lines.length === 0) return fail('El archivo no tiene movimientos con fecha e importe');
  if (lines.length > MAX_STATEMENT_ROWS) return fail(`El archivo tiene más de ${MAX_STATEMENT_ROWS} movimientos: partilo en varios`);
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
            company_id: companyId,
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
    return toTreasuryActionError(error, logger, 'importar el extracto', 'Ese extracto ya se está importando. Intentá de nuevo');
  }
}

/** Vuelve a correr la conciliación automática de una cuenta. */
export async function autoReconcileAccount(accountId: string): Promise<ActionResult<{ matched: number }>> {
  if (!(await checkPermissionServer('tesoreria', 'conciliacion', 'update'))) return fail(NO_PERMISSION);
  const ctx = await session();
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
  const ctx = await session();
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
    return toTreasuryActionError(error, logger, 'conciliar la línea', 'El movimiento ya está conciliado con otra línea');
  }
}

/** Registra una línea pendiente: crea su movimiento manual (con concepto) en la fecha de la línea, ya conciliado. */
export async function registerLine(values: RegisterLineValues): Promise<ActionResult> {
  if (!(await checkPermissionServer('tesoreria', 'conciliacion', 'update'))) return fail(NO_PERMISSION);
  const parsed = registerLineSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const ctx = await session();
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
          throw new TreasuryError(`El concepto «${concept.name}» es solo de ${concept.direction === 'IN' ? 'ingresos' : 'egresos'}`);
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
  const ctx = await session();
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
  const ctx = await session();
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
        if (amountOf(check.amount ?? '0') !== -amountOf(line.amount)) throw new TreasuryError('El cheque no tiene el importe de la línea');
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
  const ctx = await session();
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
          await cancelMovements(tx, { ids: [line.movementId] }, { by: profile.id, reason: `Desconciliado del extracto: ${motive.data}`, at: new Date() });
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
  const ctx = await session();
  if (!ctx) return fail(SESSION_EXPIRED);
  const { profile, companyId } = ctx;
  try {
    await withActor(
      profile.credentialId,
      async (tx) => {
        const statement = await tx.bank_statements.findFirst({ where: { id: statementId, company_id: companyId }, select: { id: true, account_id: true } });
        if (!statement) throw new TreasuryError('La importación no existe');
        await lockAccountReconciliation(tx, statement.account_id);
        const used = await tx.bank_statement_lines.count({ where: { statement_id: statement.id, status: { in: ['MATCHED', 'CREATED'] } } });
        if (used > 0) throw new TreasuryError(`La importación tiene ${used} ${used === 1 ? 'línea conciliada' : 'líneas conciliadas'}: desconcilialas primero`);
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

// ── Lecturas ────────────────────────────────────────────────────────────────

/** Cuentas bancarias de la empresa para el selector de la tab (activas primero). */
export async function getReconciliationAccounts() {
  if (!(await checkPermissionServer('tesoreria', 'conciliacion', 'view'))) return [];
  const companyId = await getActiveCompanyId();
  return prisma.treasury_accounts.findMany({
    where: { company_id: companyId, kind: 'BANK' },
    orderBy: [{ is_active: 'desc' }, { name: 'asc' }],
    select: { id: true, name: true, is_active: true },
  });
}

/**
 * Todo lo de la conciliación de una cuenta: perfil, importaciones, líneas (pendientes o todas),
 * movimientos del libro sin conciliar en el rango de las líneas ±5 días, sugerencias por línea
 * (movimientos del mismo importe y cheques propios emitidos) y el resumen.
 */
export async function getReconciliationData(accountId: string, options: { showAll?: boolean } = {}) {
  if (!(await checkPermissionServer('tesoreria', 'conciliacion', 'view'))) return null;
  if (!UUID_RE.test(accountId)) return null;
  const companyId = await getActiveCompanyId();
  const account = await prisma.treasury_accounts.findFirst({ where: { id: accountId, company_id: companyId, kind: 'BANK' }, select: { id: true, name: true } });
  if (!account) return null;
  const today = localToday();

  const lineWhere = { account_id: accountId, ...(options.showAll ? {} : { status: 'PENDING' as const }) };
  const [profile, statements, lineRows, totalLines, pendingAgg] = await Promise.all([
    prisma.bank_statement_profiles.findUnique({ where: { account_id: accountId } }),
    prisma.$queryRaw<{ id: string; file_name: string; date_from: Date; date_to: Date; line_count: number; skipped_count: number; created_at: Date; creator: string | null; pending: number; used: number }[]>`
      SELECT s.id, s.file_name, s.date_from, s.date_to, s.line_count, s.skipped_count, s.created_at, COALESCE(p.fullname, p.email) AS creator,
             (SELECT COUNT(*)::int FROM bank_statement_lines l WHERE l.statement_id = s.id AND l.status = 'PENDING') AS pending,
             (SELECT COUNT(*)::int FROM bank_statement_lines l WHERE l.statement_id = s.id AND l.status IN ('MATCHED', 'CREATED')) AS used
      FROM bank_statements s LEFT JOIN profile p ON p.id = s.created_by
      WHERE s.account_id = ${accountId}::uuid
      ORDER BY s.created_at DESC
    `,
    // Pendientes: de la más vieja a la más nueva (se trabajan en orden). Todas: las más nuevas primero.
    prisma.bank_statement_lines.findMany({
      where: lineWhere,
      orderBy: options.showAll ? [{ date: 'desc' }, { row_number: 'desc' }] : [{ date: 'asc' }, { row_number: 'asc' }],
      take: LINES_LIMIT,
      select: {
        id: true,
        date: true,
        description: true,
        reference: true,
        amount: true,
        status: true,
        ignore_reason: true,
        movement: { select: { id: true, date: true, kind: true, description: true } },
      },
    }),
    prisma.bank_statement_lines.count({ where: lineWhere }),
    // Las cifras del resumen salen de TODAS las pendientes, no de la lista recortada.
    prisma.$queryRaw<{ min_date: Date | null; max_date: Date | null; credits: string; debits: string }[]>`
      SELECT MIN(date) AS min_date, MAX(date) AS max_date,
             COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0)::numeric(15,2)::text AS credits,
             COALESCE(SUM(amount) FILTER (WHERE amount < 0), 0)::numeric(15,2)::text AS debits
      FROM bank_statement_lines WHERE account_id = ${accountId}::uuid AND status = 'PENDING'
    `,
  ]);
  const lines = lineRows.map((l) => ({
    id: l.id,
    date: isoDay(l.date),
    description: l.description,
    reference: l.reference,
    amount: l.amount.toFixed(2),
    status: l.status,
    ignoreReason: l.ignore_reason,
    movement: l.movement ? { id: l.movement.id, date: isoDay(l.movement.date), kind: l.movement.kind, description: l.movement.description } : null,
  }));

  // Rango del panel del libro: el de las líneas pendientes (o, sin pendientes, los últimos 30 días) ±5 días.
  const pendingLines = lines.filter((l) => l.status === 'PENDING');
  const agg = pendingAgg[0];
  const range = agg?.min_date && agg.max_date ? { from: isoDay(agg.min_date), to: isoDay(agg.max_date) } : { from: addDays(today, -30), to: today };
  const from = addDays(range.from, -5);
  const to = addDays(range.to, 5);
  const movements = await prisma.treasury_movements.findMany({
    where: {
      account_id: accountId,
      cancelled_at: null,
      statement_line: { is: null },
      date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) },
    },
    orderBy: [{ date: 'asc' }, { created_at: 'asc' }],
    take: LINES_LIMIT,
    select: { id: true, date: true, amount: true, kind: true, description: true, concept: { select: { name: true } } },
  });
  const bookMovements = movements.map((m) => ({
    id: m.id,
    date: isoDay(m.date),
    amount: m.amount.toFixed(2),
    kind: m.kind,
    description: [m.concept?.name, m.description].filter(Boolean).join(' — '),
  }));

  // Sugerencias: mismo importe (cualquier fecha del panel) y cheques propios emitidos de la cuenta.
  const issuedChecks = await prisma.own_checks.findMany({
    where: { account_id: accountId, status: 'ISSUED' },
    select: { id: true, number: true, amount: true, payment_date: true, supplier: { select: { name: true } } },
  });
  const suggestions = Object.fromEntries(
    pendingLines.map((l) => {
      const sameAmount = bookMovements.filter((m) => m.amount === l.amount).map((m) => m.id);
      const checks = l.amount.startsWith('-')
        ? issuedChecks
            .filter((c) => c.amount && c.amount.toFixed(2) === l.amount.replace('-', ''))
            .map((c) => ({ id: c.id, number: c.number, supplier: c.supplier?.name ?? null, paymentDate: c.payment_date ? isoDay(c.payment_date) : null }))
        : [];
      return [l.id, { movements: sameAmount, checks }];
    })
  );

  const [book] = await prisma.$queryRaw<{ balance: string; book_in: string; book_out: string; book_count: number }[]>`
    SELECT
      (SELECT COALESCE(SUM(amount), 0) FROM treasury_movements
        WHERE account_id = ${accountId}::uuid AND cancelled_at IS NULL AND date <= ${range.to}::date)::numeric(15,2)::text AS balance,
      COALESCE(SUM(m.amount) FILTER (WHERE m.amount > 0), 0)::numeric(15,2)::text AS book_in,
      COALESCE(SUM(m.amount) FILTER (WHERE m.amount < 0), 0)::numeric(15,2)::text AS book_out,
      COUNT(*)::int AS book_count
    FROM treasury_movements m
    WHERE m.account_id = ${accountId}::uuid AND m.cancelled_at IS NULL AND m.date BETWEEN ${from}::date AND ${to}::date
      AND NOT EXISTS (SELECT 1 FROM bank_statement_lines bl WHERE bl.movement_id = m.id)
  `;

  return {
    account,
    today,
    profile: profile
      ? {
          headerRow: profile.header_row,
          dateColumn: profile.date_column,
          descriptionColumn: profile.description_column,
          referenceColumn: profile.reference_column ?? '',
          amountMode: profile.amount_column ? ('SINGLE' as const) : ('SPLIT' as const),
          amountColumn: profile.amount_column ?? '',
          debitColumn: profile.debit_column ?? '',
          creditColumn: profile.credit_column ?? '',
          dateFormat: profile.date_format as StatementProfileValues['dateFormat'],
          decimalSeparator: profile.decimal_separator as StatementProfileValues['decimalSeparator'],
        }
      : null,
    statements: statements.map((s) => ({
      id: s.id,
      fileName: s.file_name,
      dateFrom: isoDay(s.date_from),
      dateTo: isoDay(s.date_to),
      lineCount: s.line_count,
      skippedCount: s.skipped_count,
      createdAt: s.created_at.toISOString(),
      creator: s.creator,
      pending: s.pending,
      used: s.used,
    })),
    lines,
    /** Total de líneas del filtro (la lista muestra hasta LINES_LIMIT). */
    totalLines,
    bookMovements,
    totalBookMovements: book?.book_count ?? bookMovements.length,
    suggestions,
    summary: {
      to: range.to,
      bookBalance: book?.balance ?? '0.00',
      pendingCredits: agg?.credits ?? '0.00',
      pendingDebits: agg?.debits ?? '0.00',
      unreconciledIn: book?.book_in ?? '0.00',
      unreconciledOut: book?.book_out ?? '0.00',
    },
  };
}

export type ReconciliationData = NonNullable<Awaited<ReturnType<typeof getReconciliationData>>>;

/** Conceptos activos para registrar una línea (con su dirección: el diálogo filtra por el signo). */
export async function getReconciliationConcepts() {
  if (!(await checkPermissionServer('tesoreria', 'conciliacion', 'update'))) return [];
  const companyId = await getActiveCompanyId();
  return prisma.treasury_concepts.findMany({
    where: { company_id: companyId, is_active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, direction: true },
  });
}
