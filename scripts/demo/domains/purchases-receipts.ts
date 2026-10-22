/**
 * Compras, etapa 3: recepciones de mercaderia con su entrada a Almacenes.
 */
import { Prisma } from '../../../src/generated/prisma/client.ts';
import type { Ctx } from '../lib/ctx.ts';
import { demoId } from '../lib/ids.ts';

/**
 * Entrada a Almacenes de una recepcion. La demo no puede usar el motor de stock (ver
 * `warehouses.ts`: la imagen no copia `src/`), asi que reproduce su regla para ENTRY: saldo por
 * material + deposito + lote, costo promedio ponderado de la empresa y numero MOV correlativo.
 * Al final `seedReceipts` verifica que cada saldo siga siendo la suma de sus movimientos.
 */
async function demoEntry(
  ctx: Ctx,
  input: {
    warehouseId: string;
    day: number;
    reference: string;
    lines: {
      materialId: string;
      quantity: number;
      unitCost: number;
      batch?: { number: string; expiresInDays: number };
    }[];
  }
): Promise<{ id: string; number: string }> {
  const { tx, cal, company, actorId } = ctx;
  const dec = (v: number | string | Prisma.Decimal) => new Prisma.Decimal(v);
  const last = await tx.$queryRaw<{ n: bigint }[]>`
    SELECT COALESCE(MAX(NULLIF(regexp_replace(number, '\\D', '', 'g'), '')::bigint), 0) AS n
    FROM stock_movements WHERE company_id = ${company.id}::uuid
  `;
  const number = `MOV-${String(Number(last[0]?.n ?? 0) + 1).padStart(6, '0')}`;
  const movementId = demoId('stock_movement', input.reference);
  let movementTotal = dec(0);
  const movementLines: Prisma.stock_movement_linesCreateManyInput[] = [];

  for (const [i, line] of input.lines.entries()) {
    const quantity = dec(line.quantity);
    const cost = dec(line.unitCost);
    let batchId: string | null = null;
    if (line.batch) {
      batchId = demoId('material_batch', `${line.materialId}:${line.batch.number}`);
      await tx.material_batches.create({
        data: {
          id: batchId,
          company_id: company.id,
          material_id: line.materialId,
          batch_number: line.batch.number,
          expires_at: new Date(`${cal.ymd(line.batch.expiresInDays)}T00:00:00.000Z`),
        },
      });
    }
    const material = await tx.materials.findUniqueOrThrow({
      where: { id: line.materialId },
      select: { average_cost: true },
    });
    const total =
      (
        await tx.stock_balances.aggregate({
          where: { company_id: company.id, material_id: line.materialId },
          _sum: { quantity: true },
        })
      )._sum.quantity ?? dec(0);
    const average = total.lte(0)
      ? cost
      : material.average_cost.mul(total).plus(quantity.mul(cost)).div(total.plus(quantity)).toDecimalPlaces(4);
    await tx.materials.update({ where: { id: line.materialId }, data: { average_cost: average } });

    const balance = await tx.stock_balances.findFirst({
      where: {
        company_id: company.id,
        material_id: line.materialId,
        warehouse_id: input.warehouseId,
        batch_id: batchId,
      },
      select: { id: true },
    });
    if (balance)
      await tx.stock_balances.update({ where: { id: balance.id }, data: { quantity: { increment: quantity } } });
    else {
      await tx.stock_balances.create({
        data: {
          company_id: company.id,
          material_id: line.materialId,
          warehouse_id: input.warehouseId,
          batch_id: batchId,
          quantity,
        },
      });
    }

    const lineTotal = quantity.mul(cost).toDecimalPlaces(4);
    movementTotal = movementTotal.plus(lineTotal);
    movementLines.push({
      id: demoId('stock_line', `${input.reference}:${i}`),
      movement_id: movementId,
      material_id: line.materialId,
      quantity,
      direction: 1,
      unit_cost: cost,
      total_cost: lineTotal,
      batch_id: batchId,
      unit_id: null,
    });
  }

  await tx.stock_movements.create({
    data: {
      id: movementId,
      company_id: company.id,
      number,
      type: 'ENTRY',
      warehouse_id: input.warehouseId,
      occurred_on: new Date(`${cal.ymd(input.day)}T00:00:00.000Z`),
      reference: input.reference,
      total_cost: movementTotal,
      created_by: actorId,
      created_at: cal.at(input.day, 11),
    },
  });
  await tx.stock_movement_lines.createMany({ data: movementLines });
  return { id: movementId, number };
}

export async function seedReceipts(ctx: Ctx): Promise<string> {
  const { tx, cal, company, actorId } = ctx;
  const warehouseId = demoId('warehouse', 'BASE');
  const orderOf = async (key: string) =>
    tx.purchase_orders.findUniqueOrThrow({
      where: { id: demoId('purchase_order', key) },
      select: {
        id: true,
        number: true,
        supplier_id: true,
        payment_term_days: true,
        lines: {
          select: {
            id: true,
            request_line_id: true,
            quantity: true,
            unit_price: true,
            vat_rate_id: true,
            request_line: { select: { material_id: true } },
          },
        },
      },
    });

  let rc = 0;
  let oc = await tx.purchase_orders.count({ where: { company_id: company.id } });
  const receipt = async (
    order: Awaited<ReturnType<typeof orderOf>>,
    day: number,
    deliveryNote: string,
    parts: { lineIndex: number; quantity: number; excess?: number; batch?: { number: string; expiresInDays: number } }[]
  ) => {
    const number = `RC-${String(++rc).padStart(6, '0')}`;
    const id = demoId('purchase_receipt', number);
    const materialParts = parts.filter((p) => order.lines[p.lineIndex]!.request_line.material_id);
    const movement = materialParts.length
      ? await demoEntry(ctx, {
          warehouseId,
          day,
          reference: `${number} · ${order.number}`,
          lines: materialParts.map((p) => {
            const line = order.lines[p.lineIndex]!;
            return {
              materialId: line.request_line.material_id!,
              quantity: p.quantity + (p.excess ?? 0),
              unitCost: line.unit_price.toNumber(),
              batch: p.batch,
            };
          }),
        })
      : null;
    await tx.purchase_receipts.create({
      data: {
        id,
        company_id: company.id,
        number,
        order_id: order.id,
        supplier_id: order.supplier_id,
        warehouse_id: movement ? warehouseId : null,
        received_on: new Date(`${cal.ymd(day)}T00:00:00.000Z`),
        delivery_note: deliveryNote,
        stock_movement_id: movement?.id ?? null,
        created_by: actorId,
        created_at: cal.at(day, 11),
      },
    });
    for (const p of parts) {
      const line = order.lines[p.lineIndex]!;
      await tx.purchase_receipt_lines.create({
        data: {
          receipt_id: id,
          order_line_id: line.id,
          quantity: p.quantity,
          unit_cost: line.unit_price,
          batch_number: p.batch?.number ?? null,
          batch_expires_on: p.batch ? new Date(`${cal.ymd(p.batch.expiresInDays)}T00:00:00.000Z`) : null,
        },
      });
      if (p.excess) {
        // OC complementaria por el excedente, pendiente de aprobacion.
        const net = Math.round(p.excess * line.unit_price.toNumber() * 100);
        const vat = Math.round(net * 0.21);
        const complement = await tx.purchase_orders.create({
          data: {
            company_id: company.id,
            number: `OC-${String(++oc).padStart(6, '0')}`,
            supplier_id: order.supplier_id,
            status: 'PENDING_APPROVAL',
            created_by: actorId,
            payment_term_days: order.payment_term_days,
            notes: `Regulariza el excedente recibido en ${number} (${order.number})`,
            subtotal: (net / 100).toFixed(2),
            vat_total: (vat / 100).toFixed(2),
            total: ((net + vat) / 100).toFixed(2),
            submitted_at: cal.at(day, 12),
            complements_order_id: order.id,
            complements_receipt_id: id,
            created_at: cal.at(day, 11),
            lines: {
              create: [
                {
                  position: 1,
                  request_line_id: line.request_line_id,
                  quantity: p.excess,
                  unit_price: line.unit_price,
                  vat_rate_id: line.vat_rate_id,
                  net_total: (net / 100).toFixed(2),
                  vat_amount: (vat / 100).toFixed(2),
                },
              ],
            },
          },
          select: { lines: { select: { id: true } } },
        });
        await tx.purchase_receipt_lines.create({
          data: {
            receipt_id: id,
            order_line_id: complement.lines[0]!.id,
            quantity: p.excess,
            unit_cost: line.unit_price,
          },
        });
      }
    }
  };

  // Lubricantes: llegan 120 de 200 l y el proveedor no tiene el resto -> OC cerrada.
  const lubricants = await orderOf('oc-lubricantes');
  await receipt(lubricants, -12, '0003-00004512', [{ lineIndex: 0, quantity: 120 }]);
  await tx.purchase_orders.update({
    where: { id: lubricants.id },
    data: {
      status: 'CLOSED',
      closed_by: actorId,
      closed_at: cal.at(-10, 9),
      close_reason: 'El proveedor no consigue el resto: se pide a otro',
    },
  });
  // Grasa por lote: llegan 20 de 30 kg.
  const grease = await orderOf('oc-grasa');
  await receipt(grease, -5, '0001-00000877', [
    { lineIndex: 0, quantity: 20, batch: { number: 'L-2410', expiresInDays: 540 } },
  ]);
  await tx.purchase_orders.update({ where: { id: grease.id }, data: { status: 'PARTIALLY_RECEIVED' } });
  // Filtros: llegan 12 de 10 -> recibida, con OC complementaria por 2.
  const filters = await orderOf('oc-filtros');
  await receipt(filters, -4, '0002-00010023', [{ lineIndex: 0, quantity: 10, excess: 2 }]);
  await tx.purchase_orders.update({ where: { id: filters.id }, data: { status: 'RECEIVED' } });
  // Servicio de grua: se da por recibido, sin stock.
  const crane = await orderOf('oc-grua');
  await receipt(crane, -3, 'Parte de horas 118', [{ lineIndex: 0, quantity: 8 }]);
  await tx.purchase_orders.update({ where: { id: crane.id }, data: { status: 'RECEIVED' } });

  // Mismo control que la demo de Almacenes: cada saldo es la suma de sus movimientos.
  const mismatches = await tx.$queryRaw<{ n: bigint }[]>`
    WITH ledger AS (
      SELECT l.material_id, m.warehouse_id, l.batch_id, SUM(l.direction * l.quantity) AS qty
      FROM stock_movement_lines l JOIN stock_movements m ON m.id = l.movement_id
      WHERE m.company_id = ${company.id}::uuid GROUP BY 1, 2, 3
      UNION ALL
      SELECT l.material_id, m.target_warehouse_id, l.batch_id, SUM(-l.direction * l.quantity)
      FROM stock_movement_lines l JOIN stock_movements m ON m.id = l.movement_id
      WHERE m.company_id = ${company.id}::uuid AND m.target_warehouse_id IS NOT NULL GROUP BY 1, 2, 3
    ), expected AS (SELECT material_id, warehouse_id, batch_id, SUM(qty) AS qty FROM ledger GROUP BY 1, 2, 3)
    SELECT count(*) AS n FROM stock_balances b
    LEFT JOIN expected e ON e.material_id = b.material_id AND e.warehouse_id = b.warehouse_id
      AND e.batch_id IS NOT DISTINCT FROM b.batch_id
    WHERE b.company_id = ${company.id}::uuid AND b.quantity <> COALESCE(e.qty, 0)
  `;
  if (Number(mismatches[0]?.n ?? 0) > 0) throw new Error('demo compras: los saldos no coinciden con los movimientos');

  return `${rc} recepciones`;
}
