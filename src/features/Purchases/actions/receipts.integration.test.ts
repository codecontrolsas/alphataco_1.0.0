import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Recepciones (Compras etapa 3) contra el Postgres del compose: `npm run test:purchases`. Se simulan
 * la sesion, la empresa activa, los permisos y los mails; el motor de stock, Gomeria (alta de
 * cubiertas), los locks y los CHECK son reales.
 */

const COMPANY = 'd5000000-0000-4000-8000-000000000001';
const OTHER_COMPANY = 'd5000000-0000-4000-8000-000000000002';
const BUYER = 'd5000000-0000-4000-8000-000000000003';
const UNIT = 'd5000000-0000-4000-8000-000000000010';
const OIL = 'd5000000-0000-4000-8000-000000000020';
const FILTER_BATCH = 'd5000000-0000-4000-8000-000000000021';
const TOOL_SERIAL = 'd5000000-0000-4000-8000-000000000022';
const TIRE_MATERIAL = 'd5000000-0000-4000-8000-000000000023';
const SUPPLIER = 'd5000000-0000-4000-8000-000000000030';
const WAREHOUSE = 'd5000000-0000-4000-8000-000000000040';
const INACTIVE_WAREHOUSE = 'd5000000-0000-4000-8000-000000000041';
const FOREIGN_WAREHOUSE = 'd5000000-0000-4000-8000-000000000042';
const TIRE_TYPE = 'd5000000-0000-4000-8000-000000000050';
const TIRE_BRAND = 'd5000000-0000-4000-8000-000000000051';

const state = vi.hoisted(() => ({ denied: new Set<string>() }));
const mails = vi.hoisted(() => ({ any: vi.fn(async () => true) }));

vi.mock('@/shared/lib/tenant', () => ({ getActiveCompanyId: async () => 'd5000000-0000-4000-8000-000000000001' }));
vi.mock('@/features/Permissions', () => ({
  checkPermissionServer: async (module: string, tab: string, action: string) => !state.denied.has(`${module}:${tab}:${action}`),
}));
vi.mock('@/shared/actions/auth.actions', () => {
  const current = () => ({
    id: 'd5000000-0000-4000-8000-000000000003',
    credentialId: 'd5000000-0000-4000-8000-000000000003',
    fullname: null,
    email: null,
  });
  return { getServerAuthProfile: async () => current(), requireServerAuthProfile: async () => current() };
});
vi.mock('@/shared/lib/mail/templates/purchases', () => ({
  sendPurchaseRequestDecisionEmail: mails.any,
  sendPurchaseOrderDecisionEmail: mails.any,
  sendSupplierDocumentEmail: mails.any,
}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

const RUN = Boolean(process.env.DATABASE_URL);

async function db() {
  return (await import('@/shared/lib/prisma')).prisma;
}

async function cleanup() {
  const prisma = await db();
  const company_id = { in: [COMPANY, OTHER_COMPANY] };
  await prisma.purchase_orders.updateMany({ where: { company_id }, data: { complements_order_id: null, complements_receipt_id: null } });
  await prisma.purchase_receipts.deleteMany({ where: { company_id } });
  await prisma.purchase_orders.deleteMany({ where: { company_id } });
  await prisma.purchase_quotes.deleteMany({ where: { company_id } });
  await prisma.purchase_requests.deleteMany({ where: { company_id } });
  await prisma.tires.deleteMany({ where: { company_id } });
  await prisma.material_units.updateMany({ where: { company_id }, data: { last_movement_id: null } });
  await prisma.stock_movement_lines.deleteMany({ where: { movement: { company_id } } });
  await prisma.material_units.deleteMany({ where: { company_id } });
  await prisma.stock_balances.deleteMany({ where: { company_id } });
  await prisma.stock_movements.deleteMany({ where: { company_id } });
  await prisma.material_batches.deleteMany({ where: { company_id } });
  await prisma.tire_materials.deleteMany({ where: { company_id } });
  await prisma.materials.deleteMany({ where: { company_id } });
  await prisma.tire_types.deleteMany({ where: { company_id } });
  await prisma.tire_brands.deleteMany({ where: { company_id } });
  await prisma.warehouses.deleteMany({ where: { company_id } });
  await prisma.suppliers.deleteMany({ where: { company_id } });
  await prisma.measurement_units.deleteMany({ where: { company_id } });
  await prisma.profile.deleteMany({ where: { id: BUYER } });
  await prisma.company.deleteMany({ where: { id: company_id } });
}

let counter = 0;

type LinePlan = { material?: string; description?: string; quantity: number; price?: string };

/** Solicitud aprobada + OC enviada con esas lineas. Devuelve la OC y sus lineas en orden. */
async function sentOrder(plans: LinePlan[]) {
  const prisma = await db();
  const orders = { ...(await import('./orders.server')), ...(await import('./order-queries.server')) };
  counter += 1;
  const request = await prisma.purchase_requests.create({
    data: {
      company_id: COMPANY,
      number: `SC-R${String(counter).padStart(4, '0')}`,
      status: 'APPROVED',
      requested_by: BUYER,
      decided_by: BUYER,
      decided_at: new Date(),
      lines: {
        create: plans.map((p, i) =>
          p.material
            ? { position: i + 1, material_id: p.material, quantity: p.quantity, unit_id: UNIT }
            : { position: i + 1, description: p.description ?? 'Servicio', quantity: p.quantity, unit_id: UNIT }
        ),
      },
    },
    select: { id: true, lines: { select: { id: true }, orderBy: { position: 'asc' } } },
  });
  const created = await orders.createPurchaseOrder(
    {
      supplierId: SUPPLIER,
      deliveryDate: '',
      deliveryPlace: '',
      paymentTermDays: '',
      notes: '',
      lines: plans.map((p, i) => ({
        requestLineId: request.lines[i]!.id,
        quoteLineId: '',
        quantity: String(p.quantity),
        unitPrice: p.price ?? '100',
        vatRateId: 5,
      })),
    },
    { submit: true }
  );
  if (!created.ok) throw new Error(created.error);
  for (const step of [orders.approvePurchaseOrder, orders.markPurchaseOrderSent]) {
    const result = await step(created.data.id);
    if (!result.ok) throw new Error(result.error);
  }
  const lines = await prisma.purchase_order_lines.findMany({
    where: { order_id: created.data.id },
    orderBy: { position: 'asc' },
    select: { id: true },
  });
  return { id: created.data.id, number: created.data.number, requestId: request.id, lineIds: lines.map((l) => l.id) };
}

type ReceiptLine = { orderLineId: string; quantity: string; batchNumber?: string; batchExpiresOn?: string; serialNumbers?: string };

const receiptForm = (orderId: string, lines: ReceiptLine[], overrides: Record<string, unknown> = {}) => ({
  orderId,
  warehouseId: WAREHOUSE,
  receivedOn: '2026-10-09',
  deliveryNote: 'R-0001-00001234',
  notes: '',
  lines: lines.map((l) => ({ batchNumber: '', batchExpiresOn: '', serialNumbers: '', ...l })),
  ...overrides,
});

function expectOk<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(`Se esperaba ok y vino: ${result.error}`);
  return result.data;
}

function expectFail(result: { ok: true } | { ok: false; error: string }): string {
  if (result.ok) throw new Error('Se esperaba un error');
  return result.error;
}

async function orderStatus(id: string) {
  const prisma = await db();
  return (await prisma.purchase_orders.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
}

async function balance(materialId: string) {
  const prisma = await db();
  const agg = await prisma.stock_balances.aggregate({ where: { company_id: COMPANY, material_id: materialId }, _sum: { quantity: true } });
  return agg._sum.quantity?.toNumber() ?? 0;
}

describe.skipIf(!RUN)('recepciones (integracion)', () => {
  beforeAll(async () => {
    await cleanup();
    const prisma = await db();
    const city = await prisma.cities.findFirstOrThrow({ select: { id: true } });
    for (const [id, cuit] of [
      [COMPANY, '30999999960'],
      [OTHER_COMPANY, '30999999961'],
    ] as const) {
      await prisma.company.create({
        data: {
          id,
          company_name: `Recepciones test ${cuit}`,
          description: 'empresa de prueba',
          contact_email: 'recepciones-test@alphataco.local',
          contact_phone: '+542991234567',
          address: 'Calle 123',
          city: city.id,
          country: 'argentina',
          industry: 'Petroleo',
          company_cuit: cuit,
        },
      });
    }
    await prisma.profile.create({ data: { id: BUYER, credential_id: BUYER, email: 'recepciones@alphataco.local' } });
    await prisma.measurement_units.create({ data: { id: UNIT, company_id: COMPANY, name: 'Unidad rc', abbreviation: 'u' } });
    await prisma.materials.createMany({
      data: [
        { id: OIL, company_id: COMPANY, code: 'AC-1', name: 'Aceite', unit_id: UNIT },
        { id: FILTER_BATCH, company_id: COMPANY, code: 'FI-1', name: 'Filtro', unit_id: UNIT, tracking_type: 'BATCH' },
        { id: TOOL_SERIAL, company_id: COMPANY, code: 'HE-1', name: 'Amoladora', unit_id: UNIT, tracking_type: 'SERIAL' },
        { id: TIRE_MATERIAL, company_id: COMPANY, code: 'CUB-1', name: 'Cubierta 295', unit_id: UNIT, tracking_type: 'SERIAL' },
      ],
    });
    await prisma.tire_types.create({ data: { id: TIRE_TYPE, company_id: COMPANY, name: '295 mixta', size: '295/80R22.5', tread_type: 'MIXED' } });
    await prisma.tire_brands.create({ data: { id: TIRE_BRAND, company_id: COMPANY, name: 'Marca rc' } });
    await prisma.tire_materials.create({
      data: { company_id: COMPANY, tire_type_id: TIRE_TYPE, tire_brand_id: TIRE_BRAND, material_id: TIRE_MATERIAL },
    });
    await prisma.suppliers.create({
      data: { id: SUPPLIER, company_id: COMPANY, name: 'Proveedor rc', cuit: BigInt('20123456786'), vat_condition_id: 1, payment_term_days: 30 },
    });
    await prisma.warehouses.createMany({
      data: [
        { id: WAREHOUSE, company_id: COMPANY, code: 'B', name: 'Base' },
        { id: INACTIVE_WAREHOUSE, company_id: COMPANY, code: 'V', name: 'Vieja', is_active: false },
        { id: FOREIGN_WAREHOUSE, company_id: OTHER_COMPANY, code: 'X', name: 'Ajena' },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    await cleanup();
  }, 60_000);

  beforeEach(() => {
    state.denied.clear();
  });

  it('recepcion parcial y total: OC, stock y costo', async () => {
    const actions = await import('./receipts.server');
    const order = await sentOrder([{ material: OIL, quantity: 10, price: '250' }]);
    const before = await balance(OIL);

    const first = expectOk(await actions.createPurchaseReceipt(receiptForm(order.id, [{ orderLineId: order.lineIds[0]!, quantity: '4' }])));
    expect(first.number).toMatch(/^RC-\d{6}$/);
    expect(first.movementNumber).toMatch(/^MOV-/);
    expect(first.complementNumber).toBeNull();
    expect(await orderStatus(order.id)).toBe('PARTIALLY_RECEIVED');
    expect(await balance(OIL)).toBe(before + 4);
    const prisma = await db();
    expect((await prisma.materials.findUniqueOrThrow({ where: { id: OIL }, select: { average_cost: true } })).average_cost.toString()).toBe('250');

    expectOk(await actions.createPurchaseReceipt(receiptForm(order.id, [{ orderLineId: order.lineIds[0]!, quantity: '6' }])));
    expect(await orderStatus(order.id)).toBe('RECEIVED');
    expect(expectFail(await actions.createPurchaseReceipt(receiptForm(order.id, [{ orderLineId: order.lineIds[0]!, quantity: '1' }])))).toContain(
      'ya fue recibida'
    );
  });

  it('servicio: sin deposito y sin movimiento', async () => {
    const actions = await import('./receipts.server');
    const order = await sentOrder([{ description: 'Rectificado', quantity: 1 }]);
    const done = expectOk(
      await actions.createPurchaseReceipt(receiptForm(order.id, [{ orderLineId: order.lineIds[0]!, quantity: '1' }], { warehouseId: '' }))
    );
    expect(done.movementNumber).toBeNull();
    expect(await orderStatus(order.id)).toBe('RECEIVED');
  });

  it('lote, serializado y cubierta que aparece en Gomeria', async () => {
    const actions = await import('./receipts.server');
    const order = await sentOrder([
      { material: FILTER_BATCH, quantity: 3 },
      { material: TOOL_SERIAL, quantity: 2 },
      { material: TIRE_MATERIAL, quantity: 1 },
    ]);
    expectOk(
      await actions.createPurchaseReceipt(
        receiptForm(order.id, [
          { orderLineId: order.lineIds[0]!, quantity: '3', batchNumber: 'L-77', batchExpiresOn: '2027-12-31' },
          { orderLineId: order.lineIds[1]!, quantity: '2', serialNumbers: 'AM-1\nAM-2' },
          { orderLineId: order.lineIds[2]!, quantity: '1', serialNumbers: 'CUB-RC-1' },
        ])
      )
    );
    const prisma = await db();
    expect(await prisma.material_batches.count({ where: { material_id: FILTER_BATCH, batch_number: 'L-77' } })).toBe(1);
    expect(await prisma.material_units.count({ where: { material_id: TOOL_SERIAL, status: 'IN_STOCK' } })).toBe(2);
    expect(await prisma.tires.count({ where: { company_id: COMPANY, serial_number: 'CUB-RC-1' } })).toBe(1);
  });

  it('serie repetida: mensaje del motor y no queda nada', async () => {
    const actions = await import('./receipts.server');
    const order = await sentOrder([{ material: TOOL_SERIAL, quantity: 3 }]);
    const error = expectFail(
      await actions.createPurchaseReceipt(receiptForm(order.id, [{ orderLineId: order.lineIds[0]!, quantity: '3', serialNumbers: 'AM-1\nAM-9\nAM-10' }]))
    );
    expect(error).toContain('AM-1');
    const prisma = await db();
    expect(await prisma.purchase_receipts.count({ where: { order_id: order.id } })).toBe(0);
    expect(await prisma.purchase_orders.count({ where: { complements_order_id: order.id } })).toBe(0);
    expect(await orderStatus(order.id)).toBe('SENT');
  });

  it('excedente: OC complementaria en borrador; aprobada queda recibida; anulada marca excedente sin OC', async () => {
    const actions = await import('./receipts.server');
    const orders = { ...(await import('./orders.server')), ...(await import('./order-queries.server')) };
    const order = await sentOrder([{ material: OIL, quantity: 10, price: '100' }]);
    const done = expectOk(await actions.createPurchaseReceipt(receiptForm(order.id, [{ orderLineId: order.lineIds[0]!, quantity: '12' }])));
    expect(done.complementNumber).toMatch(/^OC-/);
    expect(await orderStatus(order.id)).toBe('RECEIVED');

    const prisma = await db();
    const complement = await prisma.purchase_orders.findFirstOrThrow({
      where: { complements_order_id: order.id },
      select: { id: true, status: true, total: true, lines: { select: { quantity: true } } },
    });
    expect(complement.status).toBe('DRAFT');
    expect(complement.lines.map((l) => l.quantity.toString())).toEqual(['2']);
    expect(complement.total.toFixed(2)).toBe('242.00');

    expectOk(await orders.submitPurchaseOrder(complement.id));
    expectOk(await orders.approvePurchaseOrder(complement.id));
    expect(await orderStatus(complement.id)).toBe('RECEIVED');

    // Otro excedente, y esta vez la complementaria se anula.
    const second = await sentOrder([{ material: OIL, quantity: 1 }]);
    const r = expectOk(await actions.createPurchaseReceipt(receiptForm(second.id, [{ orderLineId: second.lineIds[0]!, quantity: '3' }])));
    const c2 = await prisma.purchase_orders.findFirstOrThrow({ where: { complements_order_id: second.id }, select: { id: true } });
    expectOk(await orders.cancelPurchaseOrder(c2.id, 'No se compra'));
    const detail = await actions.getPurchaseReceiptDetail(r.id);
    expect(detail?.excessWithoutOrder).toBe(true);
  });

  it('concurrencia: dos recepciones simultaneas no cuentan dos veces', async () => {
    const actions = await import('./receipts.server');
    const order = await sentOrder([{ material: OIL, quantity: 10 }]);
    const results = await Promise.all([
      actions.createPurchaseReceipt(receiptForm(order.id, [{ orderLineId: order.lineIds[0]!, quantity: '6' }])),
      actions.createPurchaseReceipt(receiptForm(order.id, [{ orderLineId: order.lineIds[0]!, quantity: '6' }])),
    ]);
    const done = results.map(expectOk);
    expect(done.filter((d) => d.complementNumber).length).toBe(1);
    const prisma = await db();
    const withinOrder = await prisma.purchase_receipt_lines.aggregate({ where: { order_line_id: order.lineIds[0]! }, _sum: { quantity: true } });
    expect(withinOrder._sum.quantity?.toNumber()).toBe(10);
    const complement = await prisma.purchase_orders.findFirstOrThrow({
      where: { complements_order_id: order.id },
      select: { lines: { select: { quantity: true } } },
    });
    expect(complement.lines[0]!.quantity.toNumber()).toBe(2);
  }, 30_000);

  it('anular: vuelve el estado y el stock; falla si el stock salio o con cubiertas; arrastra la complementaria aprobada', async () => {
    const actions = await import('./receipts.server');
    const orders = { ...(await import('./orders.server')), ...(await import('./order-queries.server')) };
    const prisma = await db();

    const order = await sentOrder([{ material: OIL, quantity: 5 }]);
    const before = await balance(OIL);
    const r = expectOk(await actions.createPurchaseReceipt(receiptForm(order.id, [{ orderLineId: order.lineIds[0]!, quantity: '5' }])));
    expect(expectFail(await actions.cancelPurchaseReceipt(r.id, ''))).toBeTruthy();
    expectOk(await actions.cancelPurchaseReceipt(r.id, 'Se cargó mal'));
    expect(await orderStatus(order.id)).toBe('SENT');
    expect(await balance(OIL)).toBe(before);
    expect(expectFail(await actions.cancelPurchaseReceipt(r.id, 'otra vez'))).toContain('ya fue anulada');

    // Stock ya salido: un ajuste negativo se lleva todo el aceite.
    const out = await sentOrder([{ material: OIL, quantity: 2 }]);
    const r2 = expectOk(await actions.createPurchaseReceipt(receiptForm(out.id, [{ orderLineId: out.lineIds[0]!, quantity: '2' }])));
    const { registerStockMovement } = await import('@/features/Warehouses/lib/stock-engine');
    const { withActor } = await import('@/shared/lib/actor');
    const total = await balance(OIL);
    await withActor(BUYER, (tx) =>
      registerStockMovement(tx, COMPANY, BUYER, {
        type: 'ADJUSTMENT',
        warehouseId: WAREHOUSE,
        targetWarehouseId: null,
        occurredOn: new Date(),
        reference: null,
        notes: 'Consumo del test',
        destinationType: null,
        employeeId: null,
        vehicleId: null,
        otherEquipmentId: null,
        maintenanceOrderId: null,
        customerId: null,
        customerServiceId: null,
        lines: [
          {
            materialId: OIL,
            quantity: String(total),
            unitCost: null,
            adjustmentDirection: 'OUT',
            batchId: null,
            batchNumber: null,
            batchExpiresOn: null,
            serialNumbers: [],
            unitIds: [],
          },
        ],
      })
    );
    expect(expectFail(await actions.cancelPurchaseReceipt(r2.id, 'Se cargó mal'))).toBeTruthy();
    expect(await orderStatus(out.id)).toBe('RECEIVED');
    expect(await prisma.purchase_receipts.count({ where: { id: r2.id, cancelled_at: null } })).toBe(1);

    // Complementaria aprobada.
    const ex = await sentOrder([{ description: 'Horas de grúa', quantity: 1 }]);
    const r3 = expectOk(
      await actions.createPurchaseReceipt(receiptForm(ex.id, [{ orderLineId: ex.lineIds[0]!, quantity: '2' }], { warehouseId: '' }))
    );
    const c3 = await prisma.purchase_orders.findFirstOrThrow({ where: { complements_order_id: ex.id }, select: { id: true, number: true } });
    expectOk(await orders.submitPurchaseOrder(c3.id));
    expectOk(await orders.approvePurchaseOrder(c3.id));
    // Con la complementaria aprobada tambien se anula (revision final, I-2): se anula con ella.
    expectOk(await actions.cancelPurchaseReceipt(r3.id, 'x'));
    expect(await orderStatus(c3.id)).toBe('CANCELLED');

    // Cubiertas.
    const tires = await sentOrder([{ material: TIRE_MATERIAL, quantity: 1 }]);
    const r4 = expectOk(
      await actions.createPurchaseReceipt(receiptForm(tires.id, [{ orderLineId: tires.lineIds[0]!, quantity: '1', serialNumbers: 'CUB-RC-9' }]))
    );
    expect(expectFail(await actions.cancelPurchaseReceipt(r4.id, 'x'))).toContain('Gomería');
  }, 60_000);

  it('el movimiento de una recepcion no se anula desde Almacenes', async () => {
    const actions = await import('./receipts.server');
    const warehouse = await import('@/features/Warehouses/actions/movements.server');
    const order = await sentOrder([{ material: OIL, quantity: 1 }]);
    const r = expectOk(await actions.createPurchaseReceipt(receiptForm(order.id, [{ orderLineId: order.lineIds[0]!, quantity: '1' }])));
    const prisma = await db();
    const receipt = await prisma.purchase_receipts.findUniqueOrThrow({ where: { id: r.id }, select: { stock_movement_id: true } });
    expect(expectFail(await warehouse.reverseStockMovementAction(receipt.stock_movement_id!, 'x'))).toContain(r.number);
  });

  it('cerrar una OC recibida en parte devuelve lo no recibido; no se anula una OC con recepciones', async () => {
    const actions = await import('./receipts.server');
    const orders = { ...(await import('./orders.server')), ...(await import('./order-queries.server')) };
    const order = await sentOrder([{ material: OIL, quantity: 10 }]);
    expectOk(await actions.createPurchaseReceipt(receiptForm(order.id, [{ orderLineId: order.lineIds[0]!, quantity: '4' }])));
    expect(expectFail(await orders.cancelPurchaseOrder(order.id, 'x'))).toContain('tiene recepciones');
    expectOk(await orders.closePurchaseOrder(order.id, 'No llega el resto'));
    const prisma = await db();
    expect((await prisma.purchase_requests.findUniqueOrThrow({ where: { id: order.requestId }, select: { status: true } })).status).toBe(
      'PARTIALLY_ORDERED'
    );
    const { items } = await orders.searchOrderableRequestLines('', { requestId: order.requestId });
    expect(items.map((i) => i.remaining)).toEqual(['6.0000']);
  });

  it('perimetro y permisos', async () => {
    const actions = await import('./receipts.server');
    const order = await sentOrder([{ material: OIL, quantity: 1 }]);
    const other = await sentOrder([{ material: OIL, quantity: 1 }]);
    const line = (orderLineId: string) => [{ orderLineId, quantity: '1' }];
    expect(expectFail(await actions.createPurchaseReceipt(receiptForm(order.id, line(other.lineIds[0]!))))).toContain('no es de esta orden');
    expect(expectFail(await actions.createPurchaseReceipt(receiptForm(order.id, line(order.lineIds[0]!), { warehouseId: FOREIGN_WAREHOUSE })))).toBe(
      'El depósito no existe'
    );
    expect(expectFail(await actions.createPurchaseReceipt(receiptForm(order.id, line(order.lineIds[0]!), { warehouseId: INACTIVE_WAREHOUSE })))).toContain(
      'inactivo'
    );
    expect(expectFail(await actions.createPurchaseReceipt(receiptForm(order.id, line(order.lineIds[0]!), { warehouseId: '' })))).toContain(
      'depósito'
    );
    const prisma = await db();
    await prisma.purchase_orders.update({ where: { id: order.id }, data: { company_id: OTHER_COMPANY } });
    expect(expectFail(await actions.createPurchaseReceipt(receiptForm(order.id, line(order.lineIds[0]!))))).toBe('La orden de compra no existe');
    await prisma.purchase_orders.update({ where: { id: order.id }, data: { company_id: COMPANY } });
    state.denied.add('compras:recepciones:create');
    expect(expectFail(await actions.createPurchaseReceipt(receiptForm(order.id, line(order.lineIds[0]!))))).toBe(
      'No tenés permiso para realizar esta acción'
    );
  });

  // ── Revision final ─────────────────────────────────────────────────────────

  it('I-1: la complementaria rechazada se corrige (precio) y se reenvia; no se cambian cantidades', async () => {
    const actions = await import('./receipts.server');
    const orders = { ...(await import('./orders.server')), ...(await import('./order-queries.server')) };
    const prisma = await db();
    const order = await sentOrder([{ material: OIL, quantity: 1, price: '100' }]);
    expectOk(await actions.createPurchaseReceipt(receiptForm(order.id, [{ orderLineId: order.lineIds[0]!, quantity: '3' }])));
    const complement = await prisma.purchase_orders.findFirstOrThrow({ where: { complements_order_id: order.id }, select: { id: true } });
    expectOk(await orders.submitPurchaseOrder(complement.id));
    expectOk(await orders.rejectPurchaseOrder(complement.id, 'Revisá el precio'));
    const detail = (await orders.getPurchaseOrderDetail(complement.id))!;
    expect(detail.can.edit).toBe(true);
    const form = { ...detail.form, lines: detail.form.lines.map((l) => ({ ...l, unitPrice: '95' })) };
    expectOk(await orders.updatePurchaseOrderDraft(complement.id, form));
    const stored = await prisma.purchase_orders.findUniqueOrThrow({
      where: { id: complement.id },
      select: { total: true, lines: { select: { unit_price: true, quantity: true } } },
    });
    expect(stored.lines.map((l) => [l.quantity.toString(), l.unit_price.toString()])).toEqual([['2', '95']]);
    expect(stored.total.toFixed(2)).toBe('229.90');
    const bigger = { ...form, lines: form.lines.map((l) => ({ ...l, quantity: '5' })) };
    expect(expectFail(await orders.updatePurchaseOrderDraft(complement.id, bigger))).toContain('complementaria');
    expectOk(await orders.submitPurchaseOrder(complement.id));
    expectOk(await orders.approvePurchaseOrder(complement.id));
  });

  it('I-2: anular la recepcion anula tambien la complementaria ya aprobada', async () => {
    const actions = await import('./receipts.server');
    const orders = { ...(await import('./orders.server')), ...(await import('./order-queries.server')) };
    const prisma = await db();
    const order = await sentOrder([{ description: 'Horas de grúa', quantity: 1 }]);
    const r = expectOk(
      await actions.createPurchaseReceipt(receiptForm(order.id, [{ orderLineId: order.lineIds[0]!, quantity: '2' }], { warehouseId: '' }))
    );
    const complement = await prisma.purchase_orders.findFirstOrThrow({ where: { complements_order_id: order.id }, select: { id: true } });
    expectOk(await orders.submitPurchaseOrder(complement.id));
    expectOk(await orders.approvePurchaseOrder(complement.id));
    expectOk(await actions.cancelPurchaseReceipt(r.id, 'Se cargó mal'));
    expect(await orderStatus(complement.id)).toBe('CANCELLED');
    expect(await orderStatus(order.id)).toBe('SENT');
  });

  it('I-3: anular la recepcion y enviar su complementaria a la vez no se bloquean ni pisan estados', async () => {
    const actions = await import('./receipts.server');
    const orders = { ...(await import('./orders.server')), ...(await import('./order-queries.server')) };
    const prisma = await db();
    for (let round = 0; round < 15; round++) {
      const order = await sentOrder([{ material: OIL, quantity: 1 }]);
      const r = expectOk(await actions.createPurchaseReceipt(receiptForm(order.id, [{ orderLineId: order.lineIds[0]!, quantity: '2' }])));
      const complement = await prisma.purchase_orders.findFirstOrThrow({ where: { complements_order_id: order.id }, select: { id: true } });
      const [cancel, submit] = await Promise.all([
        actions.cancelPurchaseReceipt(r.id, 'Se cargó mal'),
        orders.submitPurchaseOrder(complement.id),
      ]);
      expect(cancel.ok).toBe(true);
      if (!submit.ok) expect(submit.error).toContain('ya fue');
      expect(await orderStatus(complement.id)).toBe('CANCELLED');
    }
  }, 180_000);
});
