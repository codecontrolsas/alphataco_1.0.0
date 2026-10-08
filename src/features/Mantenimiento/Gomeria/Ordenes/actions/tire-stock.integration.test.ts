import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Cubiertas en el stock (Almacenes etapa 6) contra el Postgres del compose:
 * `npm run test:warehouses`. Se ejercitan las actions reales de Gomeria (catalogo, orden,
 * diagrama) y de Almacenes (movimientos, prestamos, inventario inicial); se simulan la sesion,
 * la empresa activa y los permisos.
 */

const COMPANY = 'c8000000-0000-4000-8000-000000000001';
const PROFILE = 'c8000000-0000-4000-8000-000000000002';
const W1 = 'c8000000-0000-4000-8000-000000000010';
const W2 = 'c8000000-0000-4000-8000-000000000011';
const VEHICLE_TYPE = 'c8000000-0000-4000-8000-000000000020';
const VEHICLE = 'c8000000-0000-4000-8000-000000000021';
const TEMPLATE = 'c8000000-0000-4000-8000-000000000030';
const AXLE = 'c8000000-0000-4000-8000-000000000031';

vi.mock('@/shared/lib/session', () => ({
  getSessionUserId: async () => PROFILE,
  isSessionAnonymous: async () => false,
}));
vi.mock('@/shared/lib/tenant', () => ({ getActiveCompanyId: async () => COMPANY }));
vi.mock('@/features/Permissions', () => ({ checkPermissionServer: async () => true }));
vi.mock('@/shared/actions/auth.actions', () => {
  const profile = { id: PROFILE, credentialId: PROFILE, fullname: null, email: null };
  return { getServerAuthProfile: async () => profile, requireServerAuthProfile: async () => profile };
});
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

const RUN = Boolean(process.env.DATABASE_URL);

/** Tipo de vehiculo propio del test: la base del CI no trae catalogos. */
const VEHICLE_KIND_NAME = 'Cubiertas stock test';

async function db() {
  return (await import('@/shared/lib/prisma')).prisma;
}

async function cleanup() {
  const prisma = await db();
  const company_id = COMPANY;
  await prisma.tire_service_items.deleteMany({ where: { service_order: { company_id } } });
  await prisma.tire_service_orders.deleteMany({ where: { company_id } });
  await prisma.vehicle_tire_positions.deleteMany({ where: { vehicle_id: VEHICLE } });
  await prisma.tires.deleteMany({ where: { company_id } });
  await prisma.material_unit_write_offs.deleteMany({ where: { company_id } });
  await prisma.material_units.updateMany({ where: { company_id }, data: { last_movement_id: null } });
  await prisma.stock_movement_lines.deleteMany({ where: { movement: { company_id } } });
  await prisma.material_units.deleteMany({ where: { company_id } });
  await prisma.stock_balances.deleteMany({ where: { company_id } });
  // Un solo DELETE: las referencias entre movimientos (anulaciones, devoluciones) se borran juntas.
  await prisma.stock_movements.deleteMany({ where: { company_id } });
  await prisma.tire_materials.deleteMany({ where: { company_id } });
  await prisma.materials.deleteMany({ where: { company_id } });
  await prisma.tire_types.deleteMany({ where: { company_id } });
  await prisma.tire_brands.deleteMany({ where: { company_id } });
  await prisma.tire_template_axles.deleteMany({ where: { template_id: TEMPLATE } });
  await prisma.vehicles.deleteMany({ where: { id: VEHICLE } });
  await prisma.tire_templates.deleteMany({ where: { id: TEMPLATE } });
  await prisma.type.deleteMany({ where: { id: VEHICLE_TYPE } });
  await prisma.types_of_vehicles.deleteMany({ where: { name: VEHICLE_KIND_NAME } });
  await prisma.material_categories.deleteMany({ where: { company_id } });
  await prisma.measurement_units.deleteMany({ where: { company_id } });
  await prisma.warehouses.deleteMany({ where: { company_id } });
  await prisma.profile.deleteMany({ where: { id: PROFILE } });
  await prisma.company.deleteMany({ where: { id: company_id } });
}

async function tireBySerial(serial: string) {
  const prisma = await db();
  return prisma.tires.findFirstOrThrow({
    where: { company_id: COMPANY, serial_number: serial },
    select: {
      id: true,
      status: true,
      material_unit: { select: { id: true, status: true, warehouse_id: true, material_id: true } },
    },
  });
}

async function balance(warehouseId: string) {
  const prisma = await db();
  const rows = await prisma.stock_balances.findMany({ where: { company_id: COMPANY, warehouse_id: warehouseId } });
  return rows.reduce((acc, r) => acc + Number(r.quantity), 0);
}

async function openOrder() {
  const prisma = await db();
  return prisma.tire_service_orders.create({
    data: { vehicle_id: VEHICLE, service_date: new Date(), created_by: PROFILE, company_id: COMPANY },
    select: { id: true },
  });
}

function expectOk<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(`Se esperaba ok y vino: ${result.error}`);
  return result.data;
}

describe.skipIf(!RUN)('cubiertas en el stock (integracion)', () => {
  let typeId = '';
  let brandId = '';

  beforeAll(async () => {
    await cleanup();
    const prisma = await db();
    const city = await prisma.cities.findFirstOrThrow({ select: { id: true } });
    const vehicleKind = await prisma.types_of_vehicles.create({ data: { name: VEHICLE_KIND_NAME }, select: { id: true } });
    await prisma.company.create({
      data: {
        id: COMPANY,
        company_name: 'Cubiertas stock test',
        description: 'empresa de prueba',
        contact_email: 'cubiertas-stock@alphataco.local',
        contact_phone: '+542991234567',
        address: 'Calle 123',
        city: city.id,
        country: 'argentina',
        industry: 'Petroleo',
        company_cuit: '30999999996',
      },
    });
    await prisma.profile.create({ data: { id: PROFILE, credential_id: PROFILE, email: 'cubiertas-stock@alphataco.local' } });
    await prisma.warehouses.createMany({
      data: [
        { id: W1, company_id: COMPANY, code: 'B', name: 'Base' },
        { id: W2, company_id: COMPANY, code: 'G', name: 'Gomería' },
      ],
    });
    await prisma.type.create({ data: { id: VEHICLE_TYPE, name: 'Camión test', company_id: COMPANY } });
    await prisma.tire_templates.create({ data: { id: TEMPLATE, name: 'Plantilla test', company_id: COMPANY } });
    await prisma.tire_template_axles.create({ data: { id: AXLE, template_id: TEMPLATE, axle_number: 1, tires_per_side: 1 } });
    await prisma.vehicles.create({
      data: {
        id: VEHICLE,
        company_id: COMPANY,
        domain: 'TST123',
        type_of_vehicle: vehicleKind.id,
        type: VEHICLE_TYPE,
        engine: 'motor',
        year: '2020',
        tire_template_id: TEMPLATE,
      },
    });
    await prisma.vehicle_tire_positions.createMany({
      data: [1, 2].map((n) => ({
        vehicle_id: VEHICLE,
        template_axle_id: AXLE,
        position_number: n,
        axle_number: 1,
        side: n === 1 ? ('LEFT' as const) : ('RIGHT' as const),
      })),
    });
  }, 60_000);

  afterAll(async () => {
    await cleanup();
  }, 60_000);

  it('el alta de tipo y marca crea el material SERIAL de la combinación', async () => {
    const { createTireBrand, toggleTireBrandActive } = await import('../../Marcas/actions/actions.server');
    const { createTireType } = await import('../../Tipos/actions/actions.server');
    brandId = (await createTireBrand({ name: 'Firestone' })).id;
    typeId = (await createTireType({ name: '295 mixta', size: '295/80R22.5', tread_type: 'MIXED' })).id;

    const prisma = await db();
    const link = await prisma.tire_materials.findFirstOrThrow({
      where: { tire_type_id: typeId, tire_brand_id: brandId },
      include: { material: { include: { category: true } } },
    });
    expect(link.material).toMatchObject({
      code: 'CUB-295/80R22.5-MIX-FIR',
      name: 'Cubierta 295/80R22.5 Mixto · Firestone',
      tracking_type: 'SERIAL',
      is_active: true,
    });
    expect(link.material.category?.name).toBe('Cubiertas');

    await toggleTireBrandActive(brandId, false);
    expect((await prisma.materials.findUniqueOrThrow({ where: { id: link.material_id } })).is_active).toBe(false);
    await toggleTireBrandActive(brandId, true);
    expect((await prisma.materials.findUniqueOrThrow({ where: { id: link.material_id } })).is_active).toBe(true);
  });

  it('el alta masiva del catálogo entra al stock con su costo', async () => {
    const { createTiresBulk } = await import('../../Catalogo/actions/actions.server');
    const result = await createTiresBulk({
      prefix: 'S',
      rangeFrom: 1,
      rangeTo: 4,
      brand_id: brandId,
      tire_type_id: typeId,
      is_new: true,
      warehouseId: W1,
      unitCost: '1000',
    });
    expect(expectOk(result).count).toBe(4);
    const s1 = await tireBySerial('S1');
    expect(s1.material_unit).toMatchObject({ status: 'IN_STOCK', warehouse_id: W1 });
    expect(await balance(W1)).toBe(4);
  });

  it('montar descuenta del depósito; desmontar a disponible devuelve al depósito elegido', async () => {
    const { performReplace, closeServiceOrder } = await import('./actions.server');
    const s1 = await tireBySerial('S1');
    const s2 = await tireBySerial('S2');

    const first = await openOrder();
    expectOk(
      await performReplace({ serviceOrderId: first.id, positionNumber: 1, vehicleId: VEHICLE, tireId: null, newTireId: s1.id })
    );
    expect((await tireBySerial('S1')).material_unit?.status).toBe('OUT');
    expect(await balance(W1)).toBe(3);
    await closeServiceOrder(first.id);

    // Sin depósito y con dos depósitos activos, se rechaza sin tocar nada.
    const second = await openOrder();
    const noWarehouse = await performReplace({
      serviceOrderId: second.id,
      positionNumber: 1,
      vehicleId: VEHICLE,
      tireId: s1.id,
      newTireId: s2.id,
      oldDestination: 'AVAILABLE',
    });
    expect(noWarehouse).toEqual({ ok: false, error: 'Elegí el depósito al que vuelve la cubierta S1' });
    expect((await tireBySerial('S1')).status).toBe('INSTALLED');

    expectOk(
      await performReplace({
        serviceOrderId: second.id,
        positionNumber: 1,
        vehicleId: VEHICLE,
        tireId: s1.id,
        newTireId: s2.id,
        oldDestination: 'AVAILABLE',
        oldTireWarehouseId: W2,
      })
    );
    expect((await tireBySerial('S1')).material_unit).toMatchObject({ status: 'IN_STOCK', warehouse_id: W2 });
    expect((await tireBySerial('S2')).material_unit?.status).toBe('OUT');
    expect(await balance(W1)).toBe(2);
    expect(await balance(W2)).toBe(1);

    const prisma = await db();
    const item = await prisma.tire_service_items.findFirstOrThrow({ where: { service_order_id: second.id } });
    expect(item.mount_movement_id).not.toBeNull();
    expect(item.return_movement_id).not.toBeNull();
  });

  it('cancelar la orden anula sus movimientos, también si monta y desmonta la misma cubierta', async () => {
    const { performReplace, cancelServiceOrder } = await import('./actions.server');
    const prisma = await db();
    const second = await prisma.tire_service_orders.findFirstOrThrow({
      where: { company_id: COMPANY, status: 'OPEN' },
      select: { id: true },
    });
    const s2 = await tireBySerial('S2');
    const s3 = await tireBySerial('S3');

    // Misma orden: S3 entra en la posición 2 y después sale a disponible, reemplazada por... S1.
    const s1 = await tireBySerial('S1');
    expectOk(
      await performReplace({ serviceOrderId: second.id, positionNumber: 2, vehicleId: VEHICLE, tireId: null, newTireId: s3.id })
    );
    expectOk(
      await performReplace({
        serviceOrderId: second.id,
        positionNumber: 2,
        vehicleId: VEHICLE,
        tireId: s3.id,
        newTireId: s1.id,
        oldDestination: 'AVAILABLE',
        oldTireWarehouseId: W1,
      })
    );

    expectOk(await cancelServiceOrder(second.id));
    // Todo como antes de la orden: S1 montada en la posición 1, S2 y S3 en Base.
    expect(await tireBySerial('S1')).toMatchObject({ status: 'INSTALLED', material_unit: { status: 'OUT' } });
    expect(await tireBySerial('S2')).toMatchObject({
      status: 'AVAILABLE',
      material_unit: { status: 'IN_STOCK', warehouse_id: W1 },
    });
    expect(await tireBySerial('S3')).toMatchObject({
      status: 'AVAILABLE',
      material_unit: { status: 'IN_STOCK', warehouse_id: W1 },
    });
    expect(await balance(W1)).toBe(3);
    expect(await balance(W2)).toBe(0);
    void s2;
  });

  it('una cubierta extraviada con stock no se monta hasta que se encuentra', async () => {
    const { performMissingReport, performReplace, closeServiceOrder } = await import('./actions.server');
    const { updateTireStatus } = await import('../../Catalogo/actions/actions.server');
    const s1 = await tireBySerial('S1');

    const order = await openOrder();
    await performMissingReport({ serviceOrderId: order.id, positionNumber: 1, vehicleId: VEHICLE, tireId: s1.id });
    const mount = await performReplace({
      serviceOrderId: order.id,
      positionNumber: 1,
      vehicleId: VEHICLE,
      tireId: null,
      newTireId: s1.id,
    });
    expect(mount).toEqual({
      ok: false,
      error: 'La cubierta S1 no está en un depósito: registrá su devolución antes de montarla',
    });
    await closeServiceOrder(order.id);

    // "Marcar como encontrada": vuelve al depósito elegido.
    expectOk(await updateTireStatus(s1.id, 'AVAILABLE', W2));
    expect(await tireBySerial('S1')).toMatchObject({
      status: 'AVAILABLE',
      material_unit: { status: 'IN_STOCK', warehouse_id: W2 },
    });
  });

  it('descartar da de baja la unidad; eliminar o cambiar la serie con stock se rechaza', async () => {
    const { updateTireStatus, deleteTire, updateTire } = await import('../../Catalogo/actions/actions.server');
    const s4 = await tireBySerial('S4');

    expect(await deleteTire(s4.id)).toEqual({ ok: false, error: 'Dala de baja con un descarte; tiene stock' });
    expect(await updateTire(s4.id, { serial_number: 'S4-BIS' })).toEqual({
      ok: false,
      error: 'La cubierta tiene stock: no se cambian la serie, la marca ni el tipo',
    });

    expectOk(await updateTireStatus(s4.id, 'DISCARDED'));
    expect((await tireBySerial('S4')).material_unit?.status).toBe('DISCARDED');
    expect(await balance(W1)).toBe(2);
    expectOk(await deleteTire(s4.id));
  });

  it('Almacenes: la entrada crea cubiertas; salidas, anulaciones y devoluciones de cubiertas se rechazan', async () => {
    const { registerStockMovementAction, reverseStockMovementAction } = await import(
      '@/features/Warehouses/actions/movements.server'
    );
    const { returnLoanedUnitsAction } = await import('@/features/Warehouses/actions/loans.server');
    const prisma = await db();
    const materialId = (await tireBySerial('S2')).material_unit!.material_id;
    const line = {
      materialId,
      trackingType: 'SERIAL' as const,
      quantity: '',
      unitCost: '1500',
      adjustmentDirection: 'OUT' as const,
      batchId: '',
      batchNumber: '',
      batchExpiresOn: undefined,
      serialNumbers: 'N1',
      unitIds: [] as string[],
    };
    const base = {
      warehouseId: W1,
      targetWarehouseId: '',
      occurredOn: new Date(),
      reference: '',
      notes: '',
      destinationType: '' as const,
      employeeId: '',
      vehicleId: '',
      otherEquipmentId: '',
      maintenanceOrderId: '',
      customerId: '',
      customerServiceId: '',
    };

    const entry = expectOk(await registerStockMovementAction({ ...base, type: 'ENTRY', lines: [line] }));
    expect(await tireBySerial('N1')).toMatchObject({
      status: 'AVAILABLE',
      material_unit: { status: 'IN_STOCK', warehouse_id: W1 },
    });

    const n1Unit = (await tireBySerial('N1')).material_unit!.id;
    const exit = await registerStockMovementAction({
      ...base,
      type: 'EXIT',
      destinationType: 'VEHICLE',
      vehicleId: VEHICLE,
      lines: [{ ...line, serialNumbers: '', unitCost: '', unitIds: [n1Unit] }],
    });
    expect(exit).toEqual({ ok: false, error: 'Las cubiertas se montan y se dan de baja desde Gomería' });

    expect(await reverseStockMovementAction(entry.id, 'error de carga')).toEqual({
      ok: false,
      error: 'Los movimientos de cubiertas no se anulan desde Almacenes: se corrigen desde Gomería',
    });

    // S1 se montó en la primera orden (esa salida sigue vigente, aunque S1 ya volvió): se
    // intenta devolver como préstamo una cubierta montada.
    const { performReplace, closeServiceOrder } = await import('./actions.server');
    const order = await openOrder();
    expectOk(
      await performReplace({
        serviceOrderId: order.id,
        positionNumber: 1,
        vehicleId: VEHICLE,
        tireId: null,
        newTireId: (await tireBySerial('N1')).id,
      })
    );
    await closeServiceOrder(order.id);
    const mountExit = await prisma.material_units.findUniqueOrThrow({ where: { id: n1Unit }, select: { last_movement_id: true } });
    const loanReturn = await returnLoanedUnitsAction({
      exitMovementId: mountExit.last_movement_id!,
      unitIds: [n1Unit],
      warehouseId: W1,
      occurredOn: new Date(),
      notes: '',
    });
    expect(loanReturn).toEqual({ ok: false, error: 'Las cubiertas montadas se desmontan desde Gomería' });
  });

  it('inventario inicial: entrada de todas y salida al vehículo de las montadas y en reparación', async () => {
    const { registerInitialTireInventoryAction, getTiresWithoutStockAction } = await import(
      '@/features/Warehouses/actions/tire-inventory.server'
    );
    const prisma = await db();
    // Cubiertas anteriores a la etapa: sin unidad.
    const legacy = await Promise.all(
      [
        ['L-AV', 'AVAILABLE'],
        ['L-IN', 'INSTALLED'],
        ['L-RE', 'IN_REPAIR'],
      ].map(([serial, status]) =>
        prisma.tires.create({
          data: {
            company_id: COMPANY,
            serial_number: serial!,
            brand_id: brandId,
            tire_type_id: typeId,
            status: status as 'AVAILABLE' | 'INSTALLED' | 'IN_REPAIR',
          },
          select: { id: true },
        })
      )
    );
    await prisma.vehicle_tire_positions.updateMany({
      where: { vehicle_id: VEHICLE, position_number: 2 },
      data: { tire_id: legacy[1]!.id },
    });
    const old = await openOrder();
    await prisma.tire_service_items.create({
      data: {
        service_order_id: old.id,
        position_number: 2,
        vehicle_id: VEHICLE,
        action: 'REPAIR',
        tire_id: legacy[2]!.id,
      },
    });

    const groups = await getTiresWithoutStockAction();
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ total: 3, byStatus: { AVAILABLE: 1, INSTALLED: 1, IN_REPAIR: 1 } });

    const result = expectOk(
      await registerInitialTireInventoryAction({
        warehouseId: W2,
        costs: [{ tireTypeId: typeId, brandId, unitCost: '800,5' }],
      })
    );
    expect(result).toMatchObject({ tires: 3, keptInWarehouse: 0 });
    expect(result.exits).toHaveLength(1);
    expect((await tireBySerial('L-AV')).material_unit).toMatchObject({ status: 'IN_STOCK', warehouse_id: W2 });
    expect((await tireBySerial('L-IN')).material_unit?.status).toBe('OUT');
    expect((await tireBySerial('L-RE')).material_unit?.status).toBe('OUT');
    expect(await getTiresWithoutStockAction()).toHaveLength(0);
  });
  it('no se anula una orden si la cubierta reparada ya volvió al depósito', async () => {
    const { performRepair, cancelServiceOrder } = await import('./actions.server');
    const { updateTireStatus } = await import('../../Catalogo/actions/actions.server');
    const lIn = await tireBySerial('L-IN');
    const s2 = await tireBySerial('S2');
    const order = await openOrder();
    expectOk(
      await performRepair({ serviceOrderId: order.id, positionNumber: 2, vehicleId: VEHICLE, tireId: lIn.id, newTireId: s2.id })
    );
    // Reparada antes de cerrar la orden: vuelve al depósito.
    expectOk(await updateTireStatus(lIn.id, 'AVAILABLE', W1));

    const cancel = await cancelServiceOrder(order.id);
    expect(cancel.ok).toBe(false);
    expect(cancel.ok ? '' : cancel.error).toContain('la cubierta L-IN cambió de estado después');
    // Nada se tocó: S2 sigue montada y L-IN en el depósito.
    expect(await tireBySerial('S2')).toMatchObject({ status: 'INSTALLED', material_unit: { status: 'OUT' } });
    expect(await tireBySerial('L-IN')).toMatchObject({ status: 'AVAILABLE', material_unit: { status: 'IN_STOCK' } });
  });

  it('desde el catálogo no se monta una cubierta cambiándole el estado', async () => {
    const { updateTireStatus } = await import('../../Catalogo/actions/actions.server');
    const s3 = await tireBySerial('S3');
    expect(await updateTireStatus(s3.id, 'INSTALLED')).toEqual({
      ok: false,
      error: 'Ese cambio de estado se hace desde una orden de gomería',
    });
  });
});
