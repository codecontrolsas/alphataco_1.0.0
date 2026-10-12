/**
 * Demo de Compras, etapa 5: cuentas y cajas, regimenes de retencion, situacion impositiva de
 * proveedores y ordenes de pago (pagadas con certificados, parcial, anticipo aplicado y una
 * pendiente de aprobacion). Ademas queda una factura vencida sin pagar para Vencimientos.
 *
 * Como en el resto de la demo, no se importa `src/` con alias: las retenciones se calculan aca con la
 * misma regla del motor (spec Compras etapa 5 §3.2) en centavos, y `verify` controla que cada orden
 * cierre (neto = comprobantes + anticipo − creditos − retenciones).
 *
 * Los valores de los regimenes son DE REFERENCIA para la demo: revisarlos contra los vigentes.
 */
import { Prisma } from '../../../src/generated/prisma/client.ts';
import type { Ctx } from '../lib/ctx.ts';
import { demoId } from '../lib/ids.ts';

type Tax = 'GANANCIAS' | 'IVA' | 'IIBB' | 'SUSS';

const C = (value: number) => BigInt(Math.round(value * 100));
const money = (cents: bigint) => {
  const negative = cents < BigInt(0);
  const abs = negative ? -cents : cents;
  return `${negative ? '-' : ''}${abs / BigInt(100)}.${String(abs % BigInt(100)).padStart(2, '0')}`;
};
const divRound = (n: bigint, d: bigint) => (n + d / BigInt(2)) / d;
/** centavos × porcentaje (con 2 decimales) → centavos. */
const pct = (cents: bigint, rate: number) => divRound(cents * BigInt(Math.round(rate * 100)), BigInt(10000));

export async function seedSupplierPayments(ctx: Ctx): Promise<string> {
  const { tx, cal, company, actorId } = ctx;
  const supplierId = (key: string) => demoId('supplier', key);
  const invoiceId = (key: string) => demoId('supplier_invoice', key);

  // ── Cuentas y cajas (catalogo de Tesoreria) ──────────────────────────────────
  const accounts = [
    { key: 'galicia', kind: 'BANK' as const, name: 'Banco Galicia CC $', bank_name: 'Banco Galicia', account_number: '4012-7 123-4' },
    { key: 'nacion', kind: 'BANK' as const, name: 'Banco Nación CC $', bank_name: 'Banco de la Nación Argentina', account_number: '3410-02 554-1' },
    { key: 'caja', kind: 'CASH' as const, name: 'Caja administración', bank_name: null, account_number: null },
    // Tesorería etapa 3a: los cheques de terceros recibidos (recibos y carga inicial).
    { key: 'cartera', kind: 'CHECK_PORTFOLIO' as const, name: 'Cartera de cheques', bank_name: null, account_number: null },
  ];
  await tx.treasury_accounts.createMany({
    data: accounts.map((a) => ({ id: demoId('treasury_account', a.key), company_id: company.id, kind: a.kind, name: a.name, bank_name: a.bank_name, account_number: a.account_number })),
  });
  const account = (key: string) => demoId('treasury_account', key);

  // ── Regimenes (valores de referencia) ────────────────────────────────────────
  const regimes = [
    { key: 'gan-078', tax: 'GANANCIAS' as Tax, code: '078', description: 'Enajenación de bienes muebles', rate: 2, unreg: 28, exempt: 224000, min: 240 },
    { key: 'gan-094', tax: 'GANANCIAS' as Tax, code: '094', description: 'Locaciones de obra y servicios', rate: 2, unreg: 28, exempt: 67170, min: 240 },
    { key: 'iva-499', tax: 'IVA' as Tax, code: '499', description: 'Retención general de IVA', rate: 0, unreg: null, exempt: 0, min: 0, vat: 50 },
    { key: 'iibb-001', tax: 'IIBB' as Tax, code: '001', description: 'IIBB Neuquén · agente de retención', rate: 2.5, unreg: null, exempt: 0, min: 0 },
    { key: 'suss-755', tax: 'SUSS' as Tax, code: '755', description: 'Servicios de limpieza y seguridad', rate: 6, unreg: null, exempt: 0, min: 0 },
  ];
  await tx.withholding_regimes.createMany({
    data: regimes.map((r) => ({
      id: demoId('withholding_regime', r.key),
      company_id: company.id,
      tax: r.tax,
      code: r.code,
      description: r.description,
      rate_registered: r.rate,
      rate_unregistered: r.unreg,
      monthly_exempt_amount: r.exempt,
      minimum_withholding: r.min,
      vat_percentage: 'vat' in r ? r.vat : null,
    })),
  });
  const regime = (key: string) => demoId('withholding_regime', key);

  // ── Situacion impositiva: uno no inscripto en Ganancias y uno con exclusion ──
  await tx.supplier_withholding_profiles.createMany({
    data: [
      { supplier_id: supplierId('repuestos-sur'), tax: 'GANANCIAS', status: 'SUBJECT', regime_id: regime('gan-078') },
      { supplier_id: supplierId('repuestos-sur'), tax: 'IVA', status: 'SUBJECT', regime_id: regime('iva-499') },
      { supplier_id: supplierId('repuestos-sur'), tax: 'IIBB', status: 'SUBJECT', regime_id: regime('iibb-001'), rate: 1.5 },
      { supplier_id: supplierId('lubricantes-comahue'), tax: 'GANANCIAS', status: 'NOT_REGISTERED', regime_id: regime('gan-078') },
      { supplier_id: supplierId('lubricantes-comahue'), tax: 'IIBB', status: 'SUBJECT', regime_id: regime('iibb-001') },
      {
        supplier_id: supplierId('hidraulica-vaca-muerta'),
        tax: 'GANANCIAS',
        status: 'SUBJECT',
        regime_id: regime('gan-094'),
        exclusion_percentage: 50,
        exclusion_from: new Date(`${cal.ymd(-60)}T00:00:00.000Z`),
        exclusion_to: new Date(`${cal.ymd(120)}T00:00:00.000Z`),
        exclusion_certificate: 'Certificado de exclusión 2026-0042',
      },
      { supplier_id: supplierId('hidraulica-vaca-muerta'), tax: 'IVA', status: 'SUBJECT', regime_id: regime('iva-499') },
      { supplier_id: supplierId('hidraulica-vaca-muerta'), tax: 'IIBB', status: 'SUBJECT', regime_id: regime('iibb-001'), rate: 1.75 },
    ],
  });

  // ── Ordenes de pago ──────────────────────────────────────────────────────────
  const invoiceAmounts = async (key: string) => {
    const i = await tx.supplier_invoices.findUniqueOrThrow({
      where: { id: invoiceId(key) },
      select: { total: true, net_taxed: true, net_untaxed: true, exempt: true, vat_total: true },
    });
    return { total: C(Number(i.total)), net: C(Number(i.net_taxed) + Number(i.net_untaxed) + Number(i.exempt)), vat: C(Number(i.vat_total)) };
  };
  const share = (amount: bigint, inv: { total: bigint; net: bigint; vat: bigint }) => ({
    net: divRound(amount * inv.net, inv.total),
    vat: divRound(amount * inv.vat, inv.total),
  });

  const certificateCounters: Record<Tax, number> = { GANANCIAS: 0, IVA: 0, IIBB: 0, SUSS: 0 };
  const PREFIX: Record<Tax, string> = { GANANCIAS: 'GAN', IVA: 'IVA', IIBB: 'IIBB', SUSS: 'SUSS' };
  let opCounter = 0;

  type Withholding = { tax: Tax; regimeKey: string; base: bigint; rate: number; amount: bigint; detail: string; status?: 'SUBJECT' | 'NOT_REGISTERED'; exclusion?: number };
  type OrderLine =
    | { kind: 'INVOICE' | 'CREDIT_NOTE'; invoiceKey: string; amount: bigint }
    | { kind: 'ADVANCE'; amount: bigint; description: string }
    | { kind: 'ADVANCE_APPLIED'; sourceKey: string; amount: bigint };

  const createOrder = async (o: {
    key: string;
    supplier: string;
    day: number;
    status: 'PAID' | 'PENDING_APPROVAL';
    lines: OrderLine[];
    bases: { net: bigint; vat: bigint };
    withholdings: Withholding[];
    payments?: { method: 'TRANSFER' | 'CHECK' | 'ECHECK' | 'CASH'; account: string; amount: bigint; reference?: string; checkNumber?: string; checkDueIn?: number }[];
    notes?: string;
  }) => {
    const invoices = o.lines.filter((l) => l.kind === 'INVOICE').reduce((acc, l) => acc + l.amount, BigInt(0));
    const credits = o.lines.filter((l) => l.kind === 'CREDIT_NOTE' || l.kind === 'ADVANCE_APPLIED').reduce((acc, l) => acc + l.amount, BigInt(0));
    const advance = o.lines.filter((l) => l.kind === 'ADVANCE').reduce((acc, l) => acc + l.amount, BigInt(0));
    const withheld = o.withholdings.reduce((acc, w) => acc + w.amount, BigInt(0));
    const net = invoices + advance - credits - withheld;
    const paid = o.status === 'PAID';
    const date = new Date(`${cal.ymd(o.day)}T00:00:00.000Z`);
    await tx.payment_orders.create({
      data: {
        id: demoId('payment_order', o.key),
        company_id: company.id,
        number: `OP-${String(++opCounter).padStart(6, '0')}`,
        supplier_id: supplierId(o.supplier),
        status: o.status,
        planned_on: date,
        paid_on: paid ? date : null,
        notes: o.notes ?? null,
        invoices_total: money(invoices),
        credits_total: money(credits),
        advance_total: money(advance),
        withholdings_total: money(withheld),
        net_total: money(net),
        withholding_net_base: money(o.bases.net),
        withholding_vat_base: money(o.bases.vat),
        submitted_at: cal.at(o.day - 1, 10),
        approved_by: paid ? actorId : null,
        approved_at: paid ? cal.at(o.day - 1, 15) : null,
        paid_by: paid ? actorId : null,
        created_by: actorId,
        created_at: cal.at(o.day - 1, 9),
        updated_at: cal.at(o.day, 11),
        lines: {
          create: o.lines.map((l, i) => ({
            id: demoId('payment_line', `${o.key}-${i}`),
            position: i + 1,
            kind: l.kind,
            amount: money(l.amount),
            invoice_id: l.kind === 'INVOICE' || l.kind === 'CREDIT_NOTE' ? invoiceId(l.invoiceKey) : null,
            description: l.kind === 'ADVANCE' ? l.description : null,
            source_line_id: l.kind === 'ADVANCE_APPLIED' ? demoId('payment_line', l.sourceKey) : null,
          })),
        },
        withholdings: {
          create: o.withholdings.map((w) => ({
            tax: w.tax,
            regime_id: regime(w.regimeKey),
            base: money(w.base),
            rate: new Prisma.Decimal(w.rate),
            amount: money(w.amount),
            detail: w.detail,
            supplier_status: w.status ?? 'SUBJECT',
            exclusion_percentage: w.exclusion ?? null,
            certificate_number: paid ? `${PREFIX[w.tax]}-${String(++certificateCounters[w.tax]).padStart(6, '0')}` : null,
          })),
        },
        payments: paid
          ? {
              create: (o.payments ?? []).map((p, i) => ({
                id: demoId('payment_order_payment', `${o.key}-${i}`),
                method: p.method,
                treasury_account_id: account(p.account),
                amount: money(p.amount),
                reference: p.reference ?? null,
                check_number: p.checkNumber ?? null,
                check_due_on: p.checkDueIn !== undefined ? new Date(`${cal.ymd(o.day + p.checkDueIn)}T00:00:00.000Z`) : null,
              })),
            }
          : undefined,
      },
    });
    // Tesoreria: la transferencia y el efectivo son un movimiento SUPPLIER_PAYMENT, con la misma
    // regla que registerPayment. Un cheque o e-cheq propio queda EMITIDO, sin movimiento, hasta que
    // se confirma su debito (etapa 3b). No hay trigger.
    if (paid && o.payments?.length) {
      const supplier = await tx.suppliers.findUniqueOrThrow({ where: { id: supplierId(o.supplier) }, select: { name: true } });
      const number = `OP-${String(opCounter).padStart(6, '0')}`;
      const isCheck = (p: { method: string }) => p.method === 'CHECK' || p.method === 'ECHECK';
      await tx.treasury_movements.createMany({
        data: o.payments.flatMap((p, i) =>
          isCheck(p)
            ? []
            : [
                {
                  id: demoId('treasury_movement', `${o.key}-${i}`),
                  company_id: company.id,
                  account_id: account(p.account),
                  date: new Date(`${cal.ymd(o.day)}T00:00:00.000Z`),
                  amount: money(-p.amount),
                  kind: 'SUPPLIER_PAYMENT' as const,
                  description: `${number} — ${supplier.name}`,
                  payment_order_payment_id: demoId('payment_order_payment', `${o.key}-${i}`),
                  created_by: actorId,
                  created_at: cal.at(o.day, 11),
                },
              ]
        ),
      });
      for (const [i, p] of o.payments.entries()) {
        if (!isCheck(p)) continue;
        const checkId = demoId('own_check', `${o.key}-${i}`);
        await tx.own_checks.create({
          data: {
            id: checkId,
            company_id: company.id,
            kind: p.method === 'CHECK' ? 'PHYSICAL' : 'ECHECK',
            account_id: account(p.account),
            number: p.checkNumber ?? '',
            amount: money(p.amount),
            issue_date: date,
            payment_date: new Date(`${cal.ymd(o.day + (p.checkDueIn ?? 0))}T00:00:00.000Z`),
            supplier_id: supplierId(o.supplier),
            payment_order_payment_id: demoId('payment_order_payment', `${o.key}-${i}`),
            created_by: actorId,
            created_at: cal.at(o.day, 11),
          },
        });
        await tx.own_check_events.create({
          data: { check_id: checkId, from_status: null, to_status: 'ISSUED', date, payment_order_id: demoId('payment_order', o.key), user_id: actorId, created_at: cal.at(o.day, 11) },
        });
      }
    }
    return net;
  };

  // 1) Lubricantes (no inscripto en Ganancias): factura completa con la NC aplicada.
  const lub = await invoiceAmounts('fc-lubricantes');
  const lubNc = await invoiceAmounts('nc-lubricantes');
  const lubBase = { net: lub.net - lubNc.net, vat: lub.vat - lubNc.vat };
  const lubGan = pct(lubBase.net, 28);
  const lubIibb = pct(lubBase.net, 2.5);
  const lubNet = lub.total - lubNc.total - lubGan - lubIibb;
  await createOrder({
    key: 'op-lubricantes',
    supplier: 'lubricantes-comahue',
    day: -7,
    status: 'PAID',
    lines: [
      { kind: 'INVOICE', invoiceKey: 'fc-lubricantes', amount: lub.total },
      { kind: 'CREDIT_NOTE', invoiceKey: 'nc-lubricantes', amount: lubNc.total },
    ],
    bases: lubBase,
    withholdings: [
      { tax: 'GANANCIAS', regimeKey: 'gan-078', base: lubBase.net, rate: 28, amount: lubGan, detail: `No inscripto: $ ${money(lubBase.net)} × 28 %`, status: 'NOT_REGISTERED' },
      { tax: 'IIBB', regimeKey: 'iibb-001', base: lubBase.net, rate: 2.5, amount: lubIibb, detail: `$ ${money(lubBase.net)} × 2,5 %` },
    ],
    payments: [{ method: 'TRANSFER', account: 'galicia', amount: lubNet, reference: 'TRF 004512' }],
  });

  // 2) Hidraulica (exclusion 50 % en Ganancias): pago parcial de la factura de la grua.
  const grua = await invoiceAmounts('fc-grua');
  const gruaPaid = C(500000);
  const gruaBase = share(gruaPaid, grua);
  const gruaTaxable = gruaBase.net - C(67170);
  const gruaGan = pct(gruaTaxable, 2) - pct(pct(gruaTaxable, 2), 50);
  const gruaIva = pct(gruaBase.vat, 50);
  const gruaIibb = pct(gruaBase.net, 1.75);
  const gruaNet = gruaPaid - gruaGan - gruaIva - gruaIibb;
  const echeq = C(300000);
  await createOrder({
    key: 'op-grua-parcial',
    supplier: 'hidraulica-vaca-muerta',
    day: -1,
    status: 'PAID',
    lines: [{ kind: 'INVOICE', invoiceKey: 'fc-grua', amount: gruaPaid }],
    bases: gruaBase,
    withholdings: [
      {
        tax: 'GANANCIAS',
        regimeKey: 'gan-094',
        base: gruaBase.net,
        rate: 2,
        amount: gruaGan,
        detail: `Acumulado del mes $ ${money(gruaBase.net)} − mínimo no sujeto $ 67170.00 × 2 % − exclusión 50 %`,
        exclusion: 50,
      },
      { tax: 'IVA', regimeKey: 'iva-499', base: gruaBase.vat, rate: 50, amount: gruaIva, detail: `50 % del IVA pagado ($ ${money(gruaBase.vat)})` },
      { tax: 'IIBB', regimeKey: 'iibb-001', base: gruaBase.net, rate: 1.75, amount: gruaIibb, detail: `$ ${money(gruaBase.net)} × 1,75 % (padrón)` },
    ],
    payments: [
      { method: 'ECHECK', account: 'nacion', amount: echeq, checkNumber: '00078812', checkDueIn: 30 },
      { method: 'TRANSFER', account: 'nacion', amount: gruaNet - echeq, reference: 'TRF 004533' },
    ],
    notes: 'Pago parcial: el saldo de la factura se paga a fin de mes',
  });

  // 3) Anticipo al estudio contable, pagado; 4) orden pendiente que lo aplica a los honorarios.
  await createOrder({
    key: 'op-anticipo-estudio',
    supplier: 'estudio-ramirez',
    day: -4,
    status: 'PAID',
    lines: [{ kind: 'ADVANCE', amount: C(100000), description: 'Anticipo honorarios del trimestre' }],
    bases: { net: C(100000), vat: BigInt(0) },
    withholdings: [],
    payments: [{ method: 'TRANSFER', account: 'galicia', amount: C(100000), reference: 'TRF 004520' }],
  });
  const honorarios = await invoiceAmounts('fc-honorarios');
  await createOrder({
    key: 'op-honorarios',
    supplier: 'estudio-ramirez',
    day: 0,
    status: 'PENDING_APPROVAL',
    lines: [
      { kind: 'INVOICE', invoiceKey: 'fc-honorarios', amount: honorarios.total },
      { kind: 'ADVANCE_APPLIED', sourceKey: 'op-anticipo-estudio-0', amount: C(100000) },
    ],
    bases: { net: honorarios.net - divRound(C(100000) * honorarios.net, honorarios.total), vat: honorarios.vat },
    withholdings: [],
  });

  await verify(ctx);
  return `${opCounter} órdenes de pago`;
}

/** Cada orden cierra y lo aplicado no supera el total de cada comprobante. */
async function verify(ctx: Ctx): Promise<void> {
  const { tx, company } = ctx;
  const badNet = await tx.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM payment_orders
    WHERE company_id = ${company.id}::uuid
      AND net_total <> invoices_total + advance_total - credits_total - withholdings_total
  `;
  if (Number(badNet[0]?.n ?? 0) > 0) throw new Error('demo compras: hay órdenes de pago que no cierran');
  const overPaid = await tx.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM (
      SELECT si.id FROM supplier_invoices si JOIN payment_order_lines l ON l.invoice_id = si.id
      JOIN payment_orders po ON po.id = l.payment_order_id
      WHERE si.company_id = ${company.id}::uuid AND po.status <> 'CANCELLED'
      GROUP BY si.id, si.total HAVING SUM(l.amount) > si.total
    ) x
  `;
  if (Number(overPaid[0]?.n ?? 0) > 0) throw new Error('demo compras: hay comprobantes pagados de más');
  const unbalanced = await tx.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM payment_orders po
    WHERE po.company_id = ${company.id}::uuid AND po.status = 'PAID'
      AND po.net_total <> (SELECT COALESCE(SUM(p.amount), 0) FROM payment_order_payments p WHERE p.payment_order_id = po.id)
  `;
  if (Number(unbalanced[0]?.n ?? 0) > 0) throw new Error('demo compras: hay pagos cuyos medios no suman el neto');
}
