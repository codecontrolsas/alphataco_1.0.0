/**
 * Demo de Tesorería, etapa 3b (cheques propios): una chequera del Galicia y anticipos a Taller
 * Andes pagados con cheques físicos que quedan en todos los estados, más un número inutilizado.
 *
 * - Chequera Galicia, Nº 10001 al 10050.
 * - Cinco órdenes de pago (anticipos, sin retenciones) pagadas con un cheque cada una:
 *   - 10001 y 10002 debitados (movimiento OWN_CHECK en la fecha del débito);
 *   - 10003 emitido con la fecha de pago vencida: "pendiente de confirmar";
 *   - 10004 emitido con fecha de pago futura (suma en "A debitar");
 *   - 10005 rechazado por el banco: vuelve la deuda con el proveedor.
 * - 10006 inutilizado (se rompió al llenarlo).
 * El e-cheq de la orden de la grúa (Compras) queda emitido a 30 días.
 *
 * Se inserta directo con las mismas reglas que las actions (como el resto de la demo, no se importa
 * `src/`). `verify` controla que cada debitado tenga su movimiento y que ningún otro cheque lo tenga.
 */
import type { Ctx } from '../lib/ctx.ts';
import { demoId } from '../lib/ids.ts';
import { C } from '../lib/money.ts';

const money = (cents: bigint) => `${cents / BigInt(100)}.${String(cents % BigInt(100)).padStart(2, '0')}`;

type Final = 'DEBITED' | 'ISSUED' | 'REJECTED';

interface DemoOwnCheck {
  key: string;
  number: string;
  amount: bigint;
  /** Día de la orden (emisión), de la fecha de pago y del débito o rechazo, en días desde hoy. */
  day: number;
  paymentDay: number;
  final: Final;
  finalDay?: number;
}

export async function seedOwnChecks(ctx: Ctx): Promise<void> {
  const { tx, cal, company, actorId } = ctx;
  const galicia = demoId('treasury_account', 'galicia');
  const checkbookId = demoId('checkbook', 'galicia-1');
  const supplier = await tx.suppliers.findUniqueOrThrow({
    where: { id: demoId('supplier', 'taller-andes') },
    select: { id: true, name: true },
  });

  await tx.checkbooks.create({
    data: {
      id: checkbookId,
      company_id: company.id,
      account_id: galicia,
      first_number: 10001,
      last_number: 10050,
      created_by: actorId,
      created_at: cal.at(-30, 9),
    },
  });

  const checks: DemoOwnCheck[] = [
    {
      key: 'debitado-1',
      number: '10001',
      amount: C(180000),
      day: -20,
      paymentDay: -15,
      final: 'DEBITED',
      finalDay: -14,
    },
    { key: 'debitado-2', number: '10002', amount: C(95000), day: -10, paymentDay: -8, final: 'DEBITED', finalDay: -8 },
    { key: 'pendiente', number: '10003', amount: C(240000), day: -6, paymentDay: -2, final: 'ISSUED' },
    { key: 'futuro', number: '10004', amount: C(310000), day: -3, paymentDay: 10, final: 'ISSUED' },
    { key: 'rechazado', number: '10005', amount: C(150000), day: -12, paymentDay: -9, final: 'REJECTED', finalDay: -7 },
  ];

  const lastOrder = await tx.payment_orders.findFirst({
    where: { company_id: company.id },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  let orderSeq = Number(lastOrder?.number.slice(3) ?? '0');

  for (const c of checks) {
    orderSeq += 1;
    const orderNumber = `OP-${String(orderSeq).padStart(6, '0')}`;
    const orderId = demoId('payment_order', `own-${c.key}`);
    const paymentId = demoId('payment_order_payment', `own-${c.key}`);
    const checkId = demoId('own_check', c.key);
    await tx.payment_orders.create({
      data: {
        id: orderId,
        company_id: company.id,
        number: orderNumber,
        supplier_id: supplier.id,
        status: 'PAID',
        planned_on: cal.day(c.day),
        paid_on: cal.day(c.day),
        notes: 'Anticipo pagado con cheque propio',
        invoices_total: '0.00',
        credits_total: '0.00',
        advance_total: money(c.amount),
        withholdings_total: '0.00',
        net_total: money(c.amount),
        withholding_net_base: money(c.amount),
        withholding_vat_base: '0.00',
        submitted_at: cal.at(c.day - 1, 10),
        approved_by: actorId,
        approved_at: cal.at(c.day - 1, 15),
        paid_by: actorId,
        created_by: actorId,
        created_at: cal.at(c.day - 1, 9),
        lines: {
          create: [{ position: 1, kind: 'ADVANCE', amount: money(c.amount), description: 'Anticipo de reparaciones' }],
        },
        payments: {
          create: [
            {
              id: paymentId,
              method: 'CHECK',
              treasury_account_id: galicia,
              amount: money(c.amount),
              check_number: c.number,
              check_bank: 'Banco Galicia',
              check_due_on: cal.day(c.paymentDay),
            },
          ],
        },
      },
    });
    const finalDay = c.finalDay ?? c.day;
    await tx.own_checks.create({
      data: {
        id: checkId,
        company_id: company.id,
        kind: 'PHYSICAL',
        account_id: galicia,
        checkbook_id: checkbookId,
        number: c.number,
        amount: money(c.amount),
        issue_date: cal.day(c.day),
        payment_date: cal.day(c.paymentDay),
        supplier_id: supplier.id,
        payment_order_payment_id: paymentId,
        status: c.final,
        debited_on: c.final === 'DEBITED' ? cal.day(finalDay) : null,
        rejected_on: c.final === 'REJECTED' ? cal.day(finalDay) : null,
        reject_reason: c.final === 'REJECTED' ? 'Firma no coincide con la registrada' : null,
        created_by: actorId,
        created_at: cal.at(c.day, 11),
      },
    });
    await tx.own_check_events.create({
      data: {
        check_id: checkId,
        from_status: null,
        to_status: 'ISSUED',
        date: cal.day(c.day),
        payment_order_id: orderId,
        user_id: actorId,
        created_at: cal.at(c.day, 11),
      },
    });
    if (c.final !== 'ISSUED') {
      await tx.own_check_events.create({
        data: {
          check_id: checkId,
          from_status: 'ISSUED',
          to_status: c.final,
          date: cal.day(finalDay),
          reason: c.final === 'REJECTED' ? 'Firma no coincide con la registrada' : null,
          user_id: actorId,
          created_at: cal.at(finalDay, 12),
        },
      });
    }
    if (c.final === 'DEBITED') {
      await tx.treasury_movements.create({
        data: {
          id: demoId('treasury_movement', `own-${c.key}`),
          company_id: company.id,
          account_id: galicia,
          date: cal.day(finalDay),
          amount: `-${money(c.amount)}`,
          kind: 'OWN_CHECK',
          own_check_id: checkId,
          description: `Débito del cheque Nº ${c.number} — ${supplier.name} — ${orderNumber}`,
          created_by: actorId,
          created_at: cal.at(finalDay, 12),
        },
      });
    }
  }

  // Número inutilizado.
  const voidedId = demoId('own_check', 'inutilizado');
  await tx.own_checks.create({
    data: {
      id: voidedId,
      company_id: company.id,
      kind: 'PHYSICAL',
      account_id: galicia,
      checkbook_id: checkbookId,
      number: '10006',
      issue_date: cal.day(-1),
      status: 'CANCELLED',
      void_reason: 'Se rompió al llenarlo',
      created_by: actorId,
      created_at: cal.at(-1, 10),
    },
  });
  await tx.own_check_events.create({
    data: {
      check_id: voidedId,
      from_status: null,
      to_status: 'CANCELLED',
      date: cal.day(-1),
      reason: 'Se rompió al llenarlo',
      user_id: actorId,
      created_at: cal.at(-1, 10),
    },
  });

  await verify(ctx);
  ctx.log(`cheques propios: 1 chequera, ${checks.length} cheques emitidos y 1 número inutilizado`);
}

/** Cada debitado tiene exactamente un movimiento OWN_CHECK por su importe; ningún otro cheque propio tiene movimiento. */
async function verify(ctx: Ctx): Promise<void> {
  const { tx, company } = ctx;
  const wrong = await tx.$queryRaw<{ number: string }[]>`
    SELECT c.number FROM own_checks c
    WHERE c.company_id = ${company.id}::uuid
      AND (SELECT COUNT(*) FROM treasury_movements m WHERE m.own_check_id = c.id AND m.cancelled_at IS NULL AND m.amount = -c.amount AND m.date = c.debited_on)
          <> CASE WHEN c.status = 'DEBITED' THEN 1 ELSE 0 END
  `;
  if (wrong.length > 0)
    throw new Error(
      `demo cheques propios: movimientos inconsistentes en los cheques ${wrong.map((w) => w.number).join(', ')}`
    );
  const orphan = await tx.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM payment_order_payments p JOIN payment_orders po ON po.id = p.payment_order_id
    WHERE po.company_id = ${company.id}::uuid AND p.method IN ('CHECK', 'ECHECK')
      AND NOT EXISTS (SELECT 1 FROM own_checks oc WHERE oc.payment_order_payment_id = p.id)
  `;
  if (Number(orphan[0]?.n ?? 0) > 0) throw new Error('demo cheques propios: hay pagos con cheque sin su cheque propio');
}
