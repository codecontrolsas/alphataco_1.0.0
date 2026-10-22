/**
 * Compras, etapa 2: una solicitud cotizada a 3 proveedores (respondio, sin respuesta, no cotiza),
 * una OC enviada desde la cotizacion mas barata (la solicitud queda pedida en parte), una OC
 * directa pendiente de aprobacion y una OC rechazada que volvio a borrador.
 */
import { Prisma } from '../../../src/generated/prisma/client.ts';
import type { Ctx } from '../lib/ctx.ts';
import { demoId } from '../lib/ids.ts';
import { centsText } from '../lib/money.ts';

/** Neto e IVA de una linea en centavos (precios de la demo con 2 decimales como mucho). */
function demoAmounts(quantity: number, unitPrice: number, vatPercent: number) {
  const net = Math.round(quantity * unitPrice * 100);
  const vat = Math.round((net * vatPercent) / 100);
  return { net, vat };
}

/** Ids de VAT_RATES de ARCA: 5 = 21 %, 4 = 10,5 %. */
const VAT_21 = { id: 5, percent: 21 };

export async function seedQuotesAndOrders(
  ctx: Ctx,
  requestLines: Prisma.purchase_request_linesCreateManyInput[]
): Promise<string> {
  const { tx, cal, company, actorId } = ctx;
  const supplierId = (key: string) => demoId('supplier', key);
  const lineOf = (requestKey: string, position: number) => {
    const requestId = demoId('purchase_request', requestKey);
    const line = requestLines.find((l) => l.request_id === requestId && l.position === position);
    if (!line) throw new Error(`Falta la linea ${position} de ${requestKey}`);
    return { requestId, quantity: Number(line.quantity), position };
  };
  // Los ids de linea los genera la base: se leen despues de crear las solicitudes.
  const stored = await tx.purchase_request_lines.findMany({
    where: { request: { company_id: company.id } },
    select: { id: true, request_id: true, position: true },
  });
  const lineId = (requestKey: string, position: number) => {
    const { requestId } = lineOf(requestKey, position);
    const found = stored.find((l) => l.request_id === requestId && l.position === position);
    if (!found) throw new Error(`Falta la linea ${position} de ${requestKey}`);
    return found.id;
  };

  // 1) Lubricantes cotizados a tres proveedores.
  const lubA = lineOf('aprobada-lubricantes', 1);
  const lubB = lineOf('aprobada-lubricantes', 2);
  type QuotePlan = {
    key: string;
    supplier: string;
    status: 'SENT' | 'RECEIVED' | 'DECLINED';
    prices: [number, number] | null;
    validDays?: number;
    deliveryDays?: number;
  };
  const quotePlans: QuotePlan[] = [
    {
      key: 'lub-comahue',
      supplier: 'lubricantes-comahue',
      status: 'RECEIVED',
      prices: [3850, 9200],
      validDays: 15,
      deliveryDays: 3,
    },
    { key: 'lub-filtros', supplier: 'filtros-norte', status: 'SENT', prices: null },
    { key: 'lub-repuestos', supplier: 'repuestos-sur', status: 'DECLINED', prices: null },
  ];
  let pc = 0;
  for (const q of quotePlans) {
    const id = demoId('purchase_quote', q.key);
    const email = await tx.supplier_contacts.findFirst({
      where: { supplier_id: supplierId(q.supplier), is_primary: true },
      select: { email: true },
    });
    await tx.purchase_quotes.create({
      data: {
        id,
        company_id: company.id,
        number: `PC-${String(++pc).padStart(6, '0')}`,
        supplier_id: supplierId(q.supplier),
        status: q.status,
        created_by: actorId,
        sent_at: cal.at(-18, 10),
        sent_to: email?.email ? [email.email] : [],
        received_at: q.status === 'SENT' ? null : new Date(`${cal.ymd(-16)}T00:00:00.000Z`),
        valid_until: q.validDays ? new Date(`${cal.ymd(-16 + q.validDays)}T00:00:00.000Z`) : null,
        delivery_days: q.deliveryDays ?? null,
        supplier_notes: q.status === 'RECEIVED' ? 'Precio por litro, puesto en base Neuquén' : null,
        created_at: cal.at(-18, 9),
        updated_at: cal.at(-16, 11),
        lines: {
          create: [lubA, lubB].map((l, i) => ({
            request_line_id: lineId('aprobada-lubricantes', l.position),
            quantity: l.quantity,
            unit_price: q.prices ? q.prices[i] : null,
            vat_rate_id: q.prices ? VAT_21.id : null,
          })),
        },
      },
    });
  }

  // 2) OC enviada desde la cotizacion mas barata, solo por la linea 1 (la solicitud queda en parte).
  const comahueLines = await tx.purchase_quote_lines.findMany({
    where: { quote_id: demoId('purchase_quote', 'lub-comahue') },
    select: { id: true, request_line_id: true },
  });
  type OrderPlan = {
    key: string;
    supplier: string;
    status: 'SENT' | 'PENDING_APPROVAL' | 'DRAFT';
    day: number;
    quoteKey?: string;
    deliveryPlace: string;
    lines: { requestKey: string; position: number; quantity: number; price: number }[];
    rejection?: string;
  };
  const orderPlans: OrderPlan[] = [
    {
      key: 'oc-lubricantes',
      supplier: 'lubricantes-comahue',
      status: 'SENT',
      day: -15,
      quoteKey: 'lub-comahue',
      deliveryPlace: 'Base Neuquén',
      lines: [{ requestKey: 'aprobada-lubricantes', position: 1, quantity: lubA.quantity, price: 3850 }],
    },
    {
      key: 'oc-rectificado',
      supplier: 'taller-andes',
      status: 'PENDING_APPROVAL',
      day: -2,
      deliveryPlace: 'Taller Los Andes',
      lines: [{ requestKey: 'aprobada-servicio', position: 1, quantity: 1, price: 480000 }],
    },
    {
      key: 'oc-cubiertas',
      supplier: 'neumaticos-patagonia',
      status: 'DRAFT',
      day: -4,
      deliveryPlace: 'Base Añelo',
      lines: [{ requestKey: 'aprobada-cubiertas', position: 1, quantity: 4, price: 615000 }],
      rejection: 'El precio está por encima del último que pagamos: pedí que lo revisen',
    },
    // Etapa 3: OC enviadas que despues se reciben (seedReceipts).
    {
      key: 'oc-grasa',
      supplier: 'lubricantes-comahue',
      status: 'SENT',
      day: -8,
      deliveryPlace: 'Base Neuquén',
      lines: [{ requestKey: 'aprobada-grasa', position: 1, quantity: 30, price: 5200 }],
    },
    {
      key: 'oc-filtros',
      supplier: 'filtros-norte',
      status: 'SENT',
      day: -7,
      deliveryPlace: 'Base Neuquén',
      lines: [{ requestKey: 'aprobada-filtros', position: 1, quantity: 10, price: 8900 }],
    },
    {
      key: 'oc-grua',
      supplier: 'hidraulica-vaca-muerta',
      status: 'SENT',
      day: -6,
      deliveryPlace: 'Locación LLL-125',
      lines: [{ requestKey: 'aprobada-grua', position: 1, quantity: 8, price: 95000 }],
    },
  ];
  let oc = 0;
  for (const o of orderPlans) {
    const id = demoId('purchase_order', o.key);
    const amounts = o.lines.map((l) => demoAmounts(l.quantity, l.price, VAT_21.percent));
    const subtotal = amounts.reduce((acc, a) => acc + a.net, 0);
    const vatTotal = amounts.reduce((acc, a) => acc + a.vat, 0);
    const approved = o.status === 'SENT';
    const email = await tx.supplier_contacts.findFirst({
      where: { supplier_id: supplierId(o.supplier), is_primary: true },
      select: { email: true },
    });
    const paymentTerm = await tx.suppliers.findUniqueOrThrow({
      where: { id: supplierId(o.supplier) },
      select: { payment_term_days: true },
    });
    await tx.purchase_orders.create({
      data: {
        id,
        company_id: company.id,
        number: `OC-${String(++oc).padStart(6, '0')}`,
        supplier_id: supplierId(o.supplier),
        quote_id: o.quoteKey ? demoId('purchase_quote', o.quoteKey) : null,
        status: o.status,
        created_by: actorId,
        delivery_date: new Date(`${cal.ymd(o.day + 7)}T00:00:00.000Z`),
        delivery_place: o.deliveryPlace,
        payment_term_days: paymentTerm.payment_term_days,
        subtotal: centsText(subtotal),
        vat_total: centsText(vatTotal),
        total: centsText(subtotal + vatTotal),
        submitted_at: o.status === 'DRAFT' && !o.rejection ? null : cal.at(o.day, 11),
        approved_by: approved ? actorId : null,
        approved_at: approved ? cal.at(o.day, 15) : null,
        sent_at: approved ? cal.at(o.day + 1, 9) : null,
        sent_by: approved ? actorId : null,
        sent_to: approved && email?.email ? [email.email] : [],
        rejection_notes: o.rejection ?? null,
        rejected_by: o.rejection ? actorId : null,
        rejected_at: o.rejection ? cal.at(o.day + 1, 10) : null,
        created_at: cal.at(o.day, 10),
        updated_at: cal.at(o.day + 1, 10),
        lines: {
          create: o.lines.map((l, i) => {
            const requestLineId = lineId(l.requestKey, l.position);
            return {
              position: i + 1,
              request_line_id: requestLineId,
              quote_line_id: o.quoteKey
                ? comahueLines.find((q) => q.request_line_id === requestLineId)?.id ?? null
                : null,
              quantity: l.quantity,
              unit_price: l.price,
              vat_rate_id: VAT_21.id,
              net_total: centsText(amounts[i].net),
              vat_amount: centsText(amounts[i].vat),
            };
          }),
        },
        ...(o.rejection
          ? {
              rejections: {
                create: [{ rejected_by: actorId, rejected_at: cal.at(o.day + 1, 10), reason: o.rejection }],
              },
            }
          : {}),
      },
    });
  }

  return `${quotePlans.length} pedidos de cotización y ${orderPlans.length} órdenes de compra`;
}
