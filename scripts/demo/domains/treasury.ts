/**
 * Demo de Tesorería, etapa 1: conceptos, saldo inicial de las tres cuentas de Compras (Galicia,
 * Nación y la caja) al primer día del mes anterior, gastos bancarios e impuestos del mes, un aporte,
 * un retiro de caja y una transferencia del banco a la caja.
 *
 * Los pagos de Compras ya dejaron sus movimientos (`supplier-payments.ts`); el e-cheq a 30 días
 * queda "a debitar". `verify` controla que cada medio de pago tenga su movimiento y que el saldo
 * de cada cuenta dé lo esperado. Como el resto de la demo, no importa `src/` con alias.
 */
import type { Ctx } from '../lib/ctx.ts';
import { demoId } from '../lib/ids.ts';

const C = (value: number) => BigInt(Math.round(value * 100));
const money = (cents: bigint) => {
  const negative = cents < BigInt(0);
  const abs = negative ? -cents : cents;
  return `${negative ? '-' : ''}${abs / BigInt(100)}.${String(abs % BigInt(100)).padStart(2, '0')}`;
};

type AccountKey = 'galicia' | 'nacion' | 'caja';

export async function seedTreasury(ctx: Ctx): Promise<void> {
  const { tx, cal, company, actorId } = ctx;
  const account = (key: AccountKey) => demoId('treasury_account', key);
  const day = (offset: number) => new Date(`${cal.ymd(offset)}T00:00:00.000Z`);

  // ── Conceptos ────────────────────────────────────────────────────────────────
  const concepts = [
    { key: 'gastos-bancarios', name: 'Gastos bancarios', direction: 'OUT' as const },
    { key: 'imp-debitos-creditos', name: 'Impuesto a los débitos y créditos', direction: 'OUT' as const },
    { key: 'aporte-socios', name: 'Aporte de socios', direction: 'IN' as const },
    { key: 'retiro-caja', name: 'Retiro de caja', direction: 'OUT' as const },
    { key: 'ajuste', name: 'Ajuste', direction: 'BOTH' as const },
  ];
  await tx.treasury_concepts.createMany({
    data: concepts.map((c) => ({ id: demoId('treasury_concept', c.key), company_id: company.id, name: c.name, direction: c.direction })),
  });
  const concept = (key: string) => demoId('treasury_concept', key);

  // Lo que se espera de cada cuenta (sin los pagos de Compras, que se suman en verify).
  const expected: Record<AccountKey, bigint> = { galicia: BigInt(0), nacion: BigInt(0), caja: BigInt(0) };

  // ── Saldo inicial al primer día del mes anterior ────────────────────────────
  const [y, m] = cal.today.split('-').map(Number) as [number, number];
  const previousMonth = m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`;
  const openingOffset = cal.offsetOf(previousMonth);
  const openings: { key: AccountKey; amount: bigint }[] = [
    { key: 'galicia', amount: C(25_000_000) },
    { key: 'nacion', amount: C(18_000_000) },
    { key: 'caja', amount: C(500_000) },
  ];

  // ── Manuales del mes ────────────────────────────────────────────────────────
  const manuals: { key: string; account: AccountKey; offset: number; amount: bigint; concept: string; description: string }[] = [
    { key: 'aporte', account: 'galicia', offset: -10, amount: C(5_000_000), concept: 'aporte-socios', description: 'Aporte de capital de los socios' },
    { key: 'gastos-galicia', account: 'galicia', offset: -3, amount: -C(18_500), concept: 'gastos-bancarios', description: 'Mantenimiento de cuenta' },
    { key: 'idc-galicia', account: 'galicia', offset: -3, amount: -C(12_340.55), concept: 'imp-debitos-creditos', description: 'Ley 25.413' },
    { key: 'gastos-nacion', account: 'nacion', offset: -2, amount: -C(9_800), concept: 'gastos-bancarios', description: 'Comisión por transferencias' },
    { key: 'retiro-caja', account: 'caja', offset: -1, amount: -C(45_000), concept: 'retiro-caja', description: 'Gastos menores de la oficina' },
  ];

  await tx.treasury_movements.createMany({
    data: [
      ...openings.map((o) => ({
        id: demoId('treasury_movement', `opening-${o.key}`),
        company_id: company.id,
        account_id: account(o.key),
        date: day(openingOffset),
        amount: money(o.amount),
        kind: 'OPENING' as const,
        created_by: actorId,
        created_at: cal.at(openingOffset, 9),
      })),
      ...manuals.map((mv) => ({
        id: demoId('treasury_movement', mv.key),
        company_id: company.id,
        account_id: account(mv.account),
        date: day(mv.offset),
        amount: money(mv.amount),
        kind: 'MANUAL' as const,
        concept_id: concept(mv.concept),
        description: mv.description,
        created_by: actorId,
        created_at: cal.at(mv.offset, 10),
      })),
    ],
  });
  for (const o of openings) expected[o.key] += o.amount;
  for (const mv of manuals) expected[mv.account] += mv.amount;

  // ── Transferencia del banco a la caja ───────────────────────────────────────
  const transferAmount = C(300_000);
  const transferId = demoId('treasury_transfer', 'fondo-caja');
  await tx.treasury_transfers.create({
    data: {
      id: transferId,
      company_id: company.id,
      number: 'TR-000001',
      date: day(-2),
      from_account_id: account('galicia'),
      to_account_id: account('caja'),
      amount: money(transferAmount),
      notes: 'Fondo de caja',
      created_by: actorId,
      created_at: cal.at(-2, 12),
    },
  });
  await tx.treasury_movements.createMany({
    data: [
      { key: 'galicia' as const, amount: -transferAmount },
      { key: 'caja' as const, amount: transferAmount },
    ].map((t) => ({
      id: demoId('treasury_movement', `tr-fondo-caja-${t.key}`),
      company_id: company.id,
      account_id: account(t.key),
      date: day(-2),
      amount: money(t.amount),
      kind: 'TRANSFER' as const,
      transfer_id: transferId,
      description: 'TR-000001 — Fondo de caja',
      created_by: actorId,
      created_at: cal.at(-2, 12),
    })),
  });
  expected.galicia -= transferAmount;
  expected.caja += transferAmount;

  await verify(ctx, expected);
  ctx.log(`tesorería: ${concepts.length} conceptos, ${openings.length} saldos iniciales, ${manuals.length} movimientos manuales, 1 transferencia`);
}

/**
 * Cada medio de pago de Compras tiene su movimiento (o, si es un cheque propio, su cheque), y el
 * saldo de hoy de cada cuenta es lo esperado: lo cargado acá más los pagos ya debitados (calculados
 * desde `payment_order_payments` y los débitos confirmados de `own_checks`, no desde los movimientos).
 */
async function verify(ctx: Ctx, expected: Record<AccountKey, bigint>): Promise<void> {
  const { tx, company, cal } = ctx;
  const orphan = await tx.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM payment_order_payments p
    JOIN payment_orders po ON po.id = p.payment_order_id
    WHERE po.company_id = ${company.id}::uuid
      AND NOT EXISTS (SELECT 1 FROM treasury_movements m WHERE m.payment_order_payment_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM own_checks oc WHERE oc.payment_order_payment_id = p.id)
  `;
  if (Number(orphan[0]?.n ?? 0) > 0) throw new Error('demo tesorería: hay medios de pago sin movimiento');

  for (const key of Object.keys(expected) as AccountKey[]) {
    const accountId = demoId('treasury_account', key);
    const rows = await tx.$queryRaw<{ balance: string; paid: string }[]>`
      SELECT
        (SELECT COALESCE(SUM(amount), 0)::text FROM treasury_movements
          WHERE account_id = ${accountId}::uuid AND cancelled_at IS NULL AND date <= ${cal.today}::date) AS balance,
        ((SELECT COALESCE(SUM(p.amount), 0) FROM payment_order_payments p
          JOIN payment_orders po ON po.id = p.payment_order_id
          WHERE p.treasury_account_id = ${accountId}::uuid AND po.status = 'PAID'
            AND p.method NOT IN ('CHECK', 'ECHECK') AND po.paid_on <= ${cal.today}::date)
          + (SELECT COALESCE(SUM(oc.amount), 0) FROM own_checks oc
             WHERE oc.account_id = ${accountId}::uuid AND oc.status = 'DEBITED' AND oc.debited_on <= ${cal.today}::date))::text AS paid
    `;
    const toCents = (value: string) => C(Number(value));
    const want = expected[key] - toCents(rows[0]?.paid ?? '0');
    const got = toCents(rows[0]?.balance ?? '0');
    if (got !== want) throw new Error(`demo tesorería: el saldo de ${key} da ${money(got)} y se esperaba ${money(want)}`);
  }
}
