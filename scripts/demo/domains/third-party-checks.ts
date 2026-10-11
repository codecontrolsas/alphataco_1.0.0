/**
 * Demo de Tesorería, etapa 3a (cheques de terceros): un recibo de Neuquén O&G pagado con seis
 * cheques que quedan en todos los estados de la cartera, una carga inicial de cheques en mano y un
 * endoso a un proveedor en una orden de pago pagada.
 *
 * - RE-000007 (Neuquén O&G, hace 40 días) cobra la factura que había quedado sin cobrar (la de
 *   RE-000006, anulado) con seis cheques a la "Cartera de cheques":
 *   - dos EN CARTERA: uno por vencer para depositar y otro ya vencido;
 *   - uno depositado y acreditado (CD-000001, Galicia);
 *   - uno depositado a acreditar en 2 días (CD-000002, Nación);
 *   - uno descontado (CL-000001, Galicia, con intereses y comisión);
 *   - uno depositado y rechazado por falta de fondos (CD-000003 y CR-000001), con su deuda.
 * - Carga inicial (hace 1 día) de tres cheques de Andes: dos quedan en cartera y el tercero se
 *   endosa hoy en una orden de pago a un proveedor sobre una factura con pendiente.
 *
 * Todo se inserta directo con las mismas reglas que las actions (como el resto de la demo, no se
 * importa `src/`): movimientos de cartera y banco por operación, eventos de cada cheque y la
 * salida del banco del rechazo a max(rechazo, acreditación). `verify` controla la cartera, los
 * movimientos de cada cheque y la deuda del rechazado.
 */
import { customerId } from '../data/customers.ts';
import type { Ctx } from '../lib/ctx.ts';
import { demoId } from '../lib/ids.ts';

const C = (value: number) => BigInt(Math.round(value * 100));
const ZERO = BigInt(0);
const money = (cents: bigint) => {
  const negative = cents < ZERO;
  const abs = negative ? -cents : cents;
  return `${negative ? '-' : ''}${abs / BigInt(100)}.${String(abs % BigInt(100)).padStart(2, '0')}`;
};

type Status = 'IN_PORTFOLIO' | 'DEPOSITED' | 'ENDORSED' | 'DISCOUNTED' | 'REJECTED';

interface DemoCheck {
  key: string;
  number: string;
  bank: string;
  amount: bigint;
  /** Fecha de pago, en días desde hoy. */
  paymentDay: number;
}

export async function seedThirdPartyChecks(ctx: Ctx): Promise<void> {
  const { tx, cal, company, actorId } = ctx;
  const account = (key: string) => demoId('treasury_account', key);
  const portfolio = account('cartera');
  const checkId = (key: string) => demoId('third_party_check', key);
  const operationId = (key: string) => demoId('third_party_check_operation', key);
  let movementSeq = 0;
  const movement = async (input: { account: string; day: number; amount: bigint; kind: 'CHECK_OPERATION' | 'CUSTOMER_RECEIPT' | 'SUPPLIER_PAYMENT'; description: string; operation?: string; check?: string; receiptPayment?: string; orderPayment?: string }) => {
    movementSeq += 1;
    await tx.treasury_movements.create({
      data: {
        id: demoId('treasury_movement', `check-${movementSeq}`),
        company_id: company.id,
        account_id: input.account,
        date: cal.day(input.day),
        amount: money(input.amount),
        kind: input.kind,
        description: input.description,
        check_operation_id: input.operation ?? null,
        third_party_check_id: input.check ?? null,
        customer_receipt_payment_id: input.receiptPayment ?? null,
        payment_order_payment_id: input.orderPayment ?? null,
        created_by: actorId,
        created_at: cal.at(Math.min(input.day, 0), 12),
      },
    });
  };
  const event = (check: string, from: Status | null, to: Status, day: number, origin: { operation_id: string } | { receipt_id: string } | { payment_order_id: string }) =>
    tx.third_party_check_events.create({
      data: { check_id: checkId(check), from_status: from, to_status: to, date: cal.day(day), user_id: actorId, created_at: cal.at(Math.min(day, 0), 12), ...origin },
    });

  // ── RE-000007: la factura de Neuquén O&G que quedó sin cobrar, con seis cheques ─────────────
  const nqn = await tx.customers.findUniqueOrThrow({ where: { id: customerId({ key: 'neuquen_og' }) }, select: { id: true, name: true, cuit: true } });
  const invoice = await tx.invoices.findUniqueOrThrow({ where: { id: demoId('invoice', 'nqn-1') }, select: { id: true, total: true } });
  const invoiceTotal = C(Number(invoice.total));
  const receiptDay = -40;
  const fixed: DemoCheck[] = [
    { key: 'por-vencer', number: '71000101', bank: 'BANCO PATAGONIA', amount: C(120_000), paymentDay: -27 },
    { key: 'vencido', number: '71000102', bank: 'BANCO PATAGONIA', amount: C(150_000), paymentDay: -35 },
    { key: 'acreditado', number: '30554411', bank: 'BANCO DE LA PROVINCIA DEL NEUQUEN', amount: C(180_000), paymentDay: -6 },
    { key: 'a-acreditar', number: '30554412', bank: 'BANCO DE LA PROVINCIA DEL NEUQUEN', amount: C(200_000), paymentDay: 2 },
    { key: 'descontado', number: '88120033', bank: 'BANCO SANTANDER', amount: C(150_000), paymentDay: 20 },
  ];
  const rest = invoiceTotal - fixed.reduce((acc, c) => acc + c.amount, ZERO);
  const checks: DemoCheck[] = [...fixed, { key: 'rechazado', number: '55001207', bank: 'BANCO MACRO', amount: rest, paymentDay: -11 }];
  if (rest <= ZERO) throw new Error('demo cheques: los cheques superan la factura de Neuquén O&G');

  const last = await tx.customer_receipts.findFirst({ where: { company_id: company.id, number: { not: null } }, orderBy: { number: 'desc' }, select: { number: true } });
  const receiptNumber = `RE-${String(Number(last?.number?.slice(3) ?? '0') + 1).padStart(6, '0')}`;
  const receiptId = demoId('customer_receipt', 're-nqn-cheques');
  await tx.customer_receipts.create({
    data: {
      id: receiptId,
      company_id: company.id,
      customer_id: nqn.id,
      number: receiptNumber,
      status: 'CONFIRMED',
      date: cal.day(receiptDay),
      notes: 'Pago con cheques de la factura que había quedado sin cobrar',
      invoices_total: money(invoiceTotal),
      received_total: money(invoiceTotal),
      created_by: actorId,
      created_at: cal.at(receiptDay, 14),
      confirmed_by: actorId,
      confirmed_at: cal.at(receiptDay, 15),
      lines: { create: [{ position: 0, kind: 'INVOICE', invoice_id: invoice.id, currency: 'ARS', applied_amount: money(invoiceTotal), amount_ars: money(invoiceTotal) }] },
    },
  });
  for (const [i, c] of checks.entries()) {
    const paymentId = demoId('customer_receipt_payment', `re-nqn-cheques-${i}`);
    await tx.customer_receipt_payments.create({
      data: {
        id: paymentId,
        receipt_id: receiptId,
        method: 'CHECK',
        treasury_account_id: portfolio,
        amount: money(c.amount),
        check_number: c.number,
        check_bank: c.bank,
        check_due_on: cal.day(c.paymentDay),
        check_issue_date: cal.day(receiptDay),
        drawer_name: nqn.name,
        drawer_cuit: String(nqn.cuit),
      },
    });
    await movement({ account: portfolio, day: receiptDay, amount: c.amount, kind: 'CUSTOMER_RECEIPT', description: `${receiptNumber} — ${nqn.name} — Cheque N° ${c.number}`, receiptPayment: paymentId });
    await tx.third_party_checks.create({
      data: {
        id: checkId(c.key),
        company_id: company.id,
        kind: 'PHYSICAL',
        number: c.number,
        bank: c.bank,
        drawer_name: nqn.name,
        drawer_cuit: String(nqn.cuit),
        issue_date: cal.day(receiptDay),
        payment_date: cal.day(c.paymentDay),
        amount: money(c.amount),
        customer_id: nqn.id,
        portfolio_id: portfolio,
        receipt_payment_id: paymentId,
        created_by: actorId,
        created_at: cal.at(receiptDay, 15),
      },
    });
    await event(c.key, null, 'IN_PORTFOLIO', receiptDay, { receipt_id: receiptId });
  }
  const byKey = new Map(checks.map((c) => [c.key, c]));

  // ── Depósitos: CD-000001 (Galicia, acreditado), CD-000002 (Nación, a acreditar), CD-000003 (el que se rechaza) ──
  const deposits: { key: string; number: string; check: string; bank: 'galicia' | 'nacion'; day: number; credited: number }[] = [
    { key: 'cd-1', number: 'CD-000001', check: 'acreditado', bank: 'galicia', day: -5, credited: -5 },
    { key: 'cd-2', number: 'CD-000002', check: 'a-acreditar', bank: 'nacion', day: 0, credited: 2 },
    { key: 'cd-3', number: 'CD-000003', check: 'rechazado', bank: 'galicia', day: -10, credited: -10 },
  ];
  for (const d of deposits) {
    const c = byKey.get(d.check)!;
    await tx.third_party_check_operations.create({
      data: { id: operationId(d.key), company_id: company.id, kind: 'DEPOSIT', number: d.number, date: cal.day(d.day), bank_account_id: account(d.bank), created_by: actorId, created_at: cal.at(d.day, 11) },
    });
    await tx.third_party_check_operation_items.create({ data: { operation_id: operationId(d.key), check_id: checkId(c.key), previous_status: 'IN_PORTFOLIO', credited_on: cal.day(d.credited) } });
    const description = `${d.number} — Cheque N° ${c.number} (${c.bank})`;
    await movement({ account: portfolio, day: d.day, amount: -c.amount, kind: 'CHECK_OPERATION', description, operation: operationId(d.key), check: checkId(c.key) });
    await movement({ account: account(d.bank), day: d.credited, amount: c.amount, kind: 'CHECK_OPERATION', description, operation: operationId(d.key), check: checkId(c.key) });
    await tx.third_party_checks.update({ where: { id: checkId(c.key) }, data: { status: 'DEPOSITED', credited_on: cal.day(d.credited), bank_account_id: account(d.bank) } });
    await event(c.key, 'IN_PORTFOLIO', 'DEPOSITED', d.day, { operation_id: operationId(d.key) });
  }

  // ── Descuento CL-000001 en Galicia ─────────────────────────────────────────────
  const discounted = byKey.get('descontado')!;
  const interest = C(4_850.25);
  const fee = C(1_200);
  const net = discounted.amount - interest - fee;
  await tx.third_party_check_operations.create({
    data: { id: operationId('cl-1'), company_id: company.id, kind: 'DISCOUNT', number: 'CL-000001', date: cal.day(-3), bank_account_id: account('galicia'), interest: money(interest), fee: money(fee), reference: 'Liquidación 2210', created_by: actorId, created_at: cal.at(-3, 11) },
  });
  await tx.third_party_check_operation_items.create({ data: { operation_id: operationId('cl-1'), check_id: checkId('descontado'), previous_status: 'IN_PORTFOLIO' } });
  await movement({ account: portfolio, day: -3, amount: -discounted.amount, kind: 'CHECK_OPERATION', description: `CL-000001 — Cheque N° ${discounted.number} (${discounted.bank})`, operation: operationId('cl-1'), check: checkId('descontado') });
  await movement({ account: account('galicia'), day: -3, amount: net, kind: 'CHECK_OPERATION', description: 'CL-000001 — Descuento de 1 cheque (neto)', operation: operationId('cl-1') });
  await tx.third_party_checks.update({ where: { id: checkId('descontado') }, data: { status: 'DISCOUNTED', bank_account_id: account('galicia') } });
  await event('descontado', 'IN_PORTFOLIO', 'DISCOUNTED', -3, { operation_id: operationId('cl-1') });

  // ── Rechazo CR-000001 del depositado en CD-000003 (sin fondos) ─────────────────
  const rejected = byKey.get('rechazado')!;
  await tx.third_party_check_operations.create({
    data: { id: operationId('cr-1'), company_id: company.id, kind: 'REJECTION', number: 'CR-000001', date: cal.day(-7), reason: 'Sin fondos suficientes', returned_by: 'BANK', created_by: actorId, created_at: cal.at(-7, 10) },
  });
  await tx.third_party_check_operation_items.create({ data: { operation_id: operationId('cr-1'), check_id: checkId('rechazado'), previous_status: 'DEPOSITED' } });
  // Salida del banco a max(rechazo, acreditación): acá la acreditación (-10) ya pasó.
  await movement({ account: account('galicia'), day: -7, amount: -rejected.amount, kind: 'CHECK_OPERATION', description: `CR-000001 — Rechazo del cheque N° ${rejected.number} (${rejected.bank}): Sin fondos suficientes`, operation: operationId('cr-1'), check: checkId('rechazado') });
  await tx.third_party_checks.update({ where: { id: checkId('rechazado') }, data: { status: 'REJECTED', rejected_from: 'DEPOSITED' } });
  await event('rechazado', 'DEPOSITED', 'REJECTED', -7, { operation_id: operationId('cr-1') });

  // ── Carga inicial: tres cheques de Andes en mano; el último se endosa ─────────
  const andes = await tx.customers.findUniqueOrThrow({ where: { id: customerId({ key: 'andes' }) }, select: { id: true, name: true, cuit: true } });
  const open = await tx.$queryRaw<{ id: string; supplier_id: string; pending: string }[]>`
    SELECT si.id, si.supplier_id,
           (si.total - COALESCE((SELECT SUM(l.amount) FROM payment_order_lines l JOIN payment_orders po ON po.id = l.payment_order_id
                                 WHERE l.invoice_id = si.id AND po.status <> 'CANCELLED'), 0))::text AS pending
    FROM supplier_invoices si
    WHERE si.company_id = ${company.id}::uuid AND si.status IN ('CONFORMING', 'APPROVED') AND si.cbte_type IN (1, 6, 11)
    ORDER BY si.issue_date, si.number
  `;
  const target = open.find((r) => Number(r.pending) > 0);
  if (!target) throw new Error('demo cheques: no hay facturas de proveedor con pendiente para el endoso');
  const endorsedAmount = C(Number(target.pending));
  const opening: DemoCheck[] = [
    { key: 'inicial-1', number: '12004455', bank: 'BANCO GALICIA', amount: C(350_000), paymentDay: 15 },
    { key: 'inicial-2', number: '12004456', bank: 'BANCO GALICIA', amount: C(275_500), paymentDay: 40 },
    { key: 'endosado', number: '90010087', bank: 'BANCO BBVA', amount: endorsedAmount, paymentDay: 10 },
  ];
  await tx.third_party_check_operations.create({
    data: { id: operationId('inicial'), company_id: company.id, kind: 'OPENING', date: cal.day(-1), created_by: actorId, created_at: cal.at(-1, 9) },
  });
  for (const c of opening) {
    await tx.third_party_checks.create({
      data: {
        id: checkId(c.key),
        company_id: company.id,
        kind: c.key === 'inicial-2' ? 'ECHECK' : 'PHYSICAL',
        number: c.number,
        bank: c.bank,
        drawer_name: andes.name,
        drawer_cuit: String(andes.cuit),
        issue_date: cal.day(-20),
        payment_date: cal.day(c.paymentDay),
        amount: money(c.amount),
        customer_id: andes.id,
        portfolio_id: portfolio,
        opening_operation_id: operationId('inicial'),
        created_by: actorId,
        created_at: cal.at(-1, 9),
      },
    });
    await event(c.key, null, 'IN_PORTFOLIO', -1, { operation_id: operationId('inicial') });
    await movement({ account: portfolio, day: -1, amount: c.amount, kind: 'CHECK_OPERATION', description: `Carga inicial — Cheque N° ${c.number} — ${andes.name}`, operation: operationId('inicial'), check: checkId(c.key) });
  }

  // ── Endoso: orden de pago pagada hoy con el cheque, por el pendiente de la factura ───────────
  const endorsed = opening[2]!;
  const supplier = await tx.suppliers.findUniqueOrThrow({ where: { id: target.supplier_id }, select: { id: true, name: true } });
  const lastOrder = await tx.payment_orders.findFirst({ where: { company_id: company.id }, orderBy: { number: 'desc' }, select: { number: true } });
  const orderNumber = `OP-${String(Number(lastOrder?.number.slice(3) ?? '0') + 1).padStart(6, '0')}`;
  const orderId = demoId('payment_order', 'op-endoso');
  const orderPayment = demoId('payment_order_payment', 'op-endoso-0');
  await tx.payment_orders.create({
    data: {
      id: orderId,
      company_id: company.id,
      number: orderNumber,
      supplier_id: supplier.id,
      status: 'PAID',
      planned_on: cal.day(0),
      paid_on: cal.day(0),
      notes: 'Pagada con un cheque de tercero endosado',
      invoices_total: money(endorsedAmount),
      credits_total: '0.00',
      advance_total: '0.00',
      withholdings_total: '0.00',
      net_total: money(endorsedAmount),
      withholding_net_base: '0.00',
      withholding_vat_base: '0.00',
      submitted_at: cal.at(0, 9),
      approved_by: actorId,
      approved_at: cal.at(0, 10),
      paid_by: actorId,
      created_by: actorId,
      created_at: cal.at(0, 8),
      lines: { create: [{ position: 1, kind: 'INVOICE', amount: money(endorsedAmount), invoice_id: target.id }] },
      payments: {
        create: [
          {
            id: orderPayment,
            method: 'THIRD_PARTY_CHECK',
            treasury_account_id: portfolio,
            amount: money(endorsedAmount),
            third_party_check_id: checkId('endosado'),
            check_number: endorsed.number,
            check_bank: endorsed.bank,
            check_due_on: cal.day(endorsed.paymentDay),
          },
        ],
      },
    },
  });
  await movement({ account: portfolio, day: 0, amount: -endorsedAmount, kind: 'SUPPLIER_PAYMENT', description: `${orderNumber} — ${supplier.name} — Endoso del cheque N° ${endorsed.number} (${endorsed.bank})`, orderPayment, check: checkId('endosado') });
  await tx.third_party_checks.update({ where: { id: checkId('endosado') }, data: { status: 'ENDORSED', supplier_id: supplier.id } });
  await event('endosado', 'IN_PORTFOLIO', 'ENDORSED', 0, { payment_order_id: orderId });

  await verify(ctx, { rejectedDebt: rejected.amount });
  ctx.log(`cheques: ${checks.length + opening.length} cheques (recibo ${receiptNumber}, carga inicial y endoso en ${orderNumber})`);
}

/**
 * La cartera vale la suma de sus cheques EN CARTERA; cada cheque tiene los movimientos de su
 * historia (entrada, y salida si dejó la cartera); la deuda del rechazado es su importe.
 */
async function verify(ctx: Ctx, want: { rejectedDebt: bigint }): Promise<void> {
  const { tx, company, cal } = ctx;
  const portfolio = demoId('treasury_account', 'cartera');
  const rows = await tx.$queryRaw<{ balance: string; in_portfolio: string }[]>`
    SELECT
      (SELECT COALESCE(SUM(amount), 0)::text FROM treasury_movements WHERE account_id = ${portfolio}::uuid AND cancelled_at IS NULL AND date <= ${cal.today}::date) AS balance,
      (SELECT COALESCE(SUM(amount), 0)::text FROM third_party_checks WHERE portfolio_id = ${portfolio}::uuid AND status = 'IN_PORTFOLIO') AS in_portfolio
  `;
  if (C(Number(rows[0]?.balance ?? 'NaN')) !== C(Number(rows[0]?.in_portfolio ?? 'NaN'))) {
    throw new Error(`demo cheques: la cartera suma ${rows[0]?.balance} y sus cheques en cartera ${rows[0]?.in_portfolio}`);
  }

  // Entrada (recibo o carga inicial) y, si salió de la cartera, una salida de la cartera.
  const wrong = await tx.$queryRaw<{ number: string }[]>`
    SELECT c.number FROM third_party_checks c
    WHERE c.company_id = ${company.id}::uuid
      AND (
        (SELECT COUNT(*) FROM treasury_movements m
          WHERE m.account_id = c.portfolio_id AND m.cancelled_at IS NULL AND m.amount > 0
            AND (m.third_party_check_id = c.id OR m.customer_receipt_payment_id = c.receipt_payment_id)) <> 1
        OR (SELECT COUNT(*) FROM treasury_movements m
          WHERE m.account_id = c.portfolio_id AND m.cancelled_at IS NULL AND m.amount < 0 AND m.third_party_check_id = c.id)
          <> CASE WHEN c.status = 'IN_PORTFOLIO' THEN 0 ELSE 1 END
      )
  `;
  if (wrong.length > 0) throw new Error(`demo cheques: movimientos inconsistentes en los cheques ${wrong.map((w) => w.number).join(', ')}`);

  const debt = await tx.$queryRaw<{ pending: string }[]>`
    SELECT (c.amount - COALESCE((SELECT SUM(l.applied_amount) FROM customer_receipt_lines l JOIN customer_receipts r ON r.id = l.receipt_id
                                  WHERE l.third_party_check_id = c.id AND l.kind = 'REJECTED_CHECK' AND r.status IN ('DRAFT', 'CONFIRMED')), 0))::text AS pending
    FROM third_party_checks c WHERE c.id = ${demoId('third_party_check', 'rechazado')}::uuid
  `;
  if (C(Number(debt[0]?.pending ?? 'NaN')) !== want.rejectedDebt) throw new Error(`demo cheques: la deuda del rechazado da ${debt[0]?.pending}`);
}
