/**
 * Demo de Tesorería, etapa 4 (conciliación bancaria): el perfil de columnas del Galicia y un
 * extracto de los últimos 20 días.
 *
 * - Cada movimiento vigente del Galicia de esos días (hasta hoy) tiene su línea en el extracto,
 *   conciliada; entre ellos, el débito del cheque propio 10002.
 * - Una comisión de mantenimiento que no estaba en el libro, registrada desde el extracto con el
 *   concepto "Gastos bancarios" (su movimiento nace conciliado).
 * - El impuesto a los débitos y créditos del período, pendiente (para conciliar en la demo).
 * - Una transferencia entre cuentas propias del banco, ignorada.
 *
 * Se inserta directo con las mismas reglas que las actions (no se importa `src/`). `verify`
 * controla que cada línea conciliada o registrada apunte a un movimiento vigente de su importe.
 */
import type { Ctx } from '../lib/ctx.ts';
import { demoId } from '../lib/ids.ts';

const C = (value: number) => BigInt(Math.round(value * 100));
const money = (cents: bigint) => {
  const negative = cents < BigInt(0);
  const abs = negative ? -cents : cents;
  return `${negative ? '-' : ''}${abs / BigInt(100)}.${String(abs % BigInt(100)).padStart(2, '0')}`;
};

export async function seedBankReconciliation(ctx: Ctx): Promise<void> {
  const { tx, cal, company, actorId } = ctx;
  const galicia = demoId('treasury_account', 'galicia');
  const statementId = demoId('bank_statement', 'galicia-1');

  await tx.bank_statement_profiles.create({
    data: {
      company_id: company.id,
      account_id: galicia,
      header_row: 1,
      date_column: 'A',
      description_column: 'B',
      reference_column: 'C',
      amount_column: 'D',
      date_format: 'DD/MM/YYYY',
      decimal_separator: ',',
      updated_by: actorId,
    },
  });

  const book = await tx.$queryRaw<{ id: string; date: Date; amount: string; description: string | null; kind: string }[]>`
    SELECT id, date, amount::text AS amount, description, kind::text AS kind FROM treasury_movements
    WHERE account_id = ${galicia}::uuid AND cancelled_at IS NULL
      AND date BETWEEN ${cal.day(-20)}::date AND ${cal.day(0)}::date AND kind <> 'OPENING'
    ORDER BY date, created_at
  `;

  type Line = { key: string; day: Date; description: string; amount: string; status: 'PENDING' | 'MATCHED' | 'CREATED' | 'IGNORED'; movementId?: string; ignoreReason?: string };
  const lines: Line[] = book.map((m, i) => ({
    key: `book-${i}`,
    day: m.date,
    description: (m.kind === 'OWN_CHECK' ? 'DEBITO CHEQUE ' : m.amount.startsWith('-') ? 'DEBITO ' : 'CREDITO ') + (m.description ?? '').toUpperCase().slice(0, 60),
    amount: m.amount,
    status: 'MATCHED',
    movementId: m.id,
  }));

  // Comisión que no estaba en el libro: se registró desde el extracto.
  const feeMovement = demoId('treasury_movement', 'conciliacion-comision');
  const fee = C(4850);
  await tx.treasury_movements.create({
    data: {
      id: feeMovement,
      company_id: company.id,
      account_id: galicia,
      date: cal.day(-5),
      amount: money(-fee),
      kind: 'MANUAL',
      concept_id: demoId('treasury_concept', 'gastos-bancarios'),
      description: 'COMISION MANTENIMIENTO CUENTA',
      created_by: actorId,
      created_at: cal.at(-1, 10),
    },
  });
  lines.push({ key: 'comision', day: cal.day(-5), description: 'COMISION MANTENIMIENTO CUENTA', amount: money(-fee), status: 'CREATED', movementId: feeMovement });
  lines.push({ key: 'impuesto', day: cal.day(-2), description: 'IMP. DEB/CRED LEY 25413', amount: money(-C(1873.42)), status: 'PENDING' });
  lines.push({ key: 'interna', day: cal.day(-3), description: 'TRANSF ENTRE CUENTAS PROPIAS (REVERSADA)', amount: money(C(15000)), status: 'IGNORED', ignoreReason: 'Reversión del banco en el mismo día' });

  const dates = lines.map((l) => l.day.getTime());
  await tx.bank_statements.create({
    data: {
      id: statementId,
      company_id: company.id,
      account_id: galicia,
      file_name: 'Galicia_movimientos.xlsx',
      date_from: new Date(Math.min(...dates)),
      date_to: new Date(Math.max(...dates)),
      line_count: lines.length,
      created_by: actorId,
      created_at: cal.at(-1, 10),
    },
  });
  const seen = new Map<string, number>();
  for (const [i, l] of lines.entries()) {
    const iso = l.day.toISOString().slice(0, 10);
    const cents = C(Number(l.amount));
    const base = `${iso}|${cents}|${l.description}|`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const done = l.status !== 'PENDING';
    await tx.bank_statement_lines.create({
      data: {
        id: demoId('bank_statement_line', l.key),
        statement_id: statementId,
        company_id: company.id,
        account_id: galicia,
        row_number: i + 2,
        date: l.day,
        description: l.description,
        reference: '',
        amount: l.amount,
        line_key: `${base}|${n}`,
        status: l.status,
        movement_id: l.movementId ?? null,
        ignore_reason: l.ignoreReason ?? null,
        reconciled_by: done ? actorId : null,
        reconciled_at: done ? cal.at(-1, 11) : null,
      },
    });
  }

  await verify(ctx);
  ctx.log(`conciliación: 1 extracto del Galicia con ${lines.length} líneas (${book.length + 1} conciliadas, 1 pendiente, 1 ignorada)`);
}

async function verify(ctx: Ctx): Promise<void> {
  const { tx, company } = ctx;
  const wrong = await tx.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM bank_statement_lines l
    LEFT JOIN treasury_movements m ON m.id = l.movement_id
    WHERE l.company_id = ${company.id}::uuid AND l.status IN ('MATCHED', 'CREATED')
      AND (m.id IS NULL OR m.cancelled_at IS NOT NULL OR m.amount <> l.amount OR m.account_id <> l.account_id)
  `;
  if (Number(wrong[0]?.n ?? 0) > 0) throw new Error('demo conciliación: hay líneas conciliadas con movimientos que no corresponden');
}
