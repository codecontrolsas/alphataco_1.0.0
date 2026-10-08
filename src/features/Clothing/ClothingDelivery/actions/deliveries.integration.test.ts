import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Entregas de ropa que descuentan stock y su anulacion (Almacenes etapa 5), contra el Postgres
 * del compose: `npm run test:warehouses`.
 *
 * Corre el perimetro real del panel `/clothing` (operario = empleado vinculado a la sesion); se
 * simulan la sesion, la empresa activa y los permisos del dashboard (para anular).
 */

const COMPANY = 'c7000000-0000-4000-8000-000000000001';
const OTHER_COMPANY = 'c7000000-0000-4000-8000-000000000002';
const PROFILE = 'c7000000-0000-4000-8000-000000000003';
const OPERATOR = 'c7000000-0000-4000-8000-000000000004';
const RECEIVER = 'c7000000-0000-4000-8000-000000000005';
const WAREHOUSE = 'c7000000-0000-4000-8000-000000000010';
const FOREIGN_WAREHOUSE = 'c7000000-0000-4000-8000-000000000011';
const ITEM = 'c7000000-0000-4000-8000-000000000020';
const BRAND = 'c7000000-0000-4000-8000-000000000021';
const SIZE = 'c7000000-0000-4000-8000-000000000022';

vi.mock('@/shared/lib/session', () => ({
  getSessionUserId: async () => PROFILE,
  isSessionAnonymous: async () => false,
}));
vi.mock('@/shared/lib/tenant', () => ({ getActiveCompanyId: async () => COMPANY }));
vi.mock('@/features/Permissions', () => ({ checkPermissionServer: async () => true }));
vi.mock('@/shared/actions/auth.actions', () => ({
  getServerAuthProfile: async () => ({ id: PROFILE, credentialId: PROFILE, fullname: null, email: null }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

const RUN = Boolean(process.env.DATABASE_URL);

async function db() {
  return (await import('@/shared/lib/prisma')).prisma;
}

async function cleanup() {
  const prisma = await db();
  const company_id = { in: [COMPANY, OTHER_COMPANY] };
  await prisma.clothing_delivery_items.deleteMany({ where: { clothing_deliveries: { company_id } } });
  await prisma.clothing_deliveries.deleteMany({ where: { company_id } });
  await prisma.stock_movement_lines.deleteMany({ where: { movement: { company_id } } });
  await prisma.stock_balances.deleteMany({ where: { company_id } });
  await prisma.stock_movements.updateMany({ where: { company_id }, data: { reverses_movement_id: null } });
  await prisma.stock_movements.deleteMany({ where: { company_id } });
  await prisma.clothing_item_materials.deleteMany({ where: { company_id } });
  await prisma.materials.deleteMany({ where: { company_id } });
  await prisma.clothing_item_brand_sizes.deleteMany({ where: { clothing_items: { company_id } } });
  await prisma.clothing_items.deleteMany({ where: { company_id } });
  await prisma.clothing_brands.deleteMany({ where: { company_id } });
  await prisma.clothing_sizes.deleteMany({ where: { company_id } });
  await prisma.material_categories.deleteMany({ where: { company_id } });
  await prisma.measurement_units.deleteMany({ where: { company_id } });
  await prisma.warehouses.deleteMany({ where: { company_id } });
  await prisma.profile.deleteMany({ where: { id: PROFILE } });
  await prisma.employees.deleteMany({ where: { id: { in: [OPERATOR, RECEIVER] } } });
  await prisma.company.deleteMany({ where: { id: company_id } });
}

const delivery = (overrides: Record<string, unknown> = {}) => ({
  employeeId: RECEIVER,
  warehouseId: WAREHOUSE,
  deliveryType: 'REPLACEMENT',
  deliveredAt: new Date().toISOString(),
  items: [
    { clothingItemId: ITEM, clothingBrandId: BRAND, clothingSizeId: SIZE, quantity: 2, hasCertificate: true },
    { clothingItemId: ITEM, clothingBrandId: BRAND, clothingSizeId: SIZE, quantity: 1, hasCertificate: false },
  ],
  ...overrides,
});

async function balance() {
  const prisma = await db();
  const material = await prisma.clothing_item_materials.findFirstOrThrow({ where: { company_id: COMPANY } });
  const row = await prisma.stock_balances.findFirst({ where: { material_id: material.material_id, warehouse_id: WAREHOUSE } });
  return row?.quantity.toString() ?? '0';
}

describe.skipIf(!RUN)('entregas de ropa con stock (integracion)', () => {
  let materialId = '';

  beforeAll(async () => {
    await cleanup();
    const prisma = await db();
    const [city, province, country] = await Promise.all([
      prisma.cities.findFirstOrThrow({ select: { id: true } }),
      prisma.provinces.findFirstOrThrow({ select: { id: true } }),
      prisma.countries.findFirstOrThrow({ select: { id: true } }),
    ]);
    for (const [id, cuit] of [
      [COMPANY, '30999999994'],
      [OTHER_COMPANY, '30999999995'],
    ] as const) {
      await prisma.company.create({
        data: {
          id,
          company_name: `Ropa stock test ${cuit}`,
          description: 'empresa de prueba',
          contact_email: 'ropa-stock@alphataco.local',
          contact_phone: '+542991234567',
          address: 'Calle 123',
          city: city.id,
          country: 'argentina',
          industry: 'Petroleo',
          company_cuit: cuit,
        },
      });
    }
    const employee = (id: string, file: string, cuil: string) => ({
      id,
      company_id: COMPANY,
      firstname: 'Test',
      lastname: file,
      file,
      cuil,
      document_number: `777${cuil.slice(-5)}`,
      birthplace: country.id,
      street: 'Calle',
      street_number: '1',
      province: province.id,
      phone: '2991234567',
      date_of_admission: new Date('2020-01-01'),
    });
    await prisma.employees.createMany({
      data: [employee(OPERATOR, 'OP-1', '20777770011'), employee(RECEIVER, 'RX-1', '20777770022')],
    });
    await prisma.profile.create({
      data: { id: PROFILE, credential_id: PROFILE, email: 'ropa-stock@alphataco.local', employee_id: OPERATOR },
    });
    await prisma.warehouses.createMany({
      data: [
        { id: WAREHOUSE, company_id: COMPANY, code: 'B', name: 'Base' },
        { id: FOREIGN_WAREHOUSE, company_id: OTHER_COMPANY, code: 'X', name: 'Ajeno' },
      ],
    });
    await prisma.clothing_items.create({ data: { id: ITEM, company_id: COMPANY, name: 'Camisa', code: 'IND-001' } });
    await prisma.clothing_brands.create({ data: { id: BRAND, company_id: COMPANY, name: 'Ombú' } });
    await prisma.clothing_sizes.create({ data: { id: SIZE, company_id: COMPANY, name: '42' } });

    const { setItemBrandSizes } = await import('@/features/Clothing/actions/catalog.server');
    await setItemBrandSizes(ITEM, { add: [{ brandId: BRAND, sizeId: SIZE }], remove: [] });
    materialId = (await prisma.clothing_item_materials.findFirstOrThrow({ where: { company_id: COMPANY } })).material_id;

    const { registerStockMovement } = await import('@/features/Warehouses/lib/stock-engine');
    await prisma.$transaction((tx) =>
      registerStockMovement(tx, COMPANY, PROFILE, {
        type: 'ENTRY',
        warehouseId: WAREHOUSE,
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
        lines: [
          {
            materialId,
            quantity: '5',
            unitCost: '1000',
            adjustmentDirection: null,
            batchId: null,
            batchNumber: null,
            batchExpiresOn: null,
            serialNumbers: [],
            unitIds: [],
          },
        ],
      })
    );
  }, 30_000);

  afterAll(async () => {
    await cleanup();
  }, 30_000);

  it('una entrega descuenta del deposito, imputa al empleado y suma las filas de la misma combinacion', async () => {
    const { createClothingDelivery } = await import('./deliveries.server');
    const result = await createClothingDelivery(delivery());
    if (!result.ok) throw new Error(result.error);

    const prisma = await db();
    const created = await prisma.clothing_deliveries.findUniqueOrThrow({
      where: { id: result.data.id },
      include: { stock_movement: { include: { lines: true } }, clothing_delivery_items: true },
    });
    expect(created.warehouse_id).toBe(WAREHOUSE);
    expect(created.clothing_delivery_items).toHaveLength(2);
    expect(created.stock_movement).toMatchObject({ type: 'EXIT', destination_type: 'EMPLOYEE', employee_id: RECEIVER });
    expect(created.stock_movement!.lines).toHaveLength(1);
    expect(created.stock_movement!.lines[0]!.quantity.toString()).toBe('3');
    expect(created.stock_movement!.total_cost.toFixed(2)).toBe('3000.00');
    expect(await balance()).toBe('2');
  });

  it('sin stock no se registra ni la entrega ni la salida', async () => {
    const prisma = await db();
    const before = await prisma.clothing_deliveries.count({ where: { company_id: COMPANY } });
    const { createClothingDelivery } = await import('./deliveries.server');
    const result = await createClothingDelivery(
      delivery({ items: [{ clothingItemId: ITEM, clothingBrandId: BRAND, clothingSizeId: SIZE, quantity: 10 }] })
    );
    expect(result).toEqual({
      ok: false,
      error: 'Stock insuficiente de Camisa · Ombú · 42 en Base: hay 2 u, se pidieron 10 u',
    });
    expect(await prisma.clothing_deliveries.count({ where: { company_id: COMPANY } })).toBe(before);
    expect(await balance()).toBe('2');
  });

  it('rechaza un deposito de otra empresa y las lineas sin talle', async () => {
    const { createClothingDelivery } = await import('./deliveries.server');
    expect(await createClothingDelivery(delivery({ warehouseId: FOREIGN_WAREHOUSE }))).toEqual({
      ok: false,
      error: 'El depósito no existe, está inactivo o no es de la empresa',
    });
    expect(
      await createClothingDelivery(
        delivery({ items: [{ clothingItemId: ITEM, clothingBrandId: BRAND, clothingSizeId: null, quantity: 1 }] })
      )
    ).toEqual({ ok: false, error: 'Cada artículo tiene que tener marca y talle: el stock se lleva por combinación' });
  });

  it('anular devuelve el stock y marca la entrega; no se anula dos veces', async () => {
    const prisma = await db();
    const { createClothingDelivery } = await import('./deliveries.server');
    const { cancelClothingDeliveryAction } = await import('../../EmployeeDeliveries/actions/cancel.server');
    const created = await createClothingDelivery(
      delivery({ items: [{ clothingItemId: ITEM, clothingBrandId: BRAND, clothingSizeId: SIZE, quantity: 1 }] })
    );
    if (!created.ok) throw new Error(created.error);
    expect(await balance()).toBe('1');

    expect(await cancelClothingDeliveryAction(created.data.id, 'talle equivocado')).toEqual({ ok: true, data: null });
    expect(await balance()).toBe('2');
    const cancelled = await prisma.clothing_deliveries.findUniqueOrThrow({ where: { id: created.data.id } });
    expect(cancelled).toMatchObject({ cancelled_by: PROFILE, cancel_reason: 'talle equivocado' });

    expect(await cancelClothingDeliveryAction(created.data.id, 'otra vez')).toEqual({
      ok: false,
      error: 'La entrega ya está anulada',
    });
  });

  it('si la salida ya se anulo desde Almacenes, la entrega se marca igual', async () => {
    const prisma = await db();
    const { createClothingDelivery } = await import('./deliveries.server');
    const { cancelClothingDeliveryAction } = await import('../../EmployeeDeliveries/actions/cancel.server');
    const { reverseStockMovement } = await import('@/features/Warehouses/lib/stock-engine');
    const created = await createClothingDelivery(
      delivery({ items: [{ clothingItemId: ITEM, clothingBrandId: BRAND, clothingSizeId: SIZE, quantity: 1 }] })
    );
    if (!created.ok) throw new Error(created.error);
    const row = await prisma.clothing_deliveries.findUniqueOrThrow({ where: { id: created.data.id } });
    await prisma.$transaction((tx) => reverseStockMovement(tx, COMPANY, PROFILE, row.stock_movement_id!, 'desde almacenes'));
    expect(await balance()).toBe('2');

    expect(await cancelClothingDeliveryAction(created.data.id, 'ya devuelta')).toEqual({ ok: true, data: null });
    expect(await balance()).toBe('2');
  });

  it('una combinacion dada de baja no se entrega aunque tenga stock', async () => {
    const { toggleClothingSizeActive } = await import('@/features/Clothing/actions/catalog.server');
    const { createClothingDelivery } = await import('./deliveries.server');
    await toggleClothingSizeActive(SIZE, false);
    expect(
      await createClothingDelivery(
        delivery({ items: [{ clothingItemId: ITEM, clothingBrandId: BRAND, clothingSizeId: SIZE, quantity: 1 }] })
      )
    ).toEqual({ ok: false, error: 'Camisa · Ombú · 42 no está habilitado en el catálogo de Ropa' });
    await toggleClothingSizeActive(SIZE, true);
  });
});
