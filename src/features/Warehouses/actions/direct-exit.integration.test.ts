import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StockMovementFormValues } from '../schemas/stock-movement';

/**
 * Regla triple de la salida directa (spec etapa 3 §3.4) y visibilidad de pedidos, probadas en las
 * actions reales contra el Postgres del compose (`npm run test:warehouses`), con los permisos y
 * la sesion simulados como en el test de precios.
 */

const COMPANY = 'c3000000-0000-4000-8000-000000000001';
const PROFILE = 'c3000000-0000-4000-8000-000000000002';
const OTHER_PROFILE = 'c3000000-0000-4000-8000-000000000003';
const UNIT = 'c3000000-0000-4000-8000-000000000004';
const WAREHOUSE = 'c3000000-0000-4000-8000-000000000010';
const OIL = 'c3000000-0000-4000-8000-000000000020';
const DETECTOR = 'c3000000-0000-4000-8000-000000000021';
const CUSTOMER = 'c3000000-0000-4000-8000-000000000030';

/** Permisos denegados en el caso actual (`tab:accion`); el resto se concede. */
let denied = new Set<string>();
let currentProfile = PROFILE;

vi.mock('@/features/Permissions', () => ({
  checkPermissionServer: async (_module: string, tab: string, action: string) => !denied.has(`${tab}:${action}`),
}));
vi.mock('@/shared/lib/tenant', () => ({ getActiveCompanyId: async () => COMPANY }));
vi.mock('@/shared/actions/auth.actions', () => ({
  getServerAuthProfile: async () => ({ id: currentProfile, credentialId: currentProfile, fullname: null, email: null }),
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
  await prisma.warehouse_settings.deleteMany({ where: { company_id } });
  await prisma.materials.deleteMany({ where: { company_id } });
  await prisma.warehouses.deleteMany({ where: { company_id } });
  await prisma.measurement_units.deleteMany({ where: { company_id } });
  await prisma.customers.deleteMany({ where: { id: CUSTOMER } });
  await prisma.company.deleteMany({ where: { id: company_id } });
  await prisma.profile.deleteMany({ where: { id: { in: [PROFILE, OTHER_PROFILE] } } });
}

function exitForm(materialId: string, quantity: string): StockMovementFormValues {
  return {
    type: 'EXIT',
    warehouseId: WAREHOUSE,
    targetWarehouseId: '',
    occurredOn: new Date(),
    reference: '',
    notes: '',
    destinationType: 'CUSTOMER',
    employeeId: '',
    vehicleId: '',
    otherEquipmentId: '',
    maintenanceOrderId: '',
    customerId: CUSTOMER,
    customerServiceId: '',
    lines: [
      {
        materialId,
        trackingType: 'QUANTITY',
        quantity,
        unitCost: '',
        adjustmentDirection: 'OUT',
        batchId: '',
        batchNumber: '',
        batchExpiresOn: undefined,
        serialNumbers: '',
        unitIds: [],
      },
    ],
  };
}

async function oilBalance() {
  const prisma = await db();
  const row = await prisma.stock_balances.findFirst({ where: { material_id: OIL, warehouse_id: WAREHOUSE } });
  return row?.quantity.toString() ?? '0';
}

describe.skipIf(!RUN)('salida directa y pedidos (integracion de actions)', () => {
  beforeAll(async () => {
    await cleanup();
    const prisma = await db();
    const city = await prisma.cities.findFirstOrThrow({ select: { id: true } });
    await prisma.company.create({
      data: {
        id: COMPANY,
        company_name: 'Almacenes pedidos test',
        description: 'empresa de prueba',
        contact_email: 'pedidos-test@alphataco.local',
        contact_phone: '+542991234567',
        address: 'Calle 123',
        city: city.id,
        country: 'argentina',
        industry: 'Petroleo',
        company_cuit: '30999999987',
      },
    });
    await prisma.profile.createMany({
      data: [
        { id: PROFILE, credential_id: PROFILE, email: 'pedidos-test@alphataco.local' },
        { id: OTHER_PROFILE, credential_id: OTHER_PROFILE, email: 'pedidos-otro@alphataco.local' },
      ],
    });
    await prisma.measurement_units.create({ data: { id: UNIT, company_id: COMPANY, name: 'Litro', abbreviation: 'l' } });
    await prisma.warehouses.create({ data: { id: WAREHOUSE, company_id: COMPANY, code: 'B', name: 'Base' } });
    await prisma.materials.createMany({
      data: [
        { id: OIL, company_id: COMPANY, code: 'ACE', name: 'Aceite 15W40', unit_id: UNIT },
        { id: DETECTOR, company_id: COMPANY, code: 'DET', name: 'Detector multigás', unit_id: UNIT, requires_approval: true },
      ],
    });
    await prisma.customers.create({ data: { id: CUSTOMER, name: 'Cliente pedidos', cuit: BigInt(30999999988), company_id: COMPANY } });

    const { registerStockMovementAction } = await import('./movements.server');
    const entry: StockMovementFormValues = {
      ...exitForm(OIL, '100'),
      type: 'ENTRY',
      destinationType: '',
      customerId: '',
      lines: [
        { ...exitForm(OIL, '100').lines[0]!, unitCost: '1000' },
        { ...exitForm(DETECTOR, '5').lines[0]!, unitCost: '50' },
      ],
    };
    const result = await registerStockMovementAction(entry);
    if (!result.ok) throw new Error(result.error);
  }, 30_000);

  afterAll(async () => {
    await cleanup();
  }, 30_000);

  beforeEach(() => {
    denied = new Set();
    currentProfile = PROFILE;
  });

  it('sin direct_exit la salida se rechaza y sugiere el pedido', async () => {
    denied = new Set(['movimientos:direct_exit']);
    const { registerStockMovementAction } = await import('./movements.server');
    const result = await registerStockMovementAction(exitForm(OIL, '1'));
    expect(result).toEqual({
      ok: false,
      error: 'No tenés permiso de salida directa: hacé un pedido de materiales.',
    });
    expect(await oilBalance()).toBe('100');
  });

  it('un material con requires_approval no sale directo', async () => {
    const { registerStockMovementAction } = await import('./movements.server');
    const result = await registerStockMovementAction(exitForm(DETECTOR, '1'));
    expect(result).toEqual({
      ok: false,
      error: 'Detector multigás requiere aprobación: hacé un pedido de materiales.',
    });
  });

  it('el monto se controla con el total real del motor y revierte todo', async () => {
    const prisma = await db();
    await prisma.warehouse_settings.create({ data: { company_id: COMPANY, direct_exit_max_amount: '50000' } });
    const { registerStockMovementAction } = await import('./movements.server');

    // 60 l a $1.000 (el promedio) = $60.000: hay stock, pero supera el maximo.
    const tooMuch = await registerStockMovementAction(exitForm(OIL, '60'));
    // Intl separa el signo con un espacio duro: se normaliza para comparar el texto.
    expect(tooMuch.ok ? null : tooMuch.error.replace(/\u00a0/g, ' ')).toBe(
      'La salida suma $ 60.000,00 y el máximo de salida directa es $ 50.000,00: hacé un pedido de materiales.'
    );
    expect(await oilBalance()).toBe('100');
    expect(await prisma.stock_movements.count({ where: { company_id: COMPANY, type: 'EXIT' } })).toBe(0);

    denied = new Set(['movimientos:view_prices']);
    const hidden = await registerStockMovementAction(exitForm(OIL, '60'));
    expect(hidden).toEqual({ ok: false, error: 'La salida supera el monto máximo de salida directa: hacé un pedido de materiales.' });

    denied = new Set();
    // Justo en el maximo, pasa.
    const within = await registerStockMovementAction(exitForm(OIL, '50'));
    expect(within.ok).toBe(true);
    expect(await oilBalance()).toBe('50');
  });

  it('pedidos: el solicitante ve el suyo y lo cancela; otro sin view_all no lo ve ni lo cancela', async () => {
    const { createMaterialRequestAction, getMaterialRequestDetail, cancelRequestAction } = await import('./requests.server');
    const created = await createMaterialRequestAction({
      destinationType: 'CUSTOMER',
      employeeId: '',
      vehicleId: '',
      otherEquipmentId: '',
      maintenanceOrderId: '',
      customerId: CUSTOMER,
      customerServiceId: '',
      notes: 'para la locación',
      lines: [{ materialId: DETECTOR, quantity: '2' }],
    });
    if (!created.ok) throw new Error(created.error);
    expect(created.data.number).toMatch(/^PED-\d{6}$/);

    const own = await getMaterialRequestDetail(created.data.id);
    expect(own?.status).toBe('PENDING_APPROVAL');
    expect(own?.can.cancel).toBe(true);
    expect(own?.lines[0]).toMatchObject({ requested: '2', delivered: '0', pending: '2' });

    currentProfile = OTHER_PROFILE;
    denied = new Set(['pedidos:view_all_requests']);
    expect(await getMaterialRequestDetail(created.data.id)).toBeNull();
    const foreignCancel = await cancelRequestAction(created.data.id);
    expect(foreignCancel).toEqual({ ok: false, error: 'Solo quien hizo el pedido puede cancelarlo' });

    denied = new Set();
    expect((await getMaterialRequestDetail(created.data.id))?.can.cancel).toBe(false);

    currentProfile = PROFILE;
    const cancelled = await cancelRequestAction(created.data.id);
    expect(cancelled.ok).toBe(true);
    expect((await getMaterialRequestDetail(created.data.id))?.status).toBe('CANCELLED');
  });
});
