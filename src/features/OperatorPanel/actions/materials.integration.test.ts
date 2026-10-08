import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Pedidos de materiales desde el panel del operario (Almacenes etapa 4) contra el Postgres del
 * compose: `npm run test:warehouses`.
 *
 * Corre el PERIMETRO real (`getOperatorIdentity` → sectores asignados); solo se simula la sesion.
 * El operario tiene asignado el sector S1: sus OTs abiertas admiten pedidos, la del sector S2
 * (otro sector) y la cerrada no.
 */

const COMPANY = 'c4000000-0000-4000-8000-000000000001';
const PROFILE = 'c4000000-0000-4000-8000-000000000002';
const EMPLOYEE = 'c4000000-0000-4000-8000-000000000003';
const UNIT = 'c4000000-0000-4000-8000-000000000004';
const MATERIAL = 'c4000000-0000-4000-8000-000000000005';
const WORKSHOP = 'c4000000-0000-4000-8000-000000000010';
const SECTOR_OWN = 'c4000000-0000-4000-8000-000000000011';
const SECTOR_OTHER = 'c4000000-0000-4000-8000-000000000012';
const ORDER = 'c4000000-0000-4000-8000-000000000020';
const WO_OPEN = 'c4000000-0000-4000-8000-000000000030';
const WO_OTHER_SECTOR = 'c4000000-0000-4000-8000-000000000031';
const WO_CLOSED = 'c4000000-0000-4000-8000-000000000032';

vi.mock('@/shared/lib/session', () => ({
  getSessionUserId: async () => PROFILE,
  isSessionAnonymous: async () => false,
}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

const RUN = Boolean(process.env.DATABASE_URL);

async function db() {
  return (await import('@/shared/lib/prisma')).prisma;
}

async function cleanup() {
  const prisma = await db();
  const company_id = COMPANY;
  await prisma.material_requests.deleteMany({ where: { company_id } });
  await prisma.maintenance_activity_log.deleteMany({ where: { company_id } });
  await prisma.maintenance_order_items.deleteMany({ where: { company_id } });
  await prisma.work_orders.deleteMany({ where: { company_id } });
  await prisma.maintenance_orders.deleteMany({ where: { company_id } });
  await prisma.employee_workshop_sectors.deleteMany({ where: { employee_id: EMPLOYEE } });
  await prisma.workshop_sectors.deleteMany({ where: { company_id } });
  await prisma.workshops.deleteMany({ where: { company_id } });
  await prisma.materials.deleteMany({ where: { company_id } });
  await prisma.measurement_units.deleteMany({ where: { company_id } });
  await prisma.profile.deleteMany({ where: { id: PROFILE } });
  await prisma.employees.deleteMany({ where: { id: EMPLOYEE } });
  await prisma.company.deleteMany({ where: { id: company_id } });
}

const request = (workOrderId: string) => ({
  workOrderId,
  notes: 'para el cambio de aceite',
  lines: [{ materialId: MATERIAL, quantity: '4' }],
});

describe.skipIf(!RUN)('pedidos de materiales desde el panel del operario (integracion)', () => {
  beforeAll(async () => {
    await cleanup();
    const prisma = await db();
    const [city, province, country] = await Promise.all([
      prisma.cities.findFirstOrThrow({ select: { id: true } }),
      prisma.provinces.findFirstOrThrow({ select: { id: true } }),
      prisma.countries.findFirstOrThrow({ select: { id: true } }),
    ]);
    await prisma.company.create({
      data: {
        id: COMPANY,
        company_name: 'Operario pedidos test',
        description: 'empresa de prueba',
        contact_email: 'operario-test@alphataco.local',
        contact_phone: '+542991234567',
        address: 'Calle 123',
        city: city.id,
        country: 'argentina',
        industry: 'Petroleo',
        company_cuit: '30999999991',
      },
    });
    await prisma.employees.create({
      data: {
        id: EMPLOYEE,
        company_id: COMPANY,
        firstname: 'Juan',
        lastname: 'Mecánico',
        file: '9001',
        cuil: '20999999991',
        document_number: '99999991',
        birthplace: country.id,
        street: 'Calle',
        street_number: '1',
        province: province.id,
        phone: '2991234567',
        date_of_admission: new Date('2020-01-01'),
      },
    });
    await prisma.profile.create({
      data: { id: PROFILE, credential_id: PROFILE, email: 'operario-test@alphataco.local', employee_id: EMPLOYEE },
    });
    await prisma.workshops.create({ data: { id: WORKSHOP, company_id: COMPANY, name: 'Taller test' } });
    await prisma.workshop_sectors.createMany({
      data: [
        { id: SECTOR_OWN, company_id: COMPANY, workshop_id: WORKSHOP, name: 'Mecánica' },
        { id: SECTOR_OTHER, company_id: COMPANY, workshop_id: WORKSHOP, name: 'Chapa' },
      ],
    });
    await prisma.employee_workshop_sectors.create({ data: { employee_id: EMPLOYEE, workshop_sector_id: SECTOR_OWN } });
    await prisma.measurement_units.create({ data: { id: UNIT, company_id: COMPANY, name: 'Litro', abbreviation: 'l' } });
    await prisma.materials.create({ data: { id: MATERIAL, company_id: COMPANY, code: 'ACE', name: 'Aceite', unit_id: UNIT } });
    await prisma.maintenance_orders.create({
      data: { id: ORDER, company_id: COMPANY, status: 'in_workshop', order_number: 'OM-T1' },
    });
    const planned = { planned_start_date: new Date('2026-10-01'), planned_end_date: new Date('2026-10-02') };
    await prisma.work_orders.createMany({
      data: [
        { id: WO_OPEN, company_id: COMPANY, workshop_id: WORKSHOP, sector_id: SECTOR_OWN, status: 'in_progress', order_number: 'OT-T1', sequence_number: 1, ...planned },
        { id: WO_OTHER_SECTOR, company_id: COMPANY, workshop_id: WORKSHOP, sector_id: SECTOR_OTHER, status: 'in_progress', order_number: 'OT-T2', sequence_number: 2, ...planned },
        { id: WO_CLOSED, company_id: COMPANY, workshop_id: WORKSHOP, sector_id: SECTOR_OWN, status: 'completed', order_number: 'OT-T3', sequence_number: 3, ...planned },
      ],
    });
    await prisma.maintenance_order_items.createMany({
      data: [WO_OPEN, WO_OTHER_SECTOR, WO_CLOSED].map((work_order_id) => ({
        company_id: COMPANY,
        maintenance_order_id: ORDER,
        work_order_id,
      })),
    });
  }, 30_000);

  afterAll(async () => {
    await cleanup();
  }, 30_000);

  it('pide en una OT de su sector: queda pendiente, imputado a la orden y a la OT', async () => {
    const { createOperatorMaterialRequest, getWorkOrderMaterialRequests } = await import('./materials.server');
    const result = await createOperatorMaterialRequest(request(WO_OPEN));
    if (!result.ok) throw new Error(result.error);

    const prisma = await db();
    const created = await prisma.material_requests.findFirstOrThrow({ where: { number: result.data.number, company_id: COMPANY } });
    expect(created).toMatchObject({
      status: 'PENDING_APPROVAL',
      destination_type: 'MAINTENANCE_ORDER',
      maintenance_order_id: ORDER,
      work_order_id: WO_OPEN,
      requested_by: PROFILE,
    });
    const log = await prisma.maintenance_activity_log.findFirst({
      where: { maintenance_order_id: ORDER, action_type: 'material_request_created' },
    });
    expect(log?.notes).toContain(result.data.number);

    const list = await getWorkOrderMaterialRequests(WO_OPEN);
    expect(list).toHaveLength(1);
    expect(list[0]!.lines[0]).toMatchObject({ requested: '4', delivered: '0' });
  });

  it('una OT de otro sector se rechaza sin revelar si existe', async () => {
    const { createOperatorMaterialRequest } = await import('./materials.server');
    expect(await createOperatorMaterialRequest(request(WO_OTHER_SECTOR))).toEqual({
      ok: false,
      error: 'La orden de trabajo no pertenece a tus sectores',
    });
  });

  it('una OT cerrada no admite pedidos', async () => {
    const { createOperatorMaterialRequest } = await import('./materials.server');
    expect(await createOperatorMaterialRequest(request(WO_CLOSED))).toEqual({
      ok: false,
      error: 'La OT OT-T3 ya está cerrada: no admite pedidos',
    });
  });
});
