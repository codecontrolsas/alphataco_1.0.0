/**
 * Demo de Tesorería, etapa 2 (cobranzas): comprobantes de venta autorizados (simulados, como los
 * que emite la demo con `ARCA_MODE=mock`) y los recibos que los cobran:
 *
 * - RE-000001: cobro total por transferencia.
 * - RE-000002: cobro parcial con retenciones de Ganancias (con certificado) e IIBB Neuquén (sin).
 * - RE-000003: factura en USD cobrada en pesos a otra cotización, con un e-cheq a 30 días que entra
 *   a la cartera de cheques (Tesorería etapa 3a).
 * - RE-000004: cobro con excedente a cuenta; RE-000005 aplica ese anticipo a otra factura.
 * - RE-000006: anulado (la transferencia fue rechazada).
 * - Un borrador que reserva una factura ("En borrador" en A cobrar).
 *
 * Quedan además una ND y una NC para ver la cuenta corriente. Los comprobantes van en el punto de
 * venta de la demo: el ARCA simulado numera desde la base, así que la emisión en vivo sigue la
 * numeración. Como el resto de la demo, no importa `src/` con alias: las cuentas se hacen acá en
 * centavos y `verify` controla pendientes, anticipos y el impacto en las cuentas.
 */
import { customerId } from '../data/customers.ts';
import type { Ctx } from '../lib/ctx.ts';
import { addPdf, withoutTriggers } from '../lib/ctx.ts';
import { toDmy } from '../lib/dates.ts';
import { demoId } from '../lib/ids.ts';
import { C, money } from '../lib/money.ts';

export const CUSTOMER_DOCUMENTS_BUCKET = 'customer-documents';

const ZERO = BigInt(0);
/** Mitad hacia arriba (montos positivos). */
const divRound = (n: bigint, d: bigint) => (n * BigInt(2) + d) / (d * BigInt(2));
const vat21 = (net: bigint) => divRound(net * BigInt(21), BigInt(100));

type AccountKey = 'galicia' | 'nacion' | 'caja' | 'cartera';
const account = (key: AccountKey) => demoId('treasury_account', key);
const cust = (key: string) => customerId({ key });

interface DemoInvoice {
  key: string;
  customer: string;
  /** 1 factura A, 2 ND A, 3 NC A. */
  cbteType: 1 | 2 | 3;
  issueDay: number;
  dueDay: number | null;
  net: bigint;
  description: string;
  currency?: 'ARS' | 'USD';
  /** Cotización de ARCA al emitir (solo USD). */
  rate?: number;
  associated?: string;
}

type DemoLine =
  | { kind: 'INVOICE'; invoice: string; applied: bigint; rate?: number }
  | { kind: 'ADVANCE'; amount: bigint; description: string }
  | { kind: 'ADVANCE_APPLIED'; source: string; amount: bigint };

interface DemoPayment {
  method: 'TRANSFER' | 'CHECK' | 'ECHECK' | 'CASH';
  account: AccountKey;
  amount: bigint;
  reference?: string;
  check?: { number: string; bank: string; dueIn: number };
}

interface DemoWithholding {
  tax: 'GANANCIAS' | 'IVA' | 'IIBB' | 'SUSS';
  jurisdiction?: string;
  certificate: string;
  amount: bigint;
  pdf?: boolean;
}

interface DemoReceipt {
  key: string;
  customer: string;
  day: number;
  status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
  lines: DemoLine[];
  withholdings?: DemoWithholding[];
  payments: DemoPayment[];
  notes?: string;
  cancelReason?: string;
}

export async function seedCustomerReceipts(ctx: Ctx): Promise<void> {
  const { tx, cal, company, actorId } = ctx;
  const salesPoint = demoId('sales_point', 'casa-central');

  // ── Comprobantes ─────────────────────────────────────────────────────────────
  const invoices: DemoInvoice[] = [
    {
      key: 'andes-1',
      customer: 'andes',
      cbteType: 1,
      issueDay: -55,
      dueDay: -25,
      net: C(4_000_000),
      description: 'Servicio de transporte de cargas, agosto',
    },
    {
      key: 'andes-2',
      customer: 'andes',
      cbteType: 1,
      issueDay: -35,
      dueDay: -5,
      net: C(2_500_000),
      description: 'Hidrogrúa con operador, septiembre',
    },
    {
      key: 'vaca-usd',
      customer: 'vaca_muerta',
      cbteType: 1,
      issueDay: -15,
      dueDay: 15,
      net: C(10_000),
      description: 'Torres de iluminación en locación',
      currency: 'USD',
      rate: 1050,
    },
    {
      key: 'petro-1',
      customer: 'petro_comahue',
      cbteType: 1,
      issueDay: -40,
      dueDay: -10,
      net: C(1_000_000),
      description: 'Movimiento de materiales en yacimiento',
    },
    {
      key: 'petro-2',
      customer: 'petro_comahue',
      cbteType: 1,
      issueDay: -30,
      dueDay: -1,
      net: C(1_000_000),
      description: 'Movimiento de materiales en yacimiento',
    },
    {
      key: 'nqn-1',
      customer: 'neuquen_og',
      cbteType: 1,
      issueDay: -20,
      dueDay: 10,
      net: C(800_000),
      description: 'Traslado de personal base-locación',
    },
    {
      key: 'nqn-2',
      customer: 'neuquen_og',
      cbteType: 1,
      issueDay: -10,
      dueDay: 20,
      net: C(500_000),
      description: 'Camioneta 4x4 con chofer',
    },
    {
      key: 'vaca-ars',
      customer: 'vaca_muerta',
      cbteType: 1,
      issueDay: -8,
      dueDay: 22,
      net: C(1_500_000),
      description: 'Camión chasis con caja',
    },
    {
      key: 'andes-nd',
      customer: 'andes',
      cbteType: 2,
      issueDay: -2,
      dueDay: 28,
      net: C(100_000),
      description: 'Intereses por pago fuera de término',
      associated: 'andes-2',
    },
    {
      key: 'nqn-nc',
      customer: 'neuquen_og',
      cbteType: 3,
      issueDay: -5,
      dueDay: null,
      net: C(100_000),
      description: 'Bonificación por demora en el servicio',
      associated: 'nqn-2',
    },
  ];
  const totals = new Map<
    string,
    { total: bigint; currency: 'ARS' | 'USD'; rate: number; cbteType: number; customer: string; number: number }
  >();
  const counters = new Map<number, number>();
  const customers = new Map<string, { name: string; cuit: bigint }>();
  for (const key of new Set(invoices.map((i) => i.customer))) {
    const row = await tx.customers.findUniqueOrThrow({ where: { id: cust(key) }, select: { name: true, cuit: true } });
    customers.set(key, row);
  }

  const invoiceId = (key: string) => demoId('invoice', key);
  await tx.invoices.createMany({
    data: invoices.map((inv) => {
      const number = (counters.get(inv.cbteType) ?? 0) + 1;
      counters.set(inv.cbteType, number);
      const vat = vat21(inv.net);
      const total = inv.net + vat;
      const currency = inv.currency ?? 'ARS';
      totals.set(inv.key, {
        total,
        currency,
        rate: inv.rate ?? 1,
        cbteType: inv.cbteType,
        customer: inv.customer,
        number,
      });
      const customer = customers.get(inv.customer)!;
      return {
        id: invoiceId(inv.key),
        company_id: company.id,
        environment: 'homologacion' as const,
        status: 'autorizada' as const,
        simulated: true,
        sales_point_id: salesPoint,
        customer_id: cust(inv.customer),
        cbte_type: inv.cbteType,
        number,
        concept: 2,
        issue_date: cal.day(inv.issueDay),
        service_from: cal.day(inv.issueDay - 30),
        service_to: cal.day(inv.issueDay),
        payment_due_date: inv.dueDay === null ? null : cal.day(inv.dueDay),
        currency,
        arca_currency_id: currency === 'ARS' ? 'PES' : 'DOL',
        exchange_rate: String(inv.rate ?? 1),
        exchange_rate_date: currency === 'ARS' ? null : cal.day(inv.issueDay - 1),
        net_taxed: money(inv.net),
        vat_total: money(vat),
        total: money(total),
        receiver_doc_number: customer.cuit,
        receiver_vat_condition_id: 1,
        associated_invoice_id: inv.associated ? invoiceId(inv.associated) : null,
        cae: String(76_000_000_000_000 + inv.cbteType * 1000 + number),
        cae_due_date: cal.day(inv.issueDay + 10),
        authorized_at: cal.at(inv.issueDay, 10),
        created_by: actorId,
        emitted_by: actorId,
        created_at: cal.at(inv.issueDay, 9),
      };
    }),
  });
  // Línea y alícuota de cada comprobante: la guarda de hijos no deja tocar un autorizado.
  await withoutTriggers(tx, async () => {
    await tx.invoice_lines.createMany({
      data: invoices.map((inv) => ({
        invoice_id: invoiceId(inv.key),
        position: 1,
        description: inv.description,
        quantity: '1',
        unit_price: money(inv.net),
        net_amount: money(inv.net),
        vat_rate_id: 5,
      })),
    });
    await tx.invoice_vat.createMany({
      data: invoices.map((inv) => ({
        invoice_id: invoiceId(inv.key),
        vat_rate_id: 5,
        base_amount: money(inv.net),
        vat_amount: money(vat21(inv.net)),
      })),
    });
  });
  const total = (key: string) => totals.get(key)!.total;

  // ── Recibos ──────────────────────────────────────────────────────────────────
  const andes2 = total('andes-2');
  const andes2Applied = C(2_000_000);
  const gan = C(60_500);
  const iibb = C(45_375);
  const vacaUsd = total('vaca-usd');
  const vacaUsdArs = divRound(vacaUsd * BigInt(1100), BigInt(1));
  const petroPaid = C(1_500_000);
  const petroAdvance = petroPaid - total('petro-1');
  const receipts: DemoReceipt[] = [
    {
      key: 're-andes-1',
      customer: 'andes',
      day: -20,
      status: 'CONFIRMED',
      lines: [{ kind: 'INVOICE', invoice: 'andes-1', applied: total('andes-1') }],
      payments: [{ method: 'TRANSFER', account: 'galicia', amount: total('andes-1'), reference: 'Op. 88213' }],
    },
    {
      key: 're-andes-2',
      customer: 'andes',
      day: -3,
      status: 'CONFIRMED',
      lines: [{ kind: 'INVOICE', invoice: 'andes-2', applied: andes2Applied }],
      withholdings: [
        { tax: 'GANANCIAS', certificate: '0001-00004512', amount: gan, pdf: true },
        { tax: 'IIBB', jurisdiction: 'Neuquén', certificate: 'IB-2026-0331', amount: iibb },
      ],
      payments: [{ method: 'TRANSFER', account: 'nacion', amount: andes2Applied - gan - iibb, reference: 'Op. 90155' }],
      notes: 'Pago parcial: el saldo lo cancelan con la ND de intereses',
    },
    {
      key: 're-vaca-usd',
      customer: 'vaca_muerta',
      day: -1,
      status: 'CONFIRMED',
      lines: [{ kind: 'INVOICE', invoice: 'vaca-usd', applied: vacaUsd, rate: 1100 }],
      payments: [
        {
          method: 'ECHECK',
          account: 'cartera',
          amount: vacaUsdArs,
          check: { number: '40012877', bank: 'Banco Galicia', dueIn: 30 },
        },
      ],
    },
    {
      key: 're-petro-1',
      customer: 'petro_comahue',
      day: -12,
      status: 'CONFIRMED',
      lines: [
        { kind: 'INVOICE', invoice: 'petro-1', applied: total('petro-1') },
        { kind: 'ADVANCE', amount: petroAdvance, description: 'Excedente del pago, a cuenta de la próxima factura' },
      ],
      payments: [{ method: 'TRANSFER', account: 'galicia', amount: petroPaid, reference: 'Op. 87701' }],
    },
    {
      key: 're-petro-2',
      customer: 'petro_comahue',
      day: -2,
      status: 'CONFIRMED',
      lines: [
        { kind: 'INVOICE', invoice: 'petro-2', applied: total('petro-2') },
        { kind: 'ADVANCE_APPLIED', source: 're-petro-1', amount: petroAdvance },
      ],
      payments: [{ method: 'CASH', account: 'caja', amount: total('petro-2') - petroAdvance }],
    },
    {
      key: 're-nqn-1',
      customer: 'neuquen_og',
      day: -6,
      status: 'CANCELLED',
      lines: [{ kind: 'INVOICE', invoice: 'nqn-1', applied: total('nqn-1') }],
      payments: [{ method: 'TRANSFER', account: 'nacion', amount: total('nqn-1'), reference: 'Op. 89040' }],
      cancelReason: 'La transferencia fue rechazada por el banco',
    },
    {
      key: 're-vaca-draft',
      customer: 'vaca_muerta',
      day: 0,
      status: 'DRAFT',
      lines: [{ kind: 'INVOICE', invoice: 'vaca-ars', applied: total('vaca-ars') }],
      payments: [{ method: 'TRANSFER', account: 'galicia', amount: total('vaca-ars') }],
    },
  ];

  const receiptId = (key: string) => demoId('customer_receipt', key);
  const lineId = (receipt: string, i: number) => demoId('customer_receipt_line', `${receipt}-${i}`);
  /** Movimientos esperados por cuenta (vigentes, con fecha ≤ hoy). */
  const expected: Record<AccountKey, bigint> = { galicia: ZERO, nacion: ZERO, caja: ZERO, cartera: ZERO };
  let sequence = 0;

  for (const r of receipts) {
    const numbered = r.status !== 'DRAFT';
    if (numbered) sequence += 1;
    const number = numbered ? `RE-${String(sequence).padStart(6, '0')}` : null;
    const customer = customers.get(r.customer)!;
    let invoicesTotal = ZERO;
    let advanceTotal = ZERO;
    let appliedTotal = ZERO;
    let fxTotal = ZERO;
    const lines = r.lines.map((l, i) => {
      const base = { id: lineId(r.key, i), receipt_id: receiptId(r.key), position: i };
      if (l.kind === 'INVOICE') {
        const inv = totals.get(l.invoice)!;
        const rate = l.rate ?? 1;
        const ars = divRound(l.applied * BigInt(Math.round(rate * 1_000_000)), BigInt(1_000_000));
        const fx =
          inv.currency === 'ARS'
            ? ZERO
            : divRound(l.applied * BigInt(Math.round((rate - inv.rate) * 1_000_000)), BigInt(1_000_000));
        invoicesTotal += ars;
        fxTotal += fx;
        return {
          ...base,
          kind: 'INVOICE' as const,
          invoice_id: invoiceId(l.invoice),
          currency: inv.currency,
          applied_amount: money(l.applied),
          exchange_rate: String(rate),
          invoice_exchange_rate: String(inv.rate),
          amount_ars: money(ars),
          fx_difference: money(fx),
        };
      }
      if (l.kind === 'ADVANCE') {
        advanceTotal += l.amount;
        return {
          ...base,
          kind: 'ADVANCE' as const,
          currency: 'ARS',
          applied_amount: money(l.amount),
          amount_ars: money(l.amount),
          description: l.description,
        };
      }
      appliedTotal += l.amount;
      return {
        ...base,
        kind: 'ADVANCE_APPLIED' as const,
        source_line_id: lineId(
          l.source,
          receipts.find((x) => x.key === l.source)!.lines.findIndex((x) => x.kind === 'ADVANCE')
        ),
        currency: 'ARS',
        applied_amount: money(l.amount),
        amount_ars: money(l.amount),
      };
    });
    const withholdingsTotal = (r.withholdings ?? []).reduce((acc, w) => acc + w.amount, ZERO);
    const receivedTotal = r.payments.reduce((acc, p) => acc + p.amount, ZERO);
    if (invoicesTotal + advanceTotal !== appliedTotal + withholdingsTotal + receivedTotal) {
      throw new Error(`demo cobranzas: ${r.key} no cierra`);
    }

    const confirmedAt = cal.at(r.day, 15);
    const cancelled = r.status === 'CANCELLED';
    await tx.customer_receipts.create({
      data: {
        id: receiptId(r.key),
        company_id: company.id,
        customer_id: cust(r.customer),
        number,
        status: r.status,
        date: cal.day(r.day),
        notes: r.notes ?? null,
        invoices_total: money(invoicesTotal),
        advance_total: money(advanceTotal),
        advances_applied_total: money(appliedTotal),
        withholdings_total: money(withholdingsTotal),
        received_total: money(receivedTotal),
        fx_difference_total: money(fxTotal),
        created_by: actorId,
        created_at: cal.at(r.day, 14),
        confirmed_by: numbered ? actorId : null,
        confirmed_at: numbered ? confirmedAt : null,
        cancelled_by: cancelled ? actorId : null,
        cancelled_at: cancelled ? cal.at(r.day + 2, 10) : null,
        cancel_reason: cancelled ? r.cancelReason ?? 'Anulado' : null,
      },
    });
    await tx.customer_receipt_lines.createMany({ data: lines });

    for (const [i, w] of (r.withholdings ?? []).entries()) {
      const key = w.pdf
        ? `${company.id}/${cust(r.customer)}/withholdings/${cal.ymd(r.day)}-certificado-${w.tax.toLowerCase()}.pdf`
        : null;
      if (key) {
        await addPdf(ctx, CUSTOMER_DOCUMENTS_BUCKET, key, {
          title: 'Certificado de retención',
          reference: w.certificate,
          fields: [
            ['Agente de retención', customer.name],
            ['CUIT', String(customer.cuit)],
            ['Sujeto retenido', company.name],
            ['Impuesto', w.tax === 'GANANCIAS' ? 'Impuesto a las Ganancias' : w.tax],
            ['Certificado N°', w.certificate],
            ['Fecha', toDmy(cal.ymd(r.day))],
            ['Importe retenido', `$ ${money(w.amount)}`],
          ],
        });
      }
      await tx.customer_receipt_withholdings.create({
        data: {
          id: demoId('customer_receipt_withholding', `${r.key}-${i}`),
          receipt_id: receiptId(r.key),
          company_id: company.id,
          customer_id: cust(r.customer),
          tax: w.tax,
          jurisdiction: w.jurisdiction ?? null,
          certificate_number: w.certificate,
          certificate_date: cal.day(r.day),
          amount: money(w.amount),
          file_path: key,
          file_name: key ? `certificado-${w.tax.toLowerCase()}.pdf` : null,
        },
      });
    }

    for (const [i, p] of r.payments.entries()) {
      const paymentId = demoId('customer_receipt_payment', `${r.key}-${i}`);
      // Desde la etapa 3a los cheques entran a la cartera el día del cobro (no en su fecha de pago).
      const dueDay = r.day;
      await tx.customer_receipt_payments.create({
        data: {
          id: paymentId,
          receipt_id: receiptId(r.key),
          method: p.method,
          treasury_account_id: account(p.account),
          amount: money(p.amount),
          reference: p.reference ?? null,
          check_number: p.check?.number ?? null,
          check_bank: p.check ? p.check.bank.toUpperCase() : null,
          check_due_on: p.check ? cal.day(r.day + p.check.dueIn) : null,
          check_issue_date: p.check ? cal.day(r.day) : null,
          drawer_name: p.check ? customer.name : null,
          drawer_cuit: p.check ? String(customer.cuit) : null,
        },
      });
      // Tesorería: cada medio de un recibo confirmado (o anulado) es un movimiento CUSTOMER_RECEIPT,
      // con la misma regla de fecha que la confirmación. Los borradores no mueven nada.
      if (!numbered) continue;
      await tx.treasury_movements.create({
        data: {
          id: demoId('treasury_movement', `${r.key}-${i}`),
          company_id: company.id,
          account_id: account(p.account),
          date: cal.day(dueDay),
          amount: money(p.amount),
          kind: 'CUSTOMER_RECEIPT',
          description: `${number} — ${customer.name}${p.check ? ` — Cheque N° ${p.check.number}` : ''}`,
          customer_receipt_payment_id: paymentId,
          created_by: actorId,
          created_at: confirmedAt,
          cancelled_by: cancelled ? actorId : null,
          cancelled_at: cancelled ? cal.at(r.day + 2, 10) : null,
          cancel_reason: cancelled ? r.cancelReason ?? 'Anulado' : null,
        },
      });
      if (!cancelled && dueDay <= 0) expected[p.account] += p.amount;
      // Cada cheque de un recibo confirmado entra EN CARTERA, con su primer evento.
      if (p.check && !cancelled) {
        const checkId = demoId('third_party_check', `${r.key}-${i}`);
        await tx.third_party_checks.create({
          data: {
            id: checkId,
            company_id: company.id,
            kind: p.method === 'ECHECK' ? 'ECHECK' : 'PHYSICAL',
            number: p.check.number,
            bank: p.check.bank.toUpperCase(),
            drawer_name: customer.name,
            drawer_cuit: String(customer.cuit),
            issue_date: cal.day(r.day),
            payment_date: cal.day(r.day + p.check.dueIn),
            amount: money(p.amount),
            customer_id: cust(r.customer),
            portfolio_id: account(p.account),
            receipt_payment_id: paymentId,
            created_by: actorId,
            created_at: confirmedAt,
          },
        });
        await tx.third_party_check_events.create({
          data: {
            check_id: checkId,
            to_status: 'IN_PORTFOLIO',
            date: cal.day(r.day),
            receipt_id: receiptId(r.key),
            user_id: actorId,
            created_at: confirmedAt,
          },
        });
      }
    }
  }

  await verify(ctx, {
    pending: {
      'andes-1': ZERO,
      'andes-2': andes2 - andes2Applied,
      'vaca-usd': ZERO,
      'petro-1': ZERO,
      'petro-2': ZERO,
      'nqn-1': total('nqn-1'),
      'nqn-2': total('nqn-2') - total('nqn-nc'),
      'vaca-ars': ZERO,
      'andes-nd': total('andes-nd'),
    },
    accounts: expected,
  });
  ctx.log(`cobranzas: ${invoices.length} comprobantes, ${sequence} recibos numerados y 1 borrador`);
}

/**
 * Pendiente de cada comprobante con la fórmula de `src/features/Treasury/lib/receivables.ts`,
 * ningún anticipo en negativo, cada medio confirmado con su movimiento y el impacto de los cobros
 * en cada cuenta (movimientos vigentes con fecha ≤ hoy).
 */
async function verify(
  ctx: Ctx,
  want: { pending: Record<string, bigint>; accounts: Record<AccountKey, bigint> }
): Promise<void> {
  const { tx, company, cal } = ctx;
  for (const [key, expected] of Object.entries(want.pending)) {
    const rows = await tx.$queryRaw<{ pending: string }[]>`
      SELECT (i.total
        - COALESCE((SELECT SUM(c.total) FROM invoices c WHERE c.associated_invoice_id = i.id AND c.status = 'autorizada' AND c.cbte_type IN (3, 8, 13)), 0)
        - COALESCE((SELECT SUM(l.applied_amount) FROM customer_receipt_lines l JOIN customer_receipts r ON r.id = l.receipt_id
                    WHERE l.invoice_id = i.id AND l.kind = 'INVOICE' AND r.status IN ('DRAFT', 'CONFIRMED')), 0))::text AS pending
      FROM invoices i WHERE i.id = ${demoId('invoice', key)}::uuid
    `;
    const got = BigInt(Math.round(Number(rows[0]?.pending ?? 'NaN') * 100));
    // El borrador reserva: "vaca-ars" queda en 0 libre.
    if (got !== expected)
      throw new Error(`demo cobranzas: el pendiente de ${key} da ${money(got)} y se esperaba ${money(expected)}`);
  }

  const negative = await tx.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM customer_receipt_lines a
    JOIN customer_receipts r ON r.id = a.receipt_id
    WHERE a.kind = 'ADVANCE' AND r.company_id = ${company.id}::uuid
      AND a.applied_amount < COALESCE((SELECT SUM(x.applied_amount) FROM customer_receipt_lines x JOIN customer_receipts xr ON xr.id = x.receipt_id
                                       WHERE x.source_line_id = a.id AND xr.status IN ('DRAFT', 'CONFIRMED')), 0)
  `;
  if (Number(negative[0]?.n ?? 0) > 0) throw new Error('demo cobranzas: hay anticipos con disponible negativo');

  const orphan = await tx.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM customer_receipt_payments p
    JOIN customer_receipts r ON r.id = p.receipt_id
    WHERE r.company_id = ${company.id}::uuid AND r.status <> 'DRAFT'
      AND NOT EXISTS (SELECT 1 FROM treasury_movements m WHERE m.customer_receipt_payment_id = p.id)
  `;
  if (Number(orphan[0]?.n ?? 0) > 0)
    throw new Error('demo cobranzas: hay medios de recibos confirmados sin movimiento');

  for (const key of Object.keys(want.accounts) as AccountKey[]) {
    const rows = await tx.$queryRaw<{ total: string }[]>`
      SELECT COALESCE(SUM(amount), 0)::text AS total FROM treasury_movements
      WHERE account_id = ${account(key)}::uuid AND kind = 'CUSTOMER_RECEIPT' AND cancelled_at IS NULL AND date <= ${cal.today}::date
    `;
    const got = BigInt(Math.round(Number(rows[0]?.total ?? '0') * 100));
    if (got !== want.accounts[key])
      throw new Error(
        `demo cobranzas: los cobros en ${key} dan ${money(got)} y se esperaba ${money(want.accounts[key])}`
      );
  }
}
