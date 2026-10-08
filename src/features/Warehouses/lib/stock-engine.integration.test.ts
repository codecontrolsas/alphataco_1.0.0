import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@/generated/prisma/client';
import type { RequestDeliveryLineInput } from '../schemas/requests';
import type { StockMovementInput, StockMovementLineInput } from '../schemas/stock-movement';
import type { StockErrorCode } from './stock-errors';

/**
 * Integracion del motor de stock contra el Postgres del compose: `npm run test:warehouses`.
 *
 * Datos fijos (dos empresas, un usuario, depositos, materiales de los tres tipos de control y
 * un cliente) creados en `beforeAll` y borrados en `afterAll`. Cada caso corre dentro de una
 * transaccion que se descarta (Rollback), asi arranca siempre con stock en cero; el de
 * concurrencia es el unico que confirma de verdad, porque necesita dos transacciones reales.
 */

const COMPANY = 'c1000000-0000-4000-8000-000000000001';
const OTHER_COMPANY = 'c1000000-0000-4000-8000-000000000002';
const PROFILE = 'c1000000-0000-4000-8000-000000000003';
const UNIT = 'c1000000-0000-4000-8000-000000000004';
const OTHER_UNIT = 'c1000000-0000-4000-8000-000000000005';
const W1 = 'c1000000-0000-4000-8000-000000000010';
const W2 = 'c1000000-0000-4000-8000-000000000011';
const W_INACTIVE = 'c1000000-0000-4000-8000-000000000012';
const QTY = 'c1000000-0000-4000-8000-000000000020';
const BATCH = 'c1000000-0000-4000-8000-000000000021';
const SERIAL = 'c1000000-0000-4000-8000-000000000022';
const FOREIGN = 'c1000000-0000-4000-8000-000000000023';
const CUSTOMER = 'c1000000-0000-4000-8000-000000000030';

class Rollback extends Error {}

const RUN = Boolean(process.env.DATABASE_URL);

async function db() {
  return (await import('@/shared/lib/prisma')).prisma;
}

async function engine() {
  return import('./stock-engine');
}

/** Corre `fn` en una transaccion que se descarta y devuelve lo que `fn` devolvio. */
async function inRollback<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const prisma = await db();
  let result: { value: T } | null = null;
  await prisma
    .$transaction(
      async (tx) => {
        result = { value: await fn(tx) };
        throw new Rollback();
      },
      { timeout: 20_000 }
    )
    .catch((error) => {
      if (!(error instanceof Rollback)) throw error;
    });
  return result!.value;
}

function line(materialId: string, overrides: Partial<StockMovementLineInput> = {}): StockMovementLineInput {
  return {
    materialId,
    quantity: '1',
    unitCost: null,
    adjustmentDirection: null,
    batchId: null,
    batchNumber: null,
    batchExpiresOn: null,
    serialNumbers: [],
    unitIds: [],
    ...overrides,
  };
}

function movement(overrides: Partial<StockMovementInput>): StockMovementInput {
  return {
    type: 'ENTRY',
    warehouseId: W1,
    targetWarehouseId: null,
    occurredOn: new Date(),
    reference: null,
    notes: null,
    destinationType: null,
    employeeId: null,
    vehicleId: null,
    otherEquipmentId: null,
    maintenanceOrderId: null,
    customerId: null,
    customerServiceId: null,
    lines: [],
    ...overrides,
  };
}

const entry = (lines: StockMovementLineInput[], warehouseId = W1) => movement({ type: 'ENTRY', warehouseId, lines });
const exitToCustomer = (lines: StockMovementLineInput[], warehouseId = W1) =>
  movement({ type: 'EXIT', warehouseId, destinationType: 'CUSTOMER', customerId: CUSTOMER, lines });

async function register(tx: Prisma.TransactionClient, input: StockMovementInput) {
  return (await engine()).registerStockMovement(tx, COMPANY, PROFILE, input);
}

async function reverse(tx: Prisma.TransactionClient, movementId: string, reason = 'error de carga') {
  return (await engine()).reverseStockMovement(tx, COMPANY, PROFILE, movementId, reason);
}

/** Codigo del StockError que lanza `fn` (falla el test si no lanza o lanza otra cosa). */
/** Pedido aprobado al cliente de prueba, creado directo (el alta es de la action, no del motor). */
async function approvedRequest(
  tx: Pick<Prisma.TransactionClient, 'material_requests'>,
  lines: { materialId: string; quantity: string }[],
  number = 'PED-000001'
) {
  return tx.material_requests.create({
    data: {
      company_id: COMPANY,
      number,
      status: 'APPROVED',
      requested_by: PROFILE,
      destination_type: 'CUSTOMER',
      customer_id: CUSTOMER,
      decided_by: PROFILE,
      decided_at: new Date(),
      lines: { create: lines.map((l) => ({ material_id: l.materialId, quantity: l.quantity })) },
    },
    include: { lines: { orderBy: { quantity: 'desc' } } },
  });
}

async function deliver(tx: Prisma.TransactionClient, requestId: string, lines: RequestDeliveryLineInput[], warehouseId = W1) {
  return (await engine()).registerRequestDelivery(tx, COMPANY, PROFILE, {
    requestId,
    warehouseId,
    occurredOn: new Date(),
    notes: null,
    lines,
  });
}

const deliveryLine = (requestLineId: string, quantity: string, extra: Partial<RequestDeliveryLineInput> = {}) => ({
  requestLineId,
  quantity,
  batchId: null,
  unitIds: [],
  ...extra,
});

async function requestStatus(tx: Pick<Prisma.TransactionClient, 'material_requests'>, id: string) {
  return (await tx.material_requests.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
}

async function stockErrorOf(fn: () => Promise<unknown>): Promise<{ code: StockErrorCode; message: string }> {
  const { StockError } = await import('./stock-errors');
  try {
    await fn();
  } catch (error) {
    if (error instanceof StockError) return { code: error.code, message: error.message };
    throw error;
  }
  throw new Error('Se esperaba un StockError');
}

async function balance(tx: Prisma.TransactionClient, materialId: string, warehouseId: string, batchId: string | null = null) {
  const row = await tx.stock_balances.findFirst({
    where: { material_id: materialId, warehouse_id: warehouseId, batch_id: batchId },
    select: { quantity: true },
  });
  return row ? row.quantity.toString() : '0';
}

async function averageCost(tx: Prisma.TransactionClient, materialId: string) {
  return (await tx.materials.findUniqueOrThrow({ where: { id: materialId } })).average_cost.toFixed(4);
}

/** Invariante del enfoque A: cada saldo es la suma de sus movimientos. */
async function balancesMatchLedger(tx: Prisma.TransactionClient) {
  const mismatches = await tx.$queryRaw<{ id: string }[]>`
    WITH ledger AS (
      SELECT l.material_id, m.warehouse_id, l.batch_id, SUM(l.direction * l.quantity) AS qty
      FROM stock_movement_lines l JOIN stock_movements m ON m.id = l.movement_id
      WHERE m.company_id = ${COMPANY}::uuid
      GROUP BY 1, 2, 3
      UNION ALL
      SELECT l.material_id, m.target_warehouse_id, l.batch_id, SUM(-l.direction * l.quantity)
      FROM stock_movement_lines l JOIN stock_movements m ON m.id = l.movement_id
      WHERE m.company_id = ${COMPANY}::uuid AND m.target_warehouse_id IS NOT NULL
      GROUP BY 1, 2, 3
    ), expected AS (
      SELECT material_id, warehouse_id, batch_id, SUM(qty) AS qty FROM ledger GROUP BY 1, 2, 3
    )
    SELECT b.id FROM stock_balances b
    LEFT JOIN expected e ON e.material_id = b.material_id AND e.warehouse_id = b.warehouse_id
      AND e.batch_id IS NOT DISTINCT FROM b.batch_id
    WHERE b.company_id = ${COMPANY}::uuid AND b.quantity <> COALESCE(e.qty, 0)
  `;
  return mismatches.length === 0;
}

/** El kardex reconstruye saldo y promedio con la misma regla: tiene que dar lo que grabo el motor. */
async function kardexMatchesEngine(tx: Prisma.TransactionClient, materialId: string) {
  const { replayKardex } = await import('./kardex');
  const lines = await tx.stock_movement_lines.findMany({
    where: { material_id: materialId },
    select: { quantity: true, direction: true, unit_cost: true, movement: { select: { type: true, reverses_movement_id: true } } },
    orderBy: [{ movement: { number: 'asc' } }, { id: 'asc' }],
  });
  const last = replayKardex(lines).at(-1)!;
  const material = await tx.materials.findUniqueOrThrow({ where: { id: materialId } });
  const stock = await tx.stock_balances.aggregate({ where: { material_id: materialId }, _sum: { quantity: true } });
  return last.average.equals(material.average_cost) && last.balance.equals(stock._sum.quantity ?? 0);
}

async function cleanup() {
  const prisma = await db();
  const company_id = { in: [COMPANY, OTHER_COMPANY] };
  // En orden inverso a las dependencias: entre las tablas de Almacenes las FK son NO ACTION
  // y la cascada desde `company` tropieza con ellas (verifica las lineas antes de borrarlas).
  await prisma.stock_movement_lines.deleteMany({ where: { movement: { company_id } } });
  await prisma.material_units.deleteMany({ where: { company_id } });
  await prisma.stock_balances.deleteMany({ where: { company_id } });
  await prisma.stock_movements.updateMany({ where: { company_id }, data: { reverses_movement_id: null } });
  await prisma.stock_movements.deleteMany({ where: { company_id } });
  await prisma.material_requests.deleteMany({ where: { company_id } });
  await prisma.material_batches.deleteMany({ where: { company_id } });
  await prisma.materials.deleteMany({ where: { company_id } });
  await prisma.warehouses.deleteMany({ where: { company_id } });
  await prisma.measurement_units.deleteMany({ where: { company_id } });
  await prisma.customers.deleteMany({ where: { id: CUSTOMER } });
  await prisma.company.deleteMany({ where: { id: company_id } });
  await prisma.profile.deleteMany({ where: { id: PROFILE } });
}

describe.skipIf(!RUN)('motor de stock (integracion)', () => {
  beforeAll(async () => {
    await cleanup();
    const prisma = await db();
    const city = await prisma.cities.findFirstOrThrow({ select: { id: true } });
    for (const [id, cuit] of [
      [COMPANY, '30999999981'],
      [OTHER_COMPANY, '30999999982'],
    ] as const) {
      await prisma.company.create({
        data: {
          id,
          company_name: `Almacenes test ${cuit}`,
          description: 'empresa de prueba del motor de stock',
          contact_email: 'almacenes-test@alphataco.local',
          contact_phone: '+542991234567',
          address: 'Calle 123',
          city: city.id,
          country: 'argentina',
          industry: 'Petroleo',
          company_cuit: cuit,
        },
      });
    }
    await prisma.profile.create({ data: { id: PROFILE, credential_id: PROFILE, email: 'almacenes-test@alphataco.local' } });
    await prisma.measurement_units.createMany({
      data: [
        { id: UNIT, company_id: COMPANY, name: 'Litro', abbreviation: 'l' },
        { id: OTHER_UNIT, company_id: OTHER_COMPANY, name: 'Unidad', abbreviation: 'u' },
      ],
    });
    await prisma.warehouses.createMany({
      data: [
        { id: W1, company_id: COMPANY, code: 'BASE', name: 'Depósito Base' },
        { id: W2, company_id: COMPANY, code: 'OBRA', name: 'Depósito Obra' },
        { id: W_INACTIVE, company_id: COMPANY, code: 'OLD', name: 'Depósito Viejo', is_active: false },
      ],
    });
    await prisma.materials.createMany({
      data: [
        { id: QTY, company_id: COMPANY, code: 'ACE-15W40', name: 'Aceite 15W40', unit_id: UNIT },
        { id: BATCH, company_id: COMPANY, code: 'GRA-01', name: 'Grasa', unit_id: UNIT, tracking_type: 'BATCH' },
        { id: SERIAL, company_id: COMPANY, code: 'TAL-01', name: 'Taladro', unit_id: UNIT, tracking_type: 'SERIAL' },
        { id: FOREIGN, company_id: OTHER_COMPANY, code: 'X', name: 'De otra empresa', unit_id: OTHER_UNIT },
      ],
    });
    await prisma.customers.create({
      data: { id: CUSTOMER, name: 'Cliente almacenes test', cuit: BigInt(30999999983), company_id: COMPANY },
    });
  }, 30_000);

  afterAll(async () => {
    await cleanup();
  }, 30_000);

  it('entradas, salida y costo promedio ponderado', async () => {
    const result = await inRollback(async (tx) => {
      const first = await register(tx, entry([line(QTY, { quantity: '10', unitCost: '100' })]));
      const second = await register(tx, entry([line(QTY, { quantity: '30', unitCost: '200' })]));
      const out = await register(tx, exitToCustomer([line(QTY, { quantity: '4' })]));
      const outLine = await tx.stock_movement_lines.findFirstOrThrow({ where: { movement_id: out.id } });
      return {
        numbers: [first.number, second.number, out.number],
        balance: await balance(tx, QTY, W1),
        average: await averageCost(tx, QTY),
        exitUnitCost: outLine.unit_cost.toFixed(4),
        exitTotal: out.totalCost.toFixed(4),
        consistent: await balancesMatchLedger(tx),
      };
    });

    expect(result.numbers).toEqual(['MOV-000001', 'MOV-000002', 'MOV-000003']);
    expect(result.balance).toBe('36');
    // (10×100 + 30×200) / 40 = 175; la salida no lo mueve y se valua a el.
    expect(result.average).toBe('175.0000');
    expect(result.exitUnitCost).toBe('175.0000');
    expect(result.exitTotal).toBe('700.0000');
    expect(result.consistent).toBe(true);
  });

  it('rechaza una salida sin stock suficiente con el detalle', async () => {
    const error = await inRollback(async (tx) => {
      await register(tx, entry([line(QTY, { quantity: '12', unitCost: '1' })]));
      return stockErrorOf(() => register(tx, exitToCustomer([line(QTY, { quantity: '20' })])));
    });
    expect(error.code).toBe('INSUFFICIENT_STOCK');
    expect(error.message).toBe('Stock insuficiente de Aceite 15W40 en Depósito Base: hay 12 l, se pidieron 20 l');
  });

  it('transferencia: mueve entre depositos sin tocar el total ni el promedio', async () => {
    const result = await inRollback(async (tx) => {
      await register(tx, entry([line(QTY, { quantity: '10', unitCost: '50' })]));
      await register(tx, movement({ type: 'TRANSFER', targetWarehouseId: W2, lines: [line(QTY, { quantity: '3' })] }));
      return {
        w1: await balance(tx, QTY, W1),
        w2: await balance(tx, QTY, W2),
        average: await averageCost(tx, QTY),
        consistent: await balancesMatchLedger(tx),
      };
    });
    expect(result).toEqual({ w1: '7', w2: '3', average: '50.0000', consistent: true });
  });

  it('ajustes: exigen motivo, suman o restan al promedio vigente', async () => {
    const result = await inRollback(async (tx) => {
      await register(tx, entry([line(QTY, { quantity: '10', unitCost: '50' })]));
      const noReason = await stockErrorOf(() =>
        register(tx, movement({ type: 'ADJUSTMENT', lines: [line(QTY, { adjustmentDirection: 'OUT' })] }))
      );
      await register(
        tx,
        movement({ type: 'ADJUSTMENT', notes: 'conteo', lines: [line(QTY, { quantity: '2', adjustmentDirection: 'OUT' })] })
      );
      const plus = await register(
        tx,
        movement({ type: 'ADJUSTMENT', notes: 'conteo', lines: [line(QTY, { quantity: '5', adjustmentDirection: 'IN' })] })
      );
      return {
        noReason: noReason.code,
        balance: await balance(tx, QTY, W1),
        plusTotal: plus.totalCost.toFixed(4),
        average: await averageCost(tx, QTY),
      };
    });
    expect(result).toEqual({ noReason: 'INVALID_INPUT', balance: '13', plusTotal: '250.0000', average: '50.0000' });
  });

  it('lotes: se reutilizan por numero, rechazan otro vencimiento y salen por lote', async () => {
    const result = await inRollback(async (tx) => {
      const expires = new Date('2027-03-31T12:00:00');
      await register(tx, entry([line(BATCH, { quantity: '5', unitCost: '10', batchNumber: 'L1', batchExpiresOn: expires })]));
      await register(tx, entry([line(BATCH, { quantity: '2', unitCost: '10', batchNumber: 'L1', batchExpiresOn: expires })]));
      const mismatch = await stockErrorOf(() =>
        register(tx, entry([line(BATCH, { quantity: '1', unitCost: '10', batchNumber: 'L1', batchExpiresOn: new Date('2028-01-01T12:00:00') })]))
      );
      const batch = await tx.material_batches.findFirstOrThrow({ where: { material_id: BATCH, batch_number: 'L1' } });
      const missingBatch = await stockErrorOf(() => register(tx, exitToCustomer([line(BATCH, { quantity: '1' })])));
      await register(tx, exitToCustomer([line(BATCH, { quantity: '3', batchId: batch.id })]));
      return {
        batches: await tx.material_batches.count({ where: { material_id: BATCH } }),
        expires: batch.expires_at?.toISOString().slice(0, 10),
        mismatch: mismatch.code,
        missingBatch: missingBatch.code,
        balance: await balance(tx, BATCH, W1, batch.id),
        consistent: await balancesMatchLedger(tx),
      };
    });
    expect(result).toEqual({
      batches: 1,
      expires: '2027-03-31',
      mismatch: 'BATCH_EXPIRY_MISMATCH',
      missingBatch: 'INVALID_TRACKING',
      balance: '4',
      consistent: true,
    });
  });

  it('serializados: alta por serie, una linea por unidad, salida y descarte', async () => {
    const result = await inRollback(async (tx) => {
      const inbound = await register(
        tx,
        entry([line(SERIAL, { quantity: '2', unitCost: '1000', serialNumbers: ['S-1', 'S-2'] })])
      );
      const duplicate = await stockErrorOf(() =>
        register(tx, entry([line(SERIAL, { quantity: '1', unitCost: '1000', serialNumbers: ['S-1'] })]))
      );
      const units = await tx.material_units.findMany({ where: { material_id: SERIAL }, orderBy: { serial_number: 'asc' } });
      const [s1, s2] = units;
      await register(tx, exitToCustomer([line(SERIAL, { quantity: '1', unitIds: [s1!.id] })]));
      const again = await stockErrorOf(() => register(tx, exitToCustomer([line(SERIAL, { quantity: '1', unitIds: [s1!.id] })])));
      await register(
        tx,
        movement({ type: 'ADJUSTMENT', notes: 'roto', lines: [line(SERIAL, { adjustmentDirection: 'OUT', unitIds: [s2!.id] })] })
      );
      const after = await tx.material_units.findMany({ where: { material_id: SERIAL }, orderBy: { serial_number: 'asc' } });
      return {
        inboundLines: inbound.lineCount,
        duplicate: duplicate.code,
        again: again.code,
        statuses: after.map((u) => `${u.serial_number}:${u.status}:${u.warehouse_id ?? '-'}`),
        balance: await balance(tx, SERIAL, W1),
        consistent: await balancesMatchLedger(tx),
      };
    });
    expect(result).toEqual({
      inboundLines: 2,
      duplicate: 'DUPLICATE_SERIAL',
      again: 'UNIT_NOT_AVAILABLE',
      statuses: ['S-1:OUT:-', 'S-2:DISCARDED:-'],
      balance: '0',
      consistent: true,
    });
  });

  it('anulaciones: devuelven stock y costo, una sola vez, y no si ya se consumio', async () => {
    const result = await inRollback(async (tx) => {
      const in1 = await register(tx, entry([line(QTY, { quantity: '10', unitCost: '100' })]));
      const in2 = await register(tx, entry([line(QTY, { quantity: '10', unitCost: '200' })])); // promedio 150
      const out = await register(tx, exitToCustomer([line(QTY, { quantity: '5' })])); // sale a 150
      const reversal = await reverse(tx, out.id);
      const afterExitReversal = { balance: await balance(tx, QTY, W1), average: await averageCost(tx, QTY) };
      const twice = await stockErrorOf(() => reverse(tx, out.id));
      const ofReversal = await stockErrorOf(() => reverse(tx, reversal.id));
      const noReason = await stockErrorOf(() => reverse(tx, in1.id, '  '));

      await reverse(tx, in2.id); // retira 10 a 200 → quedan 10 a 100
      const afterEntryReversal = { balance: await balance(tx, QTY, W1), average: await averageCost(tx, QTY) };

      await register(tx, exitToCustomer([line(QTY, { quantity: '8' })]));
      const consumed = await stockErrorOf(() => reverse(tx, in1.id));
      const reversalRow = await tx.stock_movements.findUniqueOrThrow({ where: { id: reversal.id } });
      return {
        afterExitReversal,
        afterEntryReversal,
        twice: twice.code,
        ofReversal: ofReversal.code,
        noReason: noReason.code,
        consumed: consumed.code,
        reversalKeepsDestination: reversalRow.customer_id === CUSTOMER && reversalRow.type === 'EXIT',
        consistent: await balancesMatchLedger(tx),
        kardexMatchesEngine: await kardexMatchesEngine(tx, QTY),
      };
    });
    expect(result).toEqual({
      afterExitReversal: { balance: '20', average: '150.0000' },
      afterEntryReversal: { balance: '10', average: '100.0000' },
      twice: 'ALREADY_REVERSED',
      ofReversal: 'CANNOT_REVERSE_REVERSAL',
      noReason: 'INVALID_INPUT',
      consumed: 'INSUFFICIENT_STOCK',
      reversalKeepsDestination: true,
      consistent: true,
      kardexMatchesEngine: true,
    });
  });

  it('anular una transferencia y un serializado entregado', async () => {
    const result = await inRollback(async (tx) => {
      await register(tx, entry([line(SERIAL, { quantity: '1', unitCost: '500', serialNumbers: ['T-1'] })]));
      const unit = await tx.material_units.findFirstOrThrow({ where: { serial_number: 'T-1' } });
      const transfer = await register(
        tx,
        movement({ type: 'TRANSFER', targetWarehouseId: W2, lines: [line(SERIAL, { unitIds: [unit.id] })] })
      );
      await reverse(tx, transfer.id);
      const back = await tx.material_units.findUniqueOrThrow({ where: { id: unit.id } });
      const out = await register(tx, exitToCustomer([line(SERIAL, { unitIds: [unit.id] })]));
      await reverse(tx, out.id);
      const returned = await tx.material_units.findUniqueOrThrow({ where: { id: unit.id } });
      return {
        afterTransferReversal: back.warehouse_id === W1,
        afterExitReversal: `${returned.status}:${returned.warehouse_id === W1}`,
        consistent: await balancesMatchLedger(tx),
      };
    });
    expect(result).toEqual({ afterTransferReversal: true, afterExitReversal: 'IN_STOCK:true', consistent: true });
  });

  it('serializados: anular una entrada libera las series para volver a cargarlas', async () => {
    const result = await inRollback(async (tx) => {
      const wrong = await register(tx, entry([line(SERIAL, { quantity: '2', unitCost: '999', serialNumbers: ['R-1', 'R-2'] })]));
      await reverse(tx, wrong.id, 'costo mal cargado');
      const fixed = await register(tx, entry([line(SERIAL, { quantity: '2', unitCost: '500', serialNumbers: ['R-1', 'R-2'] })]));
      const units = await tx.material_units.findMany({ where: { serial_number: { in: ['R-1', 'R-2'] } } });
      return {
        fixedLines: fixed.lineCount,
        units: units.length,
        allInStock: units.every((u) => u.status === 'IN_STOCK' && u.warehouse_id === W1 && u.last_movement_id === fixed.id),
        balance: await balance(tx, SERIAL, W1),
        average: await averageCost(tx, SERIAL),
        consistent: await balancesMatchLedger(tx),
        kardexMatchesEngine: await kardexMatchesEngine(tx, SERIAL),
      };
    });
    expect(result).toEqual({
      fixedLines: 2,
      units: 2,
      allInStock: true,
      balance: '2',
      average: '500.0000',
      consistent: true,
      kardexMatchesEngine: true,
    });
  });

  it('prestamos: devolver al costo de la salida, a otro deposito, compensando al tenedor', async () => {
    const result = await inRollback(async (tx) => {
      const { registerReturn } = await engine();
      await register(tx, entry([line(SERIAL, { quantity: '2', unitCost: '1000', serialNumbers: ['P-A', 'P-B'] })]));
      const [a, b] = await tx.material_units.findMany({ where: { material_id: SERIAL }, orderBy: { serial_number: 'asc' } });
      const out = await register(tx, exitToCustomer([line(SERIAL, { unitIds: [a!.id] })]));
      await register(tx, entry([line(SERIAL, { quantity: '1', unitCost: '3000', serialNumbers: ['P-C'] })])); // B y C: promedio 2000

      const notFromExit = await stockErrorOf(() =>
        registerReturn(tx, COMPANY, PROFILE, { exitMovementId: out.id, unitIds: [b!.id], warehouseId: W2, occurredOn: new Date(), notes: null })
      );
      const returned = await registerReturn(tx, COMPANY, PROFILE, {
        exitMovementId: out.id,
        unitIds: [a!.id],
        warehouseId: W2,
        occurredOn: new Date(),
        notes: 'vuelve del cliente',
      });
      const twice = await stockErrorOf(() =>
        registerReturn(tx, COMPANY, PROFILE, { exitMovementId: out.id, unitIds: [a!.id], warehouseId: W1, occurredOn: new Date(), notes: null })
      );
      const unit = await tx.material_units.findUniqueOrThrow({ where: { id: a!.id } });
      const movement = await tx.stock_movements.findUniqueOrThrow({ where: { id: returned.id } });
      return {
        notFromExit: notFromExit.code,
        twice: twice.code,
        total: returned.totalCost.toFixed(4),
        unit: `${unit.status}:${unit.warehouse_id === W2}`,
        compensates: movement.type === 'RETURN' && movement.customer_id === CUSTOMER && movement.returned_from_movement_id === out.id,
        // (2 x 2000 + 1 x 1000) / 3
        average: await averageCost(tx, SERIAL),
        w2: await balance(tx, SERIAL, W2),
        consistent: await balancesMatchLedger(tx),
        kardexMatchesEngine: await kardexMatchesEngine(tx, SERIAL),
      };
    });
    expect(result).toEqual({
      notFromExit: 'UNIT_NOT_AVAILABLE',
      twice: 'NOT_ON_LOAN',
      total: '1000.0000',
      unit: 'IN_STOCK:true',
      compensates: true,
      average: '1666.6667',
      w2: '1',
      consistent: true,
      kardexMatchesEngine: true,
    });
  });

  it('prestamos: anular la devolucion reabre el prestamo; una salida devuelta no se anula', async () => {
    const result = await inRollback(async (tx) => {
      const { registerReturn } = await engine();
      await register(tx, entry([line(SERIAL, { quantity: '1', unitCost: '800', serialNumbers: ['Q-1'] })]));
      const unit = await tx.material_units.findFirstOrThrow({ where: { serial_number: 'Q-1' } });
      const out = await register(tx, exitToCustomer([line(SERIAL, { unitIds: [unit.id] })]));
      const ret = await registerReturn(tx, COMPANY, PROFILE, { exitMovementId: out.id, unitIds: [unit.id], warehouseId: W1, occurredOn: new Date(), notes: null });
      const exitAfterReturn = await stockErrorOf(() => reverse(tx, out.id));
      const reversal = await reverse(tx, ret.id);
      const reopened = await tx.material_units.findUniqueOrThrow({ where: { id: unit.id } });
      const reversalRow = await tx.stock_movements.findUniqueOrThrow({ where: { id: reversal.id } });
      // El prestamo reabierto se puede volver a devolver.
      await registerReturn(tx, COMPANY, PROFILE, { exitMovementId: out.id, unitIds: [unit.id], warehouseId: W1, occurredOn: new Date(), notes: null });
      const final = await tx.material_units.findUniqueOrThrow({ where: { id: unit.id } });
      return {
        exitAfterReturn: exitAfterReturn.code,
        reopened: `${reopened.status}:${reopened.warehouse_id}`,
        reversalPointsToExit: reversalRow.type === 'RETURN' && reversalRow.returned_from_movement_id === out.id,
        final: final.status,
        consistent: await balancesMatchLedger(tx),
        kardexMatchesEngine: await kardexMatchesEngine(tx, SERIAL),
      };
    });
    expect(result).toEqual({
      exitAfterReturn: 'UNIT_NOT_AVAILABLE',
      reopened: 'OUT:null',
      reversalPointsToExit: true,
      final: 'IN_STOCK',
      consistent: true,
      kardexMatchesEngine: true,
    });
  });

  it('prestamos: dar de baja una unidad prestada no toca el stock y no se repite', async () => {
    const result = await inRollback(async (tx) => {
      const { writeOffLoanedUnit } = await engine();
      await register(tx, entry([line(SERIAL, { quantity: '1', unitCost: '500', serialNumbers: ['W-1'] })]));
      const unit = await tx.material_units.findFirstOrThrow({ where: { serial_number: 'W-1' } });
      const out = await register(tx, exitToCustomer([line(SERIAL, { unitIds: [unit.id] })]));
      const averageBefore = await averageCost(tx, SERIAL);
      const noNotes = await stockErrorOf(() => writeOffLoanedUnit(tx, COMPANY, PROFILE, { unitId: unit.id, reason: 'LOST', notes: ' ' }));
      const written = await writeOffLoanedUnit(tx, COMPANY, PROFILE, { unitId: unit.id, reason: 'LOST', notes: 'extraviada en locacion' });
      const again = await stockErrorOf(() => writeOffLoanedUnit(tx, COMPANY, PROFILE, { unitId: unit.id, reason: 'BROKEN', notes: 'x' }));
      const exitReversal = await stockErrorOf(() => reverse(tx, out.id));
      const after = await tx.material_units.findUniqueOrThrow({ where: { id: unit.id } });
      return {
        noNotes: noNotes.code,
        closesTheExit: written.loanMovementId === out.id,
        again: again.code,
        exitReversal: exitReversal.code,
        status: after.status,
        balance: await balance(tx, SERIAL, W1),
        sameAverage: (await averageCost(tx, SERIAL)) === averageBefore,
        consistent: await balancesMatchLedger(tx),
      };
    });
    expect(result).toEqual({
      noNotes: 'INVALID_INPUT',
      closesTheExit: true,
      again: 'NOT_ON_LOAN',
      exitReversal: 'UNIT_NOT_AVAILABLE',
      status: 'DISCARDED',
      balance: '0',
      sameAverage: true,
      consistent: true,
    });
  });

  it('lotes vencidos: no salen ni se transfieren; el ajuste negativo los da de baja', async () => {
    const result = await inRollback(async (tx) => {
      const yesterday = new Date(Date.now() - 2 * 86_400_000);
      await register(tx, entry([line(BATCH, { quantity: '5', unitCost: '10', batchNumber: 'VENCIDO', batchExpiresOn: yesterday })]));
      const batch = await tx.material_batches.findFirstOrThrow({ where: { batch_number: 'VENCIDO' } });
      const exit = await stockErrorOf(() => register(tx, exitToCustomer([line(BATCH, { quantity: '1', batchId: batch.id })])));
      const transfer = await stockErrorOf(() =>
        register(tx, movement({ type: 'TRANSFER', targetWarehouseId: W2, lines: [line(BATCH, { quantity: '1', batchId: batch.id })] }))
      );
      await register(
        tx,
        movement({ type: 'ADJUSTMENT', notes: 'descarte por vencimiento', lines: [line(BATCH, { quantity: '5', adjustmentDirection: 'OUT', batchId: batch.id })] })
      );
      return { exit: exit.code, transfer: transfer.code, balance: await balance(tx, BATCH, W1, batch.id) };
    });
    expect(result).toEqual({ exit: 'EXPIRED_BATCH', transfer: 'EXPIRED_BATCH', balance: '0' });
  });

  it('valida empresa, depositos, destino y tipo de control', async () => {
    const result = await inRollback(async (tx) => ({
      foreignMaterial: (await stockErrorOf(() => register(tx, entry([line(FOREIGN, { unitCost: '1' })])))).code,
      inactiveWarehouse: (await stockErrorOf(() => register(tx, entry([line(QTY, { unitCost: '1' })], W_INACTIVE)))).code,
      noCost: (await stockErrorOf(() => register(tx, entry([line(QTY)])))).code,
      batchOnQuantity: (await stockErrorOf(() => register(tx, entry([line(QTY, { unitCost: '1', batchNumber: 'X' })])))).code,
      serialCountMismatch: (
        await stockErrorOf(() => register(tx, entry([line(SERIAL, { quantity: '2', unitCost: '1', serialNumbers: ['A'] })])))
      ).code,
      foreignCustomer: (
        await stockErrorOf(() =>
          (async () => {
            const { registerStockMovement } = await engine();
            return registerStockMovement(tx, OTHER_COMPANY, PROFILE, {
              ...exitToCustomer([line(FOREIGN)]),
              warehouseId: W1,
            });
          })()
        )
      ).code,
      sameWarehouse: (
        await stockErrorOf(() => register(tx, movement({ type: 'TRANSFER', targetWarehouseId: W1, lines: [line(QTY)] })))
      ).code,
    }));
    expect(result).toEqual({
      foreignMaterial: 'NOT_FOUND',
      inactiveWarehouse: 'INACTIVE_WAREHOUSE',
      noCost: 'INVALID_INPUT',
      batchOnQuantity: 'INVALID_TRACKING',
      serialCountMismatch: 'INVALID_TRACKING',
      // El deposito W1 es de otra empresa: se corta antes de mirar el cliente.
      foreignCustomer: 'NOT_FOUND',
      sameWarehouse: 'INVALID_INPUT',
    });
  });

  it('pedidos: entrega parcial y total, al costo promedio y al destino del pedido', async () => {
    const result = await inRollback(async (tx) => {
      await register(tx, entry([line(QTY, { quantity: '10', unitCost: '100' }), line(BATCH, { quantity: '5', unitCost: '20', batchNumber: 'L-1' })]));
      const batch = await tx.material_batches.findFirstOrThrow({ where: { material_id: BATCH, batch_number: 'L-1' } });
      const request = await approvedRequest(tx, [
        { materialId: QTY, quantity: '8' },
        { materialId: BATCH, quantity: '2' },
      ]);
      const [qtyLine, batchLine] = request.lines;

      const first = await deliver(tx, request.id, [deliveryLine(qtyLine!.id, '3')]);
      const afterFirst = await requestStatus(tx, request.id);
      const exit = await tx.stock_movements.findUniqueOrThrow({ where: { id: first.id }, include: { lines: true } });

      await deliver(tx, request.id, [
        deliveryLine(qtyLine!.id, '5'),
        deliveryLine(batchLine!.id, '2', { batchId: batch.id }),
      ]);
      return {
        afterFirst,
        afterSecond: await requestStatus(tx, request.id),
        exit,
        balance: await balance(tx, QTY, W1),
        batchBalance: await balance(tx, BATCH, W1, batch.id),
        consistent: await balancesMatchLedger(tx),
        kardex: await kardexMatchesEngine(tx, QTY),
        requestId: request.id,
        qtyLineId: qtyLine!.id,
      };
    });

    expect(result.afterFirst).toBe('PARTIALLY_DELIVERED');
    expect(result.afterSecond).toBe('DELIVERED');
    expect(result.exit.type).toBe('EXIT');
    expect(result.exit.material_request_id).toBe(result.requestId);
    expect(result.exit.destination_type).toBe('CUSTOMER');
    expect(result.exit.customer_id).toBe(CUSTOMER);
    expect(result.exit.reference).toBe('PED-000001');
    expect(result.exit.lines[0]!.request_line_id).toBe(result.qtyLineId);
    expect(result.exit.lines[0]!.unit_cost.toFixed(4)).toBe('100.0000');
    expect(result.balance).toBe('2');
    expect(result.batchBalance).toBe('3');
    expect(result.consistent).toBe(true);
    expect(result.kardex).toBe(true);
  });

  it('pedidos: rechaza sobreentregas y pedidos no aprobados', async () => {
    const result = await inRollback(async (tx) => {
      await register(tx, entry([line(QTY, { quantity: '50', unitCost: '1' })]));
      const request = await approvedRequest(tx, [{ materialId: QTY, quantity: '20' }]);
      const requestLine = request.lines[0]!;
      const over = await stockErrorOf(() => deliver(tx, request.id, [deliveryLine(requestLine.id, '30')]));
      // La misma linea dos veces suma: 15 + 10 supera los 20 pedidos.
      const split = await stockErrorOf(() =>
        deliver(tx, request.id, [deliveryLine(requestLine.id, '15'), deliveryLine(requestLine.id, '10')])
      );
      const pending = await approvedRequest(tx, [{ materialId: QTY, quantity: '1' }], 'PED-000002');
      await tx.material_requests.update({ where: { id: pending.id }, data: { status: 'PENDING_APPROVAL' } });
      const notApproved = await stockErrorOf(() => deliver(tx, pending.id, [deliveryLine(pending.lines[0]!.id, '1')]));
      const foreignLine = await stockErrorOf(() => deliver(tx, request.id, [deliveryLine(pending.lines[0]!.id, '1')]));
      return { over, split, notApproved, foreignLine };
    });

    expect(result.over).toEqual({
      code: 'OVER_DELIVERY',
      message: 'De Aceite 15W40 quedan 20 l por entregar: no se pueden entregar 30 l',
    });
    expect(result.split.code).toBe('OVER_DELIVERY');
    expect(result.notApproved.code).toBe('INVALID_STATE');
    expect(result.foreignLine.code).toBe('INVALID_INPUT');
  });

  it('pedidos: anular una entrega devuelve lo pendiente; un pedido cerrado sigue cerrado', async () => {
    const result = await inRollback(async (tx) => {
      await register(tx, entry([line(QTY, { quantity: '20', unitCost: '10' })]));
      const request = await approvedRequest(tx, [{ materialId: QTY, quantity: '10' }]);
      const requestLine = request.lines[0]!;
      const first = await deliver(tx, request.id, [deliveryLine(requestLine.id, '4')]);
      const second = await deliver(tx, request.id, [deliveryLine(requestLine.id, '6')]);
      const delivered = await requestStatus(tx, request.id);

      const reversal = await reverse(tx, second.id);
      const afterReversal = await requestStatus(tx, request.id);
      const reversalRow = await tx.stock_movements.findUniqueOrThrow({ where: { id: reversal.id }, include: { lines: true } });
      // Lo anulado vuelve a estar pendiente: se puede entregar de nuevo.
      await deliver(tx, request.id, [deliveryLine(requestLine.id, '6')]);
      const redelivered = await requestStatus(tx, request.id);

      await tx.material_requests.update({ where: { id: request.id }, data: { status: 'CLOSED' } });
      await reverse(tx, first.id);
      return {
        delivered,
        afterReversal,
        reversalRow,
        redelivered,
        closed: await requestStatus(tx, request.id),
        balance: await balance(tx, QTY, W1),
        kardex: await kardexMatchesEngine(tx, QTY),
        requestId: request.id,
        lineId: requestLine.id,
      };
    });

    expect(result.delivered).toBe('DELIVERED');
    expect(result.afterReversal).toBe('PARTIALLY_DELIVERED');
    expect(result.reversalRow.material_request_id).toBe(result.requestId);
    expect(result.reversalRow.lines[0]!.request_line_id).toBe(result.lineId);
    expect(result.reversalRow.lines[0]!.direction).toBe(1);
    expect(result.redelivered).toBe('DELIVERED');
    expect(result.closed).toBe('CLOSED');
    // 20 − 4 − 6 + 6 − 6 + 4 = 14
    expect(result.balance).toBe('14');
    expect(result.kardex).toBe(true);
  });

  it('pedidos: entrega de serializados por unidad', async () => {
    const result = await inRollback(async (tx) => {
      await register(tx, entry([line(SERIAL, { quantity: '2', unitCost: '500', serialNumbers: ['T-1', 'T-2'] })]));
      const units = await tx.material_units.findMany({ where: { material_id: SERIAL }, orderBy: { serial_number: 'asc' } });
      const request = await approvedRequest(tx, [{ materialId: SERIAL, quantity: '1' }]);
      const over = await stockErrorOf(() =>
        deliver(tx, request.id, [deliveryLine(request.lines[0]!.id, '2', { unitIds: units.map((u) => u.id) })])
      );
      await deliver(tx, request.id, [deliveryLine(request.lines[0]!.id, '1', { unitIds: [units[0]!.id] })]);
      const unit = await tx.material_units.findUniqueOrThrow({ where: { id: units[0]!.id } });
      return { over: over.code, status: await requestStatus(tx, request.id), unitStatus: unit.status };
    });

    expect(result.over).toBe('OVER_DELIVERY');
    expect(result.status).toBe('DELIVERED');
    expect(result.unitStatus).toBe('OUT');
  });

  it('concurrencia: dos salidas simultaneas por el ultimo stock, exactamente una pasa', async () => {
    const prisma = await db();
    const { registerStockMovement } = await engine();
    await prisma.$transaction((tx) =>
      registerStockMovement(tx, COMPANY, PROFILE, entry([line(QTY, { quantity: '1', unitCost: '10' })]))
    );

    const attempt = () =>
      prisma.$transaction((tx) => registerStockMovement(tx, COMPANY, PROFILE, exitToCustomer([line(QTY, { quantity: '1' })])), {
        timeout: 20_000,
      });
    const results = await Promise.allSettled([attempt(), attempt()]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0]!.reason as { code?: string }).code).toBe('INSUFFICIENT_STOCK');

    const final = await prisma.stock_balances.findFirstOrThrow({ where: { material_id: QTY, warehouse_id: W1 } });
    expect(final.quantity.toString()).toBe('0');
    const numbers = await prisma.stock_movements.findMany({ where: { company_id: COMPANY }, select: { number: true } });
    expect(new Set(numbers.map((n) => n.number)).size).toBe(numbers.length);
  }, 30_000);

  it('concurrencia: dos entregas simultaneas de lo ultimo pendiente, exactamente una pasa', async () => {
    const prisma = await db();
    const { registerStockMovement, registerRequestDelivery } = await engine();
    await prisma.$transaction((tx) =>
      registerStockMovement(tx, COMPANY, PROFILE, entry([line(QTY, { quantity: '10', unitCost: '10' })]))
    );
    const request = await approvedRequest(prisma, [{ materialId: QTY, quantity: '5' }], 'PED-000900');

    const attempt = () =>
      prisma.$transaction(
        (tx) =>
          registerRequestDelivery(tx, COMPANY, PROFILE, {
            requestId: request.id,
            warehouseId: W1,
            occurredOn: new Date(),
            notes: null,
            lines: [deliveryLine(request.lines[0]!.id, '5')],
          }),
        { timeout: 20_000 }
      );
    const results = await Promise.allSettled([attempt(), attempt()]);

    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // El lock del pedido serializa: la segunda lo encuentra ya entregado por completo.
    expect(rejected[0]!.reason).toMatchObject({ code: 'INVALID_STATE', message: 'PED-000900 ya fue entregado por completo' });
    expect(await requestStatus(prisma, request.id)).toBe('DELIVERED');
    const deliveries = await prisma.stock_movements.count({ where: { material_request_id: request.id } });
    expect(deliveries).toBe(1);
  }, 30_000);
});
