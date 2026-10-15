import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Solicitudes de compra (Compras etapa 1) contra el Postgres del compose:
 * `npm run test:purchases`. Se simulan la sesion (cambiable entre solicitante y aprobador), la
 * empresa activa, los permisos y el envio del mail. Todo lo demas es real: locks, CHECK y
 * validaciones contra la base.
 */

const COMPANY = 'd2000000-0000-4000-8000-000000000001';
const OTHER_COMPANY = 'd2000000-0000-4000-8000-000000000002';
const REQUESTER = 'd2000000-0000-4000-8000-000000000003';
const APPROVER = 'd2000000-0000-4000-8000-000000000004';
const UNIT = 'd2000000-0000-4000-8000-000000000010';
const FOREIGN_UNIT = 'd2000000-0000-4000-8000-000000000011';
const MATERIAL = 'd2000000-0000-4000-8000-000000000020';
const INACTIVE_MATERIAL = 'd2000000-0000-4000-8000-000000000021';
const FOREIGN_MATERIAL = 'd2000000-0000-4000-8000-000000000022';
const SUPPLIER = 'd2000000-0000-4000-8000-000000000030';
const EMPLOYEE = 'd2000000-0000-4000-8000-000000000040';
const MATERIAL_IN_STOCK = 'd2000000-0000-4000-8000-000000000023';
const WAREHOUSE = 'd2000000-0000-4000-8000-000000000050';
const PEDIDO = 'd2000000-0000-4000-8000-000000000060';
const PEDIDO_PENDING = 'd2000000-0000-4000-8000-000000000061';
const PEDIDO_COVERED = 'd2000000-0000-4000-8000-000000000062';

const state = vi.hoisted(() => ({
  profileId: 'd2000000-0000-4000-8000-000000000003',
  denied: new Set<string>(),
  mailFails: false,
}));
const { sendDecisionMail } = vi.hoisted(() => ({
  sendDecisionMail: vi.fn(async () => {
    if (state.mailFails) throw new Error('SMTP caído');
    return true;
  }),
}));

vi.mock('@/shared/lib/tenant', () => ({ getActiveCompanyId: async () => 'd2000000-0000-4000-8000-000000000001' }));
vi.mock('@/features/Permissions', () => ({
  checkPermissionServer: async (module: string, tab: string, action: string) => !state.denied.has(`${module}:${tab}:${action}`),
}));
vi.mock('@/shared/actions/auth.actions', () => {
  const current = () => ({ id: state.profileId, credentialId: state.profileId, fullname: null, email: null });
  return { getServerAuthProfile: async () => current(), requireServerAuthProfile: async () => current() };
});
vi.mock('@/shared/lib/mail/templates/purchases', () => ({ sendPurchaseRequestDecisionEmail: sendDecisionMail }));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

const RUN = Boolean(process.env.DATABASE_URL);

async function db() {
  return (await import('@/shared/lib/prisma')).prisma;
}

async function cleanup() {
  const prisma = await db();
  const company_id = { in: [COMPANY, OTHER_COMPANY] };
  await prisma.purchase_request_lines.deleteMany({ where: { request: { company_id } } });
  await prisma.purchase_requests.deleteMany({ where: { company_id } });
  await prisma.suppliers.deleteMany({ where: { company_id } });
  await prisma.material_requests.deleteMany({ where: { company_id } });
  await prisma.stock_balances.deleteMany({ where: { company_id } });
  await prisma.warehouses.deleteMany({ where: { company_id } });
  await prisma.materials.deleteMany({ where: { company_id } });
  await prisma.measurement_units.deleteMany({ where: { company_id } });
  await prisma.employees.deleteMany({ where: { id: EMPLOYEE } });
  await prisma.profile.deleteMany({ where: { id: { in: [REQUESTER, APPROVER] } } });
  await prisma.company.deleteMany({ where: { id: company_id } });
}

const materialLine = (overrides: Record<string, string> = {}) => ({
  kind: 'MATERIAL' as const,
  materialId: MATERIAL,
  description: '',
  quantity: '4',
  unitId: '',
  suggestedSupplierId: SUPPLIER,
  notes: '',
  ...overrides,
});

const freeTextLine = (overrides: Record<string, string> = {}) => ({
  kind: 'FREE_TEXT' as const,
  materialId: '',
  description: 'Rectificado de tapa de cilindros',
  quantity: '1',
  unitId: UNIT,
  suggestedSupplierId: '',
  notes: '',
  ...overrides,
});

const request = (overrides: Record<string, unknown> = {}) => ({
  destinationType: '' as const,
  employeeId: '',
  vehicleId: '',
  otherEquipmentId: '',
  maintenanceOrderId: '',
  customerId: '',
  customerServiceId: '',
  neededBy: '',
  notes: '',
  lines: [materialLine(), freeTextLine()],
  ...overrides,
});

function expectOk<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(`Se esperaba ok y vino: ${result.error}`);
  return result.data;
}

async function statusOf(id: string) {
  const prisma = await db();
  return (await prisma.purchase_requests.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
}

describe.skipIf(!RUN)('solicitudes de compra (integracion)', () => {
  beforeAll(async () => {
    await cleanup();
    const prisma = await db();
    const [city, province, country] = await Promise.all([
      prisma.cities.findFirstOrThrow({ select: { id: true } }),
      prisma.provinces.findFirstOrThrow({ select: { id: true } }),
      prisma.countries.findFirstOrThrow({ select: { id: true } }),
    ]);
    for (const [id, cuit] of [
      [COMPANY, '30999999989'],
      [OTHER_COMPANY, '30999999990'],
    ] as const) {
      await prisma.company.create({
        data: {
          id,
          company_name: `Solicitudes test ${cuit}`,
          description: 'empresa de prueba',
          contact_email: 'solicitudes-test@alphataco.local',
          contact_phone: '+542991234567',
          address: 'Calle 123',
          city: city.id,
          country: 'argentina',
          industry: 'Petroleo',
          company_cuit: cuit,
        },
      });
    }
    await prisma.profile.createMany({
      data: [
        { id: REQUESTER, credential_id: REQUESTER, email: 'solicitante@alphataco.local', fullname: 'Solicitante' },
        { id: APPROVER, credential_id: APPROVER, email: 'aprobador@alphataco.local' },
      ],
    });
    await prisma.measurement_units.createMany({
      data: [
        { id: UNIT, company_id: COMPANY, name: 'Unidad test', abbreviation: 'ut' },
        { id: FOREIGN_UNIT, company_id: OTHER_COMPANY, name: 'Unidad ajena', abbreviation: 'ua' },
      ],
    });
    await prisma.materials.createMany({
      data: [
        { id: MATERIAL, company_id: COMPANY, code: 'FIL-01', name: 'Filtro de aceite', unit_id: UNIT },
        { id: INACTIVE_MATERIAL, company_id: COMPANY, code: 'FIL-99', name: 'Filtro viejo', unit_id: UNIT, is_active: false },
        { id: FOREIGN_MATERIAL, company_id: OTHER_COMPANY, code: 'X-01', name: 'Ajeno', unit_id: FOREIGN_UNIT },
        { id: MATERIAL_IN_STOCK, company_id: COMPANY, code: 'GRA-01', name: 'Grasa', unit_id: UNIT },
      ],
    });
    await prisma.suppliers.create({
      data: { id: SUPPLIER, company_id: COMPANY, name: 'Repuestos test', cuit: BigInt('20123456786'), vat_condition_id: 1 },
    });
    await prisma.employees.create({
      data: {
        id: EMPLOYEE,
        company_id: COMPANY,
        firstname: 'Test',
        lastname: 'Destino',
        file: 'SC-1',
        cuil: '20777770033',
        document_number: '77770033',
        birthplace: country.id,
        street: 'Calle',
        street_number: '1',
        province: province.id,
        phone: '2991234567',
        date_of_admission: new Date('2020-01-01'),
      },
    });

    // Stock: 1 filtro y 5 grasas. Los pedidos son datos de prueba directos (sus entregas no
    // importan aca: el faltante usa lo entregado, que es 0).
    await prisma.warehouses.create({ data: { id: WAREHOUSE, company_id: COMPANY, code: 'B', name: 'Base' } });
    await prisma.stock_balances.createMany({
      data: [
        { company_id: COMPANY, material_id: MATERIAL, warehouse_id: WAREHOUSE, quantity: 1 },
        { company_id: COMPANY, material_id: MATERIAL_IN_STOCK, warehouse_id: WAREHOUSE, quantity: 5 },
      ],
    });
    const pedido = (id: string, number: string, status: 'APPROVED' | 'PENDING_APPROVAL', lines: [string, number][]) =>
      prisma.material_requests.create({
        data: {
          id,
          company_id: COMPANY,
          number,
          status,
          requested_by: REQUESTER,
          destination_type: 'EMPLOYEE',
          employee_id: EMPLOYEE,
          lines: { create: lines.map(([material_id, quantity]) => ({ material_id, quantity })) },
        },
      });
    await pedido(PEDIDO, 'PED-T1', 'APPROVED', [
      [MATERIAL, 4],
      [MATERIAL_IN_STOCK, 2],
    ]);
    await pedido(PEDIDO_PENDING, 'PED-T2', 'PENDING_APPROVAL', [[MATERIAL, 4]]);
    await pedido(PEDIDO_COVERED, 'PED-T3', 'APPROVED', [[MATERIAL_IN_STOCK, 3]]);
  }, 60_000);

  afterAll(async () => {
    await cleanup();
  }, 60_000);

  beforeEach(() => {
    state.profileId = REQUESTER;
    state.denied.clear();
    state.mailFails = false;
    sendDecisionMail.mockClear();
  });

  it('ciclo completo: borrador, edicion, envio y aprobacion con mail al solicitante', async () => {
    const actions = { ...(await import('./requests.server')), ...(await import('./request-queries.server')) };
    const draft = expectOk(await actions.createPurchaseRequest(request(), { submit: false }));
    expect(draft.number).toMatch(/^SC-\d{6}$/);
    expect(await statusOf(draft.id)).toBe('DRAFT');

    expectOk(await actions.updatePurchaseRequestDraft(draft.id, request({ lines: [materialLine({ quantity: '6,5' })] })));
    const prisma = await db();
    const lines = await prisma.purchase_request_lines.findMany({ where: { request_id: draft.id } });
    expect(lines.map((l) => [l.quantity.toString(), l.unit_id])).toEqual([['6.5', UNIT]]);

    expectOk(await actions.submitPurchaseRequest(draft.id));
    state.profileId = APPROVER;
    expectOk(await actions.approvePurchaseRequest(draft.id, 'Ok, urgente'));
    expect(await statusOf(draft.id)).toBe('APPROVED');
    expect(sendDecisionMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'solicitante@alphataco.local', approved: true, number: draft.number })
    );

    // Ya aprobada: no se edita ni se vuelve a aprobar.
    state.profileId = REQUESTER;
    expect(await actions.updatePurchaseRequestDraft(draft.id, request())).toEqual({
      ok: false,
      error: `La solicitud ${draft.number} ya fue aprobada`,
    });
  });

  it('rechazo con motivo obligatorio; anulacion; copia como nueva', async () => {
    const actions = { ...(await import('./requests.server')), ...(await import('./request-queries.server')) };
    const pending = expectOk(await actions.createPurchaseRequest(request(), { submit: true }));
    state.profileId = APPROVER;
    expect(await actions.rejectPurchaseRequest(pending.id, '  ')).toEqual({ ok: false, error: 'Indicá el motivo' });
    expectOk(await actions.rejectPurchaseRequest(pending.id, 'Comprar en el próximo trimestre'));
    expect(await statusOf(pending.id)).toBe('REJECTED');

    state.profileId = REQUESTER;
    const copy = expectOk(await actions.copyPurchaseRequest(pending.id));
    expect(copy.number).not.toBe(pending.number);
    expect(await statusOf(copy.id)).toBe('DRAFT');

    expectOk(await actions.cancelPurchaseRequest(copy.id, 'Ya no hace falta'));
    expect(await statusOf(copy.id)).toBe('CANCELLED');
  });

  it('dos aprobaciones simultaneas: una gana y la otra recibe el mensaje', async () => {
    const actions = { ...(await import('./requests.server')), ...(await import('./request-queries.server')) };
    const pending = expectOk(await actions.createPurchaseRequest(request(), { submit: true }));
    state.profileId = APPROVER;
    const results = await Promise.all([
      actions.approvePurchaseRequest(pending.id),
      actions.approvePurchaseRequest(pending.id),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: `La solicitud ${pending.number} ya fue aprobada` });
  });

  it('un borrador que quedo invalido no se envia: proveedor desactivado y empleado de baja', async () => {
    const actions = { ...(await import('./requests.server')), ...(await import('./request-queries.server')) };
    const prisma = await db();
    const draft = expectOk(
      await actions.createPurchaseRequest(request({ destinationType: 'EMPLOYEE', employeeId: EMPLOYEE }), { submit: false })
    );

    await prisma.suppliers.update({ where: { id: SUPPLIER }, data: { is_active: false } });
    expect(await actions.submitPurchaseRequest(draft.id)).toEqual({
      ok: false,
      error: 'Línea 1: el proveedor Repuestos test está inactivo',
    });
    await prisma.suppliers.update({ where: { id: SUPPLIER }, data: { is_active: true } });

    await prisma.employees.update({ where: { id: EMPLOYEE }, data: { is_active: false } });
    expect(await actions.submitPurchaseRequest(draft.id)).toEqual({
      ok: false,
      error: 'El empleado no existe o está dado de baja',
    });
    await prisma.employees.update({ where: { id: EMPLOYEE }, data: { is_active: true } });
    expect(await statusOf(draft.id)).toBe('DRAFT');
    expectOk(await actions.submitPurchaseRequest(draft.id));
  });

  it('perimetro: material, unidad y proveedor de otra empresa o inactivos se rechazan', async () => {
    const { createPurchaseRequest } = await import('./requests.server');
    expect(await createPurchaseRequest(request({ lines: [materialLine({ materialId: FOREIGN_MATERIAL })] }), { submit: false })).toEqual({
      ok: false,
      error: 'Línea 1: el material no existe',
    });
    expect(await createPurchaseRequest(request({ lines: [materialLine({ materialId: INACTIVE_MATERIAL })] }), { submit: false })).toEqual({
      ok: false,
      error: 'Línea 1: Filtro viejo (FIL-99) está inactivo',
    });
    expect(await createPurchaseRequest(request({ lines: [freeTextLine({ unitId: FOREIGN_UNIT })] }), { submit: false })).toEqual({
      ok: false,
      error: 'Línea 1: elegí la unidad',
    });
  });

  it('permisos: sin approve no se aprueba; con solo view no se ve la ajena; ajeno sin update no anula', async () => {
    const actions = { ...(await import('./requests.server')), ...(await import('./request-queries.server')) };
    const pending = expectOk(await actions.createPurchaseRequest(request(), { submit: true }));
    state.profileId = APPROVER;
    state.denied.add('compras:solicitudes:approve');
    expect(await actions.approvePurchaseRequest(pending.id)).toEqual({
      ok: false,
      error: 'No tenés permiso para realizar esta acción',
    });
    state.denied.add('compras:solicitudes:view_all_requests');
    expect(await actions.getPurchaseRequestDetail(pending.id)).toBeNull();
    state.denied.add('compras:solicitudes:update');
    expect(await actions.cancelPurchaseRequest(pending.id, 'no')).toEqual({
      ok: false,
      error: 'No tenés permiso para realizar esta acción',
    });
    state.profileId = REQUESTER;
    expect((await actions.getPurchaseRequestDetail(pending.id))?.can.cancel).toBe(true);
  });

  it('si el mail falla, la aprobacion queda hecha', async () => {
    const actions = { ...(await import('./requests.server')), ...(await import('./request-queries.server')) };
    const pending = expectOk(await actions.createPurchaseRequest(request(), { submit: true }));
    state.profileId = APPROVER;
    state.mailFails = true;
    expectOk(await actions.approvePurchaseRequest(pending.id));
    expect(await statusOf(pending.id)).toBe('APPROVED');
    expect(sendDecisionMail).toHaveBeenCalledTimes(1);
  });

  it('desde un pedido de Almacenes: propone solo el faltante y hereda el destino', async () => {
    const actions = { ...(await import('./requests.server')), ...(await import('./request-queries.server')) };
    const shortfall = expectOk(await actions.getMaterialRequestShortfall(PEDIDO));
    // Filtro: pide 4, hay 1 -> faltan 3. Grasa: pide 2, hay 5 -> no se propone.
    expect(shortfall.lines.map((l) => [l.code, l.shortfall])).toEqual([['FIL-01', '3']]);
    expect(shortfall.destination).toMatchObject({ destinationType: 'EMPLOYEE', employeeId: EMPLOYEE });

    // El destino del formulario se ignora: manda el del pedido.
    const created = expectOk(
      await actions.createPurchaseRequestFromMaterialRequest(
        PEDIDO,
        request({ lines: [materialLine({ quantity: '3', suggestedSupplierId: '' })] }),
        { submit: true }
      )
    );
    const prisma = await db();
    const stored = await prisma.purchase_requests.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored).toMatchObject({ material_request_id: PEDIDO, destination_type: 'EMPLOYEE', employee_id: EMPLOYEE, status: 'PENDING_APPROVAL' });

    // Se permite una segunda solicitud para el mismo pedido, y el pedido las lista.
    expectOk(
      await actions.createPurchaseRequestFromMaterialRequest(PEDIDO, request({ lines: [materialLine({ quantity: '1' })] }), {
        submit: false,
      })
    );
    expect(await actions.getPurchaseRequestsForMaterialRequest(PEDIDO)).toHaveLength(2);
  });

  it('desde un pedido: material ajeno al pedido, texto libre, pedido sin aprobar o sin faltante se rechazan', async () => {
    const actions = { ...(await import('./requests.server')), ...(await import('./request-queries.server')) };
    expect(
      await actions.createPurchaseRequestFromMaterialRequest(PEDIDO, request({ lines: [freeTextLine()] }), { submit: false })
    ).toEqual({ ok: false, error: 'Línea 1: solo se piden materiales del pedido PED-T1' });
    expect(await actions.getMaterialRequestShortfall(PEDIDO_PENDING)).toEqual({
      ok: false,
      error: 'El pedido PED-T2 no está aprobado con entregas pendientes',
    });
    expect(await actions.getMaterialRequestShortfall(PEDIDO_COVERED)).toEqual({
      ok: false,
      error: 'El pedido PED-T3 no tiene faltantes: hay stock para entregar todo',
    });
    const prisma = await db();
    expect(await prisma.purchase_requests.count({ where: { material_request_id: PEDIDO_COVERED } })).toBe(0);
  });

  it('un borrador generado desde un pedido sigue atado al pedido al editarlo', async () => {
    const actions = { ...(await import('./requests.server')), ...(await import('./request-queries.server')) };
    const draft = expectOk(
      await actions.createPurchaseRequestFromMaterialRequest(PEDIDO, request({ lines: [materialLine({ quantity: '2' })] }), {
        submit: false,
      })
    );
    // Otro material: rechazado.
    expect(
      await actions.updatePurchaseRequestDraft(draft.id, request({ lines: [materialLine({ materialId: INACTIVE_MATERIAL })] }))
    ).toEqual({ ok: false, error: 'Línea 1: solo se piden materiales del pedido PED-T1' });
    // Destino distinto en el formulario: se ignora y queda el del pedido.
    expectOk(await actions.updatePurchaseRequestDraft(draft.id, request({ lines: [materialLine({ quantity: '5' })] })));
    const prisma = await db();
    const stored = await prisma.purchase_requests.findUniqueOrThrow({ where: { id: draft.id } });
    expect(stored).toMatchObject({ destination_type: 'EMPLOYEE', employee_id: EMPLOYEE });
  });

  it('visibilidad: sin view_all no se copia una ajena ni se genera desde un pedido ajeno, y el pedido no la lista', async () => {
    const actions = { ...(await import('./requests.server')), ...(await import('./request-queries.server')) };
    const rejected = expectOk(await actions.createPurchaseRequest(request(), { submit: true }));
    state.profileId = APPROVER;
    expectOk(await actions.rejectPurchaseRequest(rejected.id, 'No'));

    // APPROVER no pidio ni la solicitud ni el pedido PED-T1 (los pidio REQUESTER).
    state.denied.add('compras:solicitudes:view_all_requests');
    expect(await actions.copyPurchaseRequest(rejected.id)).toEqual({ ok: false, error: 'La solicitud no existe' });
    expect(await actions.getPurchaseRequestsForMaterialRequest(PEDIDO)).toEqual([]);

    state.denied.add('almacenes:pedidos:view_all_requests');
    expect(await actions.getMaterialRequestShortfall(PEDIDO)).toEqual({ ok: false, error: 'El pedido de materiales no existe' });
    expect(
      await actions.createPurchaseRequestFromMaterialRequest(PEDIDO, request({ lines: [materialLine({ quantity: '1' })] }), {
        submit: false,
      })
    ).toEqual({ ok: false, error: 'El pedido de materiales no existe' });

    // El solicitante del pedido si puede.
    state.profileId = REQUESTER;
    expectOk(await actions.getMaterialRequestShortfall(PEDIDO));
  });
});

