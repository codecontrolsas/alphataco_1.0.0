import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Sin `view_prices` los costos NO salen del servidor: no alcanza con ocultar la columna (spec
 * §4.1). Se prueban las lecturas reales (tablas de Stock y Movimientos, detalle de movimiento y
 * kardex) con el permiso concedido y negado, contra el Postgres del compose:
 * `npm run test:warehouses`.
 */

const COMPANY = 'c2000000-0000-4000-8000-000000000001';
const PROFILE = 'c2000000-0000-4000-8000-000000000002';
const UNIT = 'c2000000-0000-4000-8000-000000000003';
const WAREHOUSE = 'c2000000-0000-4000-8000-000000000010';
const MATERIAL = 'c2000000-0000-4000-8000-000000000020';
const CUSTOMER = 'c2000000-0000-4000-8000-000000000030';

let canViewPrices = true;

vi.mock('@/features/Permissions', () => ({
  checkPermissionServer: async (_module: string, _tab: string, action: string) =>
    action === 'view_prices' ? canViewPrices : true,
}));
vi.mock('@/shared/lib/tenant', () => ({ getActiveCompanyId: async () => COMPANY }));

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
  await prisma.materials.deleteMany({ where: { company_id } });
  await prisma.warehouses.deleteMany({ where: { company_id } });
  await prisma.measurement_units.deleteMany({ where: { company_id } });
  await prisma.customers.deleteMany({ where: { id: CUSTOMER } });
  await prisma.company.deleteMany({ where: { id: company_id } });
  await prisma.profile.deleteMany({ where: { id: PROFILE } });
}

describe.skipIf(!RUN)('costos sin view_prices (integracion)', () => {
  let exitId = '';

  beforeAll(async () => {
    await cleanup();
    const prisma = await db();
    const city = await prisma.cities.findFirstOrThrow({ select: { id: true } });
    await prisma.company.create({
      data: {
        id: COMPANY,
        company_name: 'Almacenes precios test',
        description: 'empresa de prueba',
        contact_email: 'precios-test@alphataco.local',
        contact_phone: '+542991234567',
        address: 'Calle 123',
        city: city.id,
        country: 'argentina',
        industry: 'Petroleo',
        company_cuit: '30999999984',
      },
    });
    await prisma.profile.create({ data: { id: PROFILE, credential_id: PROFILE, email: 'precios-test@alphataco.local' } });
    await prisma.measurement_units.create({ data: { id: UNIT, company_id: COMPANY, name: 'Litro', abbreviation: 'l' } });
    await prisma.warehouses.create({ data: { id: WAREHOUSE, company_id: COMPANY, code: 'B', name: 'Base' } });
    await prisma.materials.create({ data: { id: MATERIAL, company_id: COMPANY, code: 'ACE', name: 'Aceite', unit_id: UNIT } });
    await prisma.customers.create({ data: { id: CUSTOMER, name: 'Cliente precios', cuit: BigInt(30999999986), company_id: COMPANY } });

    const { registerStockMovement } = await import('../lib/stock-engine');
    const base = {
      warehouseId: WAREHOUSE,
      targetWarehouseId: null,
      occurredOn: new Date(),
      reference: null,
      notes: null,
      employeeId: null,
      vehicleId: null,
      otherEquipmentId: null,
      maintenanceOrderId: null,
      customerServiceId: null,
    };
    const line = (quantity: string, unitCost: string | null) => ({
      materialId: MATERIAL,
      quantity,
      unitCost,
      adjustmentDirection: null,
      batchId: null,
      batchNumber: null,
      batchExpiresOn: null,
      serialNumbers: [],
      unitIds: [],
    });
    await prisma.$transaction((tx) =>
      registerStockMovement(tx, COMPANY, PROFILE, {
        ...base,
        type: 'ENTRY',
        destinationType: null,
        customerId: null,
        lines: [line('10', '123.45')],
      })
    );
    const exit = await prisma.$transaction((tx) =>
      registerStockMovement(tx, COMPANY, PROFILE, {
        ...base,
        type: 'EXIT',
        destinationType: 'CUSTOMER',
        customerId: CUSTOMER,
        lines: [line('4', null)],
      })
    );
    exitId = exit.id;
  }, 30_000);

  afterAll(async () => {
    await cleanup();
  }, 30_000);

  async function readEverything() {
    const { getStockPaginated, getAllStockForExport } = await import('../Stock/components/StockList/actions.server');
    const { getMovementsPaginated, getAllMovementsForExport } = await import(
      '../Movements/components/MovementsList/actions.server'
    );
    const { getStockMovementDetail } = await import('./movements.server');
    const { getMaterialDetail, getMaterialKardex } = await import('./materials-detail.server');
    return {
      stock: await getStockPaginated({}),
      stockExport: await getAllStockForExport({}),
      movements: await getMovementsPaginated({}),
      movementsExport: await getAllMovementsForExport({}),
      detail: await getStockMovementDetail(exitId),
      material: await getMaterialDetail(MATERIAL),
      kardex: await getMaterialKardex(MATERIAL),
    };
  }

  it('con view_prices los costos llegan', async () => {
    canViewPrices = true;
    const r = await readEverything();
    const serialized = JSON.stringify(r);
    expect(serialized).toContain('123.45');
    expect(r.detail?.totalCost).not.toBeNull();
    expect(r.material?.averageCost).not.toBeNull();
    expect(r.kardex.every((row) => row.unitCost !== null)).toBe(true);
  });

  it('sin view_prices ningun costo sale del servidor', async () => {
    canViewPrices = false;
    const r = await readEverything();
    // El costo unitario (123.45) y el valorizado (6 x 123.45 = 740.7) no aparecen en NINGUNA
    // respuesta, ni en el paginado, ni en el export, ni en los detalles.
    const serialized = JSON.stringify(r);
    expect(serialized).not.toContain('123.45');
    expect(serialized).not.toContain('740.7');
    expect(serialized).not.toContain('493.8');
    expect(r.detail?.totalCost).toBeNull();
    expect(r.detail?.lines.every((l) => l.unitCost === null && l.totalCost === null)).toBe(true);
    expect(r.material?.averageCost).toBeNull();
    expect(r.material?.stockValue).toBeNull();
    expect(r.kardex.every((row) => row.unitCost === null && row.averageCost === null)).toBe(true);
    // Las cantidades si llegan: el permiso oculta plata, no stock.
    expect(r.material?.totalStock).toBe('6');
  });
});
