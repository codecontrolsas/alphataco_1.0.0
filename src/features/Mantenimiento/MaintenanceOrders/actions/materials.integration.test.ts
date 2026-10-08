import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Materiales de una orden de mantenimiento (Almacenes etapa 4) contra el Postgres del compose:
 * `npm run test:warehouses`. Pedido desde la orden, lo entregado neto por OT y el bloqueo del
 * cierre en la guarda de transiciones.
 */

const COMPANY = 'c5000000-0000-4000-8000-000000000001';
const PROFILE = 'c5000000-0000-4000-8000-000000000002';
const UNIT = 'c5000000-0000-4000-8000-000000000003';
const MATERIAL = 'c5000000-0000-4000-8000-000000000004';
const WAREHOUSE = 'c5000000-0000-4000-8000-000000000005';
const WORKSHOP = 'c5000000-0000-4000-8000-000000000010';
const SECTOR = 'c5000000-0000-4000-8000-000000000011';
const ORDER = 'c5000000-0000-4000-8000-000000000020';
const OTHER_ORDER = 'c5000000-0000-4000-8000-000000000021';
const WO = 'c5000000-0000-4000-8000-000000000030';
const WO_OF_OTHER_ORDER = 'c5000000-0000-4000-8000-000000000031';

let canViewPrices = true;

vi.mock('@/features/Permissions', () => ({
  checkPermissionServer: async (_module: string, _tab: string, action: string) =>
    action === 'view_prices' ? canViewPrices : true,
}));
vi.mock('@/shared/lib/tenant', () => ({ getActiveCompanyId: async () => COMPANY }));
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
  const company_id = COMPANY;
  await prisma.stock_movement_lines.deleteMany({ where: { movement: { company_id } } });
  await prisma.stock_balances.deleteMany({ where: { company_id } });
  await prisma.stock_movements.updateMany({ where: { company_id }, data: { reverses_movement_id: null } });
  await prisma.stock_movements.deleteMany({ where: { company_id } });
  await prisma.material_requests.deleteMany({ where: { company_id } });
  await prisma.maintenance_activity_log.deleteMany({ where: { company_id } });
  await prisma.maintenance_order_items.deleteMany({ where: { company_id } });
  await prisma.work_orders.deleteMany({ where: { company_id } });
  await prisma.maintenance_orders.deleteMany({ where: { company_id } });
  await prisma.workshop_sectors.deleteMany({ where: { company_id } });
  await prisma.workshops.deleteMany({ where: { company_id } });
  await prisma.materials.deleteMany({ where: { company_id } });
  await prisma.warehouses.deleteMany({ where: { company_id } });
  await prisma.measurement_units.deleteMany({ where: { company_id } });
  await prisma.profile.deleteMany({ where: { id: PROFILE } });
  await prisma.company.deleteMany({ where: { id: company_id } });
}

const requestValues = (workOrderId: string, quantity = '10') => ({
  workOrderId,
  notes: '',
  lines: [{ materialId: MATERIAL, quantity }],
});

describe.skipIf(!RUN)('materiales de la orden de mantenimiento (integracion)', () => {
  beforeAll(async () => {
    await cleanup();
    const prisma = await db();
    const city = await prisma.cities.findFirstOrThrow({ select: { id: true } });
    await prisma.company.create({
      data: {
        id: COMPANY,
        company_name: 'Orden materiales test',
        description: 'empresa de prueba',
        contact_email: 'orden-materiales@alphataco.local',
        contact_phone: '+542991234567',
        address: 'Calle 123',
        city: city.id,
        country: 'argentina',
        industry: 'Petroleo',
        company_cuit: '30999999992',
      },
    });
    await prisma.profile.create({ data: { id: PROFILE, credential_id: PROFILE, email: 'orden-materiales@alphataco.local' } });
    await prisma.measurement_units.create({ data: { id: UNIT, company_id: COMPANY, name: 'Litro', abbreviation: 'l' } });
    await prisma.warehouses.create({ data: { id: WAREHOUSE, company_id: COMPANY, code: 'B', name: 'Base' } });
    await prisma.materials.create({ data: { id: MATERIAL, company_id: COMPANY, code: 'ACE', name: 'Aceite', unit_id: UNIT } });
    await prisma.workshops.create({ data: { id: WORKSHOP, company_id: COMPANY, name: 'Taller' } });
    await prisma.workshop_sectors.create({ data: { id: SECTOR, company_id: COMPANY, workshop_id: WORKSHOP, name: 'Mecánica' } });
    await prisma.maintenance_orders.createMany({
      data: [
        { id: ORDER, company_id: COMPANY, status: 'in_workshop', order_number: 'OM-M1' },
        { id: OTHER_ORDER, company_id: COMPANY, status: 'in_workshop', order_number: 'OM-M2' },
      ],
    });
    const planned = { planned_start_date: new Date('2026-10-01'), planned_end_date: new Date('2026-10-02') };
    await prisma.work_orders.createMany({
      data: [
        { id: WO, company_id: COMPANY, workshop_id: WORKSHOP, sector_id: SECTOR, status: 'in_progress', order_number: 'OT-M1', sequence_number: 1, ...planned },
        { id: WO_OF_OTHER_ORDER, company_id: COMPANY, workshop_id: WORKSHOP, sector_id: SECTOR, status: 'in_progress', order_number: 'OT-M2', sequence_number: 2, ...planned },
      ],
    });
    await prisma.maintenance_order_items.createMany({
      data: [
        { company_id: COMPANY, maintenance_order_id: ORDER, work_order_id: WO },
        { company_id: COMPANY, maintenance_order_id: OTHER_ORDER, work_order_id: WO_OF_OTHER_ORDER },
      ],
    });
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
            materialId: MATERIAL,
            quantity: '50',
            unitCost: '100',
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

  it('desde la orden no se puede imputar una OT de otra orden', async () => {
    const { createOrderMaterialRequestAction } = await import('./materials.server');
    expect(await createOrderMaterialRequestAction(ORDER, requestValues(WO_OF_OTHER_ORDER))).toEqual({
      ok: false,
      error: 'La OT no pertenece a la orden de mantenimiento',
    });
  });

  it('lo entregado por OT descuenta las anulaciones, y el cierre se bloquea con el pedido abierto', async () => {
    const prisma = await db();
    const { createOrderMaterialRequestAction, getMaintenanceOrderMaterials } = await import('./materials.server');
    const { registerRequestDelivery, reverseStockMovement } = await import('@/features/Warehouses/lib/stock-engine');
    const { assertOrderTransition } = await import('@/features/Mantenimiento/shared/order-transition');

    const created = await createOrderMaterialRequestAction(ORDER, requestValues(WO));
    if (!created.ok) throw new Error(created.error);
    const request = await prisma.material_requests.update({
      where: { company_id_number: { company_id: COMPANY, number: created.data.number } },
      data: { status: 'APPROVED' },
      include: { lines: true },
    });
    const deliver = (quantity: string) =>
      prisma.$transaction((tx) =>
        registerRequestDelivery(tx, COMPANY, PROFILE, {
          requestId: request.id,
          warehouseId: WAREHOUSE,
          occurredOn: new Date(),
          notes: null,
          lines: [{ requestLineId: request.lines[0]!.id, quantity, batchId: null, unitIds: [] }],
        })
      );
    await deliver('5');
    const second = await deliver('3');
    await prisma.$transaction((tx) => reverseStockMovement(tx, COMPANY, PROFILE, second.id, 'cargado de más'));

    canViewPrices = true;
    const materials = await getMaintenanceOrderMaterials(ORDER);
    expect(materials?.delivered).toEqual([
      {
        workOrder: 'OT-M1 · Mecánica',
        totalCost: '500.00',
        lines: [{ materialId: MATERIAL, material: 'ACE · Aceite', unit: 'l', quantity: '5', totalCost: '500.00' }],
      },
    ]);
    canViewPrices = false;
    const hidden = await getMaintenanceOrderMaterials(ORDER);
    expect(hidden?.totalCost).toBeNull();
    expect(hidden?.delivered[0]?.lines[0]?.totalCost).toBeNull();

    // Pedido entregado en parte: la orden no se completa.
    await prisma.maintenance_orders.update({ where: { id: ORDER }, data: { status: 'pending_workshop_validation' } });
    await expect(assertOrderTransition(prisma, ORDER, 'completed')).rejects.toThrow(
      `${created.data.number} sigue abierto: entregalo, cerralo o cancelalo antes de completar la orden`
    );
    await prisma.material_requests.update({ where: { id: request.id }, data: { status: 'CLOSED' } });
    await expect(assertOrderTransition(prisma, ORDER, 'completed')).resolves.toBe('pending_workshop_validation');
  });

  it('una orden con un pedido abierto tampoco se rechaza', async () => {
    const prisma = await db();
    const { assertOrderTransition } = await import('@/features/Mantenimiento/shared/order-transition');
    await prisma.maintenance_orders.update({ where: { id: OTHER_ORDER }, data: { status: 'pending_scheduling' } });
    const open = await prisma.material_requests.create({
      data: {
        company_id: COMPANY,
        number: 'PED-REJ-1',
        requested_by: PROFILE,
        destination_type: 'MAINTENANCE_ORDER',
        maintenance_order_id: OTHER_ORDER,
        lines: { create: [{ material_id: MATERIAL, quantity: 1 }] },
      },
    });
    await expect(assertOrderTransition(prisma, OTHER_ORDER, 'rejected')).rejects.toThrow(
      'PED-REJ-1 sigue abierto: entregalo, cerralo o cancelalo antes de rechazar la orden'
    );
    await prisma.material_requests.update({ where: { id: open.id }, data: { status: 'CANCELLED' } });
    await expect(assertOrderTransition(prisma, OTHER_ORDER, 'rejected')).resolves.toBe('pending_scheduling');
  });
});
