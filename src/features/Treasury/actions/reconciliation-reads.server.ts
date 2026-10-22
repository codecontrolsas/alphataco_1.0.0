'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { UUID_RE } from '../lib/action-errors';
import { isoDay } from '../lib/dates';
import type { StatementProfileValues } from '../schemas/reconciliation';
import { localToday } from './shared';

/** Lecturas de la conciliación bancaria (la tab, el panel de una cuenta y los conceptos para registrar líneas). */

/** Máximo de líneas y de movimientos que muestra el panel (el resumen suma todos). */
const LINES_LIMIT = 500;
const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDay(d);
};

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
  const account = await prisma.treasury_accounts.findFirst({
    where: { id: accountId, company_id: companyId, kind: 'BANK' },
    select: { id: true, name: true },
  });
  if (!account) return null;
  const today = localToday();

  const lineWhere = { account_id: accountId, ...(options.showAll ? {} : { status: 'PENDING' as const }) };
  const [profile, statements, lineRows, totalLines, pendingAgg] = await Promise.all([
    prisma.bank_statement_profiles.findUnique({ where: { account_id: accountId } }),
    prisma.$queryRaw<
      {
        id: string;
        file_name: string;
        date_from: Date;
        date_to: Date;
        line_count: number;
        skipped_count: number;
        created_at: Date;
        creator: string | null;
        pending: number;
        used: number;
      }[]
    >`
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
    movement: l.movement
      ? { id: l.movement.id, date: isoDay(l.movement.date), kind: l.movement.kind, description: l.movement.description }
      : null,
  }));

  // Rango del panel del libro: el de las líneas pendientes (o, sin pendientes, los últimos 30 días) ±5 días.
  const pendingLines = lines.filter((l) => l.status === 'PENDING');
  const agg = pendingAgg[0];
  const range =
    agg?.min_date && agg.max_date
      ? { from: isoDay(agg.min_date), to: isoDay(agg.max_date) }
      : { from: addDays(today, -30), to: today };
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
            .map((c) => ({
              id: c.id,
              number: c.number,
              supplier: c.supplier?.name ?? null,
              paymentDate: c.payment_date ? isoDay(c.payment_date) : null,
            }))
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
