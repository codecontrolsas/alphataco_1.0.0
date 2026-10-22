/**
 * Demo de Compras, etapa 4: facturas de proveedor y Libro IVA Compras.
 *
 * La demo no puede importar `src/` con alias (la imagen no lo copia), asi que replica las reglas
 * del control con aritmetica en centavos: neto = cantidad × precio, IVA = neto × alicuota, total =
 * netos + IVA + tributos. Los estados y observaciones son los que daria el control real sobre esas
 * cifras (spec Compras etapa 4 §3.3); `verify` lo comprueba al final.
 */
import { Prisma } from '../../../src/generated/prisma/client.ts';
import type { Ctx } from '../lib/ctx.ts';
import { demoId } from '../lib/ids.ts';
import { centsText } from '../lib/money.ts';
import { NEUQUEN_PROVINCE } from './catalogs.ts';

const RATES: Record<number, number> = { 4: 10.5, 5: 21, 6: 27 };
const LETTERS: Record<number, 'A' | 'B' | 'C'> = { 1: 'A', 2: 'A', 3: 'A', 11: 'C' };
const LABELS: Record<number, string> = { 1: 'Factura A', 3: 'Nota de Crédito A', 11: 'Factura C' };

const unitCost = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

type DemoLine =
  | { orderKey: string; quantity: number; price: number; rate: number | null }
  | { category: string; description: string; net: number; rate: number | null };

type DemoTax = {
  kind: 'VAT_PERCEPTION' | 'GROSS_INCOME_PERCEPTION' | 'INTERNAL_TAX' | 'OTHER_TAX';
  amount: number;
  description?: string;
};

interface DemoInvoice {
  key: string;
  supplier: string;
  cbteType: number;
  salesPoint: number;
  number: number;
  day: number;
  lines: DemoLine[];
  taxes?: (net: number) => DemoTax[];
  related?: string;
  status: 'CONFORMING' | 'OBSERVED' | 'APPROVED';
  /** Observacion de precio de la primera linea (la que daria el control). */
  priceObservation?: boolean;
  resolution?: string;
  cae?: boolean;
  checked?: boolean;
  notes?: string;
  /** Dias desde la emision hasta el vencimiento del pago (30 si no se indica). */
  dueIn?: number;
}

export const EXPENSE_CATEGORIES = ['Luz', 'Honorarios', 'Fletes'] as const;

export async function seedSupplierInvoices(ctx: Ctx): Promise<string> {
  const { tx, cal, company, actorId } = ctx;

  await tx.purchase_expense_categories.createMany({
    data: EXPENSE_CATEGORIES.map((name) => ({ id: demoId('expense_category', name), company_id: company.id, name })),
  });

  const orderLine = async (orderKey: string) => {
    const order = await tx.purchase_orders.findUniqueOrThrow({
      where: { id: demoId('purchase_order', orderKey) },
      select: {
        number: true,
        lines: {
          select: {
            id: true,
            unit_price: true,
            request_line: { select: { description: true, material: { select: { code: true, name: true } } } },
          },
          orderBy: { position: 'asc' },
        },
      },
    });
    const line = order.lines[0]!;
    const material = line.request_line.material;
    const label = material
      ? material.code
        ? `[${material.code}] ${material.name}`
        : material.name
      : line.request_line.description ?? '';
    return { id: line.id, orderNumber: order.number, orderPrice: line.unit_price.toNumber(), label };
  };

  const plans: DemoInvoice[] = [
    {
      key: 'fc-lubricantes',
      supplier: 'lubricantes-comahue',
      cbteType: 1,
      salesPoint: 3,
      number: 4520,
      day: -11,
      lines: [{ orderKey: 'oc-lubricantes', quantity: 120, price: 3850, rate: 5 }],
      taxes: (net) => [
        { kind: 'VAT_PERCEPTION', amount: Math.round(net * 0.03) },
        { kind: 'GROSS_INCOME_PERCEPTION', amount: Math.round(net * 0.015) },
      ],
      status: 'CONFORMING',
      cae: true,
      checked: true,
    },
    {
      key: 'nc-lubricantes',
      supplier: 'lubricantes-comahue',
      cbteType: 3,
      salesPoint: 3,
      number: 312,
      day: -9,
      lines: [{ orderKey: 'oc-lubricantes', quantity: 10, price: 3850, rate: 5 }],
      related: 'fc-lubricantes',
      status: 'CONFORMING',
      cae: true,
      notes: '10 l con el precinto roto: se devolvieron',
    },
    {
      key: 'fc-grasa',
      supplier: 'lubricantes-comahue',
      cbteType: 1,
      salesPoint: 1,
      number: 2210,
      day: -4,
      lines: [{ orderKey: 'oc-grasa', quantity: 20, price: 5400, rate: 5 }],
      status: 'OBSERVED',
      priceObservation: true,
      cae: true,
    },
    {
      key: 'fc-filtros',
      supplier: 'filtros-norte',
      cbteType: 11,
      salesPoint: 2,
      number: 456,
      day: -3,
      // Monotributista: factura C con el precio final (8.900 + 21 %).
      lines: [{ orderKey: 'oc-filtros', quantity: 10, price: 10769, rate: null }],
      status: 'CONFORMING',
      cae: true,
      // Vencida: aparece en Vencimientos.
      dueIn: 2,
    },
    {
      key: 'fc-grua',
      supplier: 'hidraulica-vaca-muerta',
      cbteType: 1,
      salesPoint: 4,
      number: 1180,
      day: -2,
      lines: [{ orderKey: 'oc-grua', quantity: 8, price: 97000, rate: 5 }],
      taxes: (net) => [{ kind: 'GROSS_INCOME_PERCEPTION', amount: Math.round(net * 0.015) }],
      status: 'APPROVED',
      priceObservation: true,
      resolution: 'Recargo por hora nocturna, acordado con el jefe de servicio',
      cae: true,
    },
    {
      key: 'fc-luz',
      supplier: 'energia-patagonica',
      cbteType: 1,
      salesPoint: 10,
      number: 123456,
      day: -6,
      lines: [
        { category: 'Luz', description: 'Energía eléctrica Base Neuquén, período anterior', net: 185000, rate: 6 },
      ],
      taxes: (net) => [{ kind: 'GROSS_INCOME_PERCEPTION', amount: Math.round(net * 0.02) }],
      status: 'CONFORMING',
      cae: true,
    },
    {
      key: 'fc-honorarios',
      supplier: 'estudio-ramirez',
      cbteType: 11,
      salesPoint: 1,
      number: 89,
      day: -5,
      lines: [{ category: 'Honorarios', description: 'Asesoramiento impositivo del mes', net: 250000, rate: null }],
      status: 'CONFORMING',
    },
  ];

  const ids = new Map<string, string>();
  for (const plan of plans) {
    const id = demoId('supplier_invoice', plan.key);
    ids.set(plan.key, id);
    const letter = LETTERS[plan.cbteType]!;
    const observations: { code: string; message: string; lineId?: string }[] = [];

    const lines: Prisma.supplier_invoice_linesCreateWithoutInvoiceInput[] = [];
    const bases = new Map<number, number>();
    let netTotal = 0;
    for (const [i, l] of plan.lines.entries()) {
      const net = 'orderKey' in l ? Math.round(l.quantity * l.price * 100) : Math.round(l.net * 100);
      const vat = letter === 'C' || l.rate === null ? 0 : Math.round((net * RATES[l.rate]!) / 100);
      netTotal += net;
      if (letter !== 'C' && l.rate !== null) bases.set(l.rate, (bases.get(l.rate) ?? 0) + net);
      if ('orderKey' in l) {
        const ref = await orderLine(l.orderKey);
        if (plan.priceObservation && i === 0) {
          observations.push({
            code: 'PRICE',
            lineId: String(i),
            message: `${ref.label}: precio ${unitCost.format(l.price)}, en la ${ref.orderNumber} ${unitCost.format(ref.orderPrice)}`,
          });
        }
        lines.push({
          position: i + 1,
          order_line: { connect: { id: ref.id } },
          quantity: l.quantity,
          unit_price: l.price,
          vat_rate_id: letter === 'C' ? null : l.rate,
          net_total: centsText(net),
          vat_amount: centsText(vat),
        });
      } else {
        lines.push({
          position: i + 1,
          expense_category: { connect: { id: demoId('expense_category', l.category) } },
          description: l.description,
          vat_rate_id: letter === 'C' ? null : l.rate,
          net_total: centsText(net),
          vat_amount: centsText(vat),
        });
      }
    }
    const vat = [...bases.entries()].map(([rate, base]) => ({
      vat_rate_id: rate,
      base: centsText(base),
      amount: centsText(Math.round((base * RATES[rate]!) / 100)),
    }));
    const vatTotal = vat.reduce((acc, v) => acc + Math.round(Number(v.amount) * 100), 0);
    const taxes = (plan.taxes?.(netTotal) ?? []).filter((t) => t.amount > 0);
    const sumKind = (...kinds: DemoTax['kind'][]) =>
      taxes.filter((t) => kinds.includes(t.kind)).reduce((acc, t) => acc + t.amount, 0);
    const total =
      netTotal + vatTotal + sumKind('VAT_PERCEPTION', 'GROSS_INCOME_PERCEPTION', 'INTERNAL_TAX', 'OTHER_TAX');
    const issue = cal.ymd(plan.day);

    await tx.supplier_invoices.create({
      data: {
        id,
        company_id: company.id,
        supplier_id: demoId('supplier', plan.supplier),
        cbte_type: plan.cbteType,
        sales_point: plan.salesPoint,
        number: plan.number,
        issue_date: new Date(`${issue}T00:00:00.000Z`),
        due_date: new Date(`${cal.ymd(plan.day + (plan.dueIn ?? 30))}T00:00:00.000Z`),
        vat_period: issue.slice(0, 7),
        cae: plan.cae ? `7${String(plan.salesPoint).padStart(4, '0')}${String(plan.number).padStart(9, '0')}` : null,
        cae_due_date: plan.cae ? new Date(`${cal.ymd(plan.day + 10)}T00:00:00.000Z`) : null,
        net_taxed: centsText(netTotal),
        net_untaxed: '0.00',
        exempt: '0.00',
        vat_total: centsText(vatTotal),
        vat_perceptions: centsText(sumKind('VAT_PERCEPTION')),
        gross_income_perceptions: centsText(sumKind('GROSS_INCOME_PERCEPTION')),
        other_taxes: centsText(sumKind('INTERNAL_TAX', 'OTHER_TAX')),
        total: centsText(total),
        related_invoice_id: plan.related ? ids.get(plan.related)! : null,
        status: plan.status,
        observations: observations as Prisma.InputJsonValue,
        resolved_by: plan.resolution ? actorId : null,
        resolved_at: plan.resolution ? cal.at(plan.day + 1, 10) : null,
        resolution_comment: plan.resolution ?? null,
        arca_check_result: plan.checked ? 'APPROVED' : null,
        arca_checked_at: plan.checked ? cal.at(plan.day + 1, 9) : null,
        notes: plan.notes ?? null,
        created_by: actorId,
        created_at: cal.at(plan.day + 1, 8),
        updated_at: cal.at(plan.day + 1, 8),
        lines: { create: lines },
        vat: { create: vat },
        taxes: {
          create: taxes.map((t) => ({
            kind: t.kind,
            amount: centsText(t.amount),
            description: t.description ?? null,
            province_id: t.kind === 'GROSS_INCOME_PERCEPTION' ? BigInt(NEUQUEN_PROVINCE) : null,
          })),
        },
      },
    });
  }

  await verify(ctx);
  return `${plans.length} comprobantes de proveedor`;
}

/** Facturado ≤ recibido en los conformes y total = suma de sus componentes. */
async function verify(ctx: Ctx): Promise<void> {
  const { tx, company } = ctx;
  const overInvoiced = await tx.$queryRaw<{ n: bigint }[]>`
    WITH invoiced AS (
      SELECT il.order_line_id,
             SUM(CASE WHEN si.cbte_type IN (3, 8, 13) THEN -il.quantity ELSE il.quantity END) AS qty
      FROM supplier_invoice_lines il JOIN supplier_invoices si ON si.id = il.invoice_id
      WHERE si.company_id = ${company.id}::uuid AND il.order_line_id IS NOT NULL
        AND si.status IN ('CONFORMING', 'OBSERVED', 'APPROVED')
      GROUP BY 1
    ), received AS (
      SELECT rl.order_line_id, SUM(rl.quantity) AS qty
      FROM purchase_receipt_lines rl JOIN purchase_receipts r ON r.id = rl.receipt_id
      WHERE r.cancelled_at IS NULL GROUP BY 1
    )
    SELECT count(*) AS n FROM invoiced i LEFT JOIN received r ON r.order_line_id = i.order_line_id
    WHERE i.qty > COALESCE(r.qty, 0)
  `;
  if (Number(overInvoiced[0]?.n ?? 0) > 0) throw new Error('demo compras: hay lineas de OC facturadas de mas');
  const badTotals = await tx.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM supplier_invoices
    WHERE company_id = ${company.id}::uuid
      AND total <> net_taxed + net_untaxed + exempt + vat_total + vat_perceptions + gross_income_perceptions + other_taxes
  `;
  if (Number(badTotals[0]?.n ?? 0) > 0) throw new Error('demo compras: hay comprobantes con el total mal sumado');
}
