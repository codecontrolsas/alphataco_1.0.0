import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Ordenes de compra (Compras etapa 2) contra el Postgres del compose: `npm run test:purchases`.
 * Se simulan la sesion, la empresa activa, los permisos y los mails. El PDF se arma de verdad en
 * un caso (para que un error de layout no aparezca recien en produccion) y simulado en el resto.
 * Locks, CHECK, numeracion y el calculo de faltantes son reales.
 */

const COMPANY = 'd3000000-0000-4000-8000-000000000001';
const OTHER_COMPANY = 'd3000000-0000-4000-8000-000000000002';
const BUYER = 'd3000000-0000-4000-8000-000000000003';
const APPROVER = 'd3000000-0000-4000-8000-000000000004';
const UNIT = 'd3000000-0000-4000-8000-000000000010';
const FOREIGN_UNIT = 'd3000000-0000-4000-8000-000000000011';
const MATERIAL = 'd3000000-0000-4000-8000-000000000020';
const SUPPLIER = 'd3000000-0000-4000-8000-000000000030';
const INACTIVE_SUPPLIER = 'd3000000-0000-4000-8000-000000000031';
const FOREIGN_SUPPLIER = 'd3000000-0000-4000-8000-000000000032';

const state = vi.hoisted(() => ({
  profileId: 'd3000000-0000-4000-8000-000000000003',
  denied: new Set<string>(),
  decisionMailFails: false,
  supplierMailOk: true,
  realPdf: false,
  duringSend: null as null | (() => Promise<void>),
}));
const mails = vi.hoisted(() => ({
  // Avisos de #786 que se le piden al despachador (campanita + mail según los roles).
  decision: vi.fn(async (_input: { event: string; userIds?: readonly string[]; actorId?: string | null }) => {
    if (state.decisionMailFails) throw new Error('SMTP caído');
  }),
  supplier: vi.fn(async () => {
    // Simula que otro usuario cambia el documento mientras sale el mail.
    if (state.duringSend) await state.duringSend();
    return state.supplierMailOk;
  }),
}));

vi.mock('@/shared/lib/tenant', () => ({ getActiveCompanyId: async () => 'd3000000-0000-4000-8000-000000000001' }));
vi.mock('@/features/Permissions/actions/permissions.server', () => ({
  checkPermissionServer: async (module: string, tab: string, action: string) =>
    !state.denied.has(`${module}:${tab}:${action}`),
}));
vi.mock('@/shared/actions/auth.actions', () => {
  const current = () => ({ id: state.profileId, credentialId: state.profileId, fullname: null, email: null });
  return { getServerAuthProfile: async () => current(), requireServerAuthProfile: async () => current() };
});
// Las plantillas de aviso solo arman el contenido (#786); el envío al proveedor sí se captura.
vi.mock('@/shared/lib/mail/templates/purchases', async (importActual) => ({
  ...(await importActual<typeof import('@/shared/lib/mail/templates/purchases')>()),
  sendSupplierDocumentEmail: mails.supplier,
}));
vi.mock('../pdf/render-purchase-pdf.server', async (importActual) => {
  const actual = await importActual<typeof import('../pdf/render-purchase-pdf.server')>();
  const fake = async (_id: string) => ({ filename: 'fake.pdf', content: new Uint8Array([37, 80, 68, 70]) });
  return {
    renderPurchaseOrderPdf: (id: string, companyId: string) =>
      state.realPdf ? actual.renderPurchaseOrderPdf(id, companyId) : fake(id),
    renderPurchaseQuotePdf: (id: string, companyId: string) =>
      state.realPdf ? actual.renderPurchaseQuotePdf(id, companyId) : fake(id),
  };
});
vi.mock('@/features/Notifications/lib/dispatch.server', () => ({ notifySafe: mails.decision }));
vi.mock('@/shared/lib/session', () => ({ getSessionUserId: async () => state.profileId }));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

const RUN = Boolean(process.env.DATABASE_URL);

async function db() {
  return (await import('@/shared/lib/prisma')).prisma;
}

async function cleanup() {
  const prisma = await db();
  const company_id = { in: [COMPANY, OTHER_COMPANY] };
  await prisma.purchase_orders.deleteMany({ where: { company_id } });
  await prisma.purchase_quotes.deleteMany({ where: { company_id } });
  await prisma.purchase_requests.deleteMany({ where: { company_id } });
  await prisma.suppliers.deleteMany({ where: { company_id } });
  await prisma.materials.deleteMany({ where: { company_id } });
  await prisma.measurement_units.deleteMany({ where: { company_id } });
  await prisma.profile.deleteMany({ where: { id: { in: [BUYER, APPROVER] } } });
  await prisma.company.deleteMany({ where: { id: company_id } });
}

let requestCounter = 0;

/** Solicitud APROBADA con las cantidades dadas (lineas de material). Devuelve ids de solicitud y lineas. */
async function approvedRequest(quantities: number[], companyId = COMPANY) {
  const prisma = await db();
  requestCounter += 1;
  const created = await prisma.purchase_requests.create({
    data: {
      company_id: companyId,
      number: `SC-T${String(requestCounter).padStart(4, '0')}`,
      status: 'APPROVED',
      requested_by: BUYER,
      decided_by: APPROVER,
      decided_at: new Date(),
      lines: {
        create: quantities.map((quantity, i) =>
          companyId === COMPANY
            ? { position: i + 1, material_id: MATERIAL, quantity, unit_id: UNIT }
            : { position: i + 1, description: 'Ajeno', quantity, unit_id: FOREIGN_UNIT }
        ),
      },
    },
    select: { id: true, number: true, lines: { select: { id: true }, orderBy: { position: 'asc' } } },
  });
  return { id: created.id, number: created.number, lineIds: created.lines.map((l) => l.id) };
}

const orderLine = (requestLineId: string, quantity: string, overrides: Record<string, unknown> = {}) => ({
  requestLineId,
  quoteLineId: '',
  quantity,
  unitPrice: '100',
  vatRateId: 5,
  ...overrides,
});

const orderForm = (lines: ReturnType<typeof orderLine>[], overrides: Record<string, unknown> = {}) => ({
  supplierId: SUPPLIER,
  deliveryDate: '',
  deliveryPlace: '',
  paymentTermDays: '',
  notes: '',
  lines,
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

async function requestStatus(id: string) {
  const prisma = await db();
  return (await prisma.purchase_requests.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
}

async function order(id: string) {
  const prisma = await db();
  return prisma.purchase_orders.findUniqueOrThrow({
    where: { id },
    select: {
      status: true,
      subtotal: true,
      vat_total: true,
      total: true,
      payment_term_days: true,
      rejection_notes: true,
      sent_to: true,
      sent_at: true,
      rejections: { select: { reason: true } },
      lines: { select: { quantity: true, unit_price: true }, orderBy: { position: 'asc' } },
    },
  });
}

describe.skipIf(!RUN)('ordenes de compra (integracion)', () => {
  beforeAll(async () => {
    await cleanup();
    const prisma = await db();
    const city = await prisma.cities.findFirstOrThrow({ select: { id: true } });
    for (const [id, cuit] of [
      [COMPANY, '30999999970'],
      [OTHER_COMPANY, '30999999971'],
    ] as const) {
      await prisma.company.create({
        data: {
          id,
          company_name: `Ordenes test ${cuit}`,
          description: 'empresa de prueba',
          contact_email: 'ordenes-test@alphataco.local',
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
        { id: BUYER, credential_id: BUYER, email: 'comprador@alphataco.local', fullname: 'Comprador' },
        { id: APPROVER, credential_id: APPROVER, email: 'aprobador-oc@alphataco.local' },
      ],
    });
    await prisma.measurement_units.createMany({
      data: [
        { id: UNIT, company_id: COMPANY, name: 'Litro test', abbreviation: 'l' },
        { id: FOREIGN_UNIT, company_id: OTHER_COMPANY, name: 'Unidad ajena', abbreviation: 'ua' },
      ],
    });
    await prisma.materials.create({
      data: { id: MATERIAL, company_id: COMPANY, code: 'AC-15', name: 'Aceite 15W40', unit_id: UNIT },
    });
    await prisma.suppliers.createMany({
      data: [
        {
          id: SUPPLIER,
          company_id: COMPANY,
          name: 'Lubricantes test',
          cuit: BigInt('20123456786'),
          vat_condition_id: 1,
          payment_term_days: 30,
        },
        {
          id: INACTIVE_SUPPLIER,
          company_id: COMPANY,
          name: 'Inactivo test',
          cuit: BigInt('20111111112'),
          vat_condition_id: 1,
          is_active: false,
        },
        {
          id: FOREIGN_SUPPLIER,
          company_id: OTHER_COMPANY,
          name: 'Ajeno test',
          cuit: BigInt('20123456786'),
          vat_condition_id: 1,
        },
      ],
    });
    await prisma.supplier_contacts.create({
      data: { supplier_id: SUPPLIER, name: 'Ventas', email: 'ventas@lubricantes.test', is_primary: true },
    });
    await prisma.supplier_documents.create({
      data: {
        supplier_id: SUPPLIER,
        name: 'Constancia ARCA',
        file_path: 'x/y.pdf',
        file_name: 'y.pdf',
        expires_at: new Date('2020-01-01T00:00:00Z'),
        uploaded_by: BUYER,
      },
    });
  }, 60_000);

  afterAll(async () => {
    await cleanup();
  }, 60_000);

  beforeEach(() => {
    state.profileId = BUYER;
    state.denied.clear();
    state.decisionMailFails = false;
    state.supplierMailOk = true;
    state.realPdf = false;
    state.duringSend = null;
    mails.decision.mockClear();
    mails.supplier.mockClear();
  });

  it('ciclo: OC directa, avance de la solicitud, aprobar, rechazar, editar y anular', async () => {
    const actions = {
      ...(await import('./orders.server')),
      ...(await import('./order-send.server')),
      ...(await import('./order-queries.server')),
    };
    const req = await approvedRequest([10, 4]);

    const created = expectOk(
      await actions.createPurchaseOrder(orderForm([orderLine(req.lineIds[0], '6')]), { submit: false })
    );
    expect(created.number).toMatch(/^OC-\d{6}$/);
    expect(await requestStatus(req.id)).toBe('PARTIALLY_ORDERED');
    // Sin plazo en el formulario: el del proveedor.
    expect((await order(created.id)).payment_term_days).toBe(30);

    expectOk(await actions.submitPurchaseOrder(created.id));
    state.profileId = APPROVER;
    expectOk(await actions.rejectPurchaseOrder(created.id, 'Precio alto'));
    let stored = await order(created.id);
    expect(stored.status).toBe('DRAFT');
    expect(stored.rejection_notes).toBe('Precio alto');
    // Enviarla avisó a quienes aprueban; rechazarla, solo a quien la creó.
    const events = mails.decision.mock.calls.map(([input]) => input);
    expect(events.filter((input) => input.event === 'purchases.order_submitted')).toHaveLength(1);
    expect(events.filter((input) => input.event === 'purchases.order_decided')).toEqual([
      expect.objectContaining({ event: 'purchases.order_decided', userIds: [BUYER] }),
    ]);

    state.profileId = BUYER;
    expectOk(
      await actions.updatePurchaseOrderDraft(
        created.id,
        orderForm([orderLine(req.lineIds[0], '10', { unitPrice: '90' }), orderLine(req.lineIds[1], '4')])
      )
    );
    expect(await requestStatus(req.id)).toBe('ORDERED');
    expectOk(await actions.submitPurchaseOrder(created.id));
    state.profileId = APPROVER;
    expectOk(await actions.rejectPurchaseOrder(created.id, 'Falta el lugar de entrega'));
    state.profileId = BUYER;
    expectOk(await actions.submitPurchaseOrder(created.id));
    state.profileId = APPROVER;
    expectOk(await actions.approvePurchaseOrder(created.id));
    stored = await order(created.id);
    expect(stored.status).toBe('APPROVED');
    expect(stored.rejection_notes).toBeNull();
    expect(stored.rejections.map((r) => r.reason)).toEqual(
      expect.arrayContaining(['Precio alto', 'Falta el lugar de entrega'])
    );

    state.profileId = BUYER;
    expectOk(await actions.cancelPurchaseOrder(created.id, 'El proveedor no tiene stock'));
    expect(await requestStatus(req.id)).toBe('APPROVED');

    const detail = await actions.getPurchaseOrderDetail(created.id);
    expect(detail?.history.filter((h) => h.event === 'Rechazada')).toHaveLength(2);
  });

  it('totales calculados en el servidor', async () => {
    const actions = {
      ...(await import('./orders.server')),
      ...(await import('./order-send.server')),
      ...(await import('./order-queries.server')),
    };
    const req = await approvedRequest([3, 2]);
    const created = expectOk(
      await actions.createPurchaseOrder(
        orderForm([
          orderLine(req.lineIds[0], '3', { unitPrice: '0,3333' }),
          orderLine(req.lineIds[1], '2', { vatRateId: 4 }),
        ]),
        { submit: false }
      )
    );
    const stored = await order(created.id);
    expect(stored.subtotal.toFixed(2)).toBe('201.00');
    expect(stored.vat_total.toFixed(2)).toBe('21.21');
    expect(stored.total.toFixed(2)).toBe('222.21');
  });

  it('cantidades con coma y miles; precio con 5 decimales rechazado con mensaje', async () => {
    const actions = {
      ...(await import('./orders.server')),
      ...(await import('./order-send.server')),
      ...(await import('./order-queries.server')),
    };
    const req = await approvedRequest([2000]);
    const created = expectOk(
      await actions.createPurchaseOrder(orderForm([orderLine(req.lineIds[0], '1.234,5')]), { submit: false })
    );
    expect((await order(created.id)).lines[0].quantity.toString()).toBe('1234.5');
    const error = expectFail(
      await actions.createPurchaseOrder(orderForm([orderLine(req.lineIds[0], '1', { unitPrice: '1,23456' })]), {
        submit: false,
      })
    );
    expect(error).toContain('Precio inválido');
  });

  it('no pedir de mas: secuencial y con dos renglones sobre la misma linea', async () => {
    const actions = {
      ...(await import('./orders.server')),
      ...(await import('./order-send.server')),
      ...(await import('./order-queries.server')),
    };
    const req = await approvedRequest([10]);
    expectOk(await actions.createPurchaseOrder(orderForm([orderLine(req.lineIds[0], '6')]), { submit: false }));

    const error = expectFail(
      await actions.createPurchaseOrder(orderForm([orderLine(req.lineIds[0], '5')]), { submit: false })
    );
    expect(error).toBe(`De la línea 1 de ${req.number} ([AC-15] Aceite 15W40) quedan 4 l`);

    const split = expectFail(
      await actions.createPurchaseOrder(orderForm([orderLine(req.lineIds[0], '3'), orderLine(req.lineIds[0], '2')]), {
        submit: false,
      })
    );
    expect(split).toContain('quedan 4 l');

    expectOk(await actions.createPurchaseOrder(orderForm([orderLine(req.lineIds[0], '4')]), { submit: false }));
    const full = expectFail(
      await actions.createPurchaseOrder(orderForm([orderLine(req.lineIds[0], '1')]), { submit: false })
    );
    expect(full).toContain('no se pueden pedir'); // la solicitud quedo PEDIDA
  });

  it('editar un borrador sin cambios con la solicitud ya pedida por ese borrador', async () => {
    const actions = {
      ...(await import('./orders.server')),
      ...(await import('./order-send.server')),
      ...(await import('./order-queries.server')),
    };
    const req = await approvedRequest([5]);
    const created = expectOk(
      await actions.createPurchaseOrder(orderForm([orderLine(req.lineIds[0], '5')]), { submit: false })
    );
    expect(await requestStatus(req.id)).toBe('ORDERED');
    expectOk(
      await actions.updatePurchaseOrderDraft(
        created.id,
        orderForm([orderLine(req.lineIds[0], '5', { unitPrice: '120' })])
      )
    );
    expectOk(await actions.submitPurchaseOrder(created.id));
  });

  it('concurrencia: dos OC a la vez sobre la misma linea no piden de mas', async () => {
    const actions = {
      ...(await import('./orders.server')),
      ...(await import('./order-send.server')),
      ...(await import('./order-queries.server')),
    };
    const req = await approvedRequest([10]);
    const results = await Promise.all([
      actions.createPurchaseOrder(orderForm([orderLine(req.lineIds[0], '6')]), { submit: false }),
      actions.createPurchaseOrder(orderForm([orderLine(req.lineIds[0], '6')]), { submit: false }),
    ]);
    const oks = results.filter((r) => r.ok);
    const fails = results.filter((r): r is { ok: false; error: string } => !r.ok);
    expect(oks).toHaveLength(1);
    expect(fails).toHaveLength(1);
    expect(fails[0].error).toContain('quedan 4 l');
  });

  it('cerrar una solicitud: deja de ofrecerse; anular su OC no la reabre', async () => {
    const actions = {
      ...(await import('./orders.server')),
      ...(await import('./order-send.server')),
      ...(await import('./order-queries.server')),
    };
    const requests = await import('./requests.server');
    const req = await approvedRequest([10]);
    const created = expectOk(
      await actions.createPurchaseOrder(orderForm([orderLine(req.lineIds[0], '4')]), { submit: false })
    );

    expect(expectFail(await requests.closePurchaseRequest(req.id, ''))).toBeTruthy();
    expectOk(await requests.closePurchaseRequest(req.id, 'Se consiguió en otra obra'));
    expect(await requestStatus(req.id)).toBe('CLOSED');

    const search = await actions.searchOrderableRequestLines(req.number);
    expect(search.items).toHaveLength(0);

    // Lo ya pedido sigue su curso: el borrador se puede enviar.
    expectOk(await actions.submitPurchaseOrder(created.id));
    expectOk(await actions.cancelPurchaseOrder(created.id, 'Ya no hace falta'));
    expect(await requestStatus(req.id)).toBe('CLOSED');

    const pending = await approvedRequest([1]);
    const prisma = await db();
    await prisma.purchase_requests.update({ where: { id: pending.id }, data: { status: 'PENDING_APPROVAL' } });
    expect(expectFail(await requests.closePurchaseRequest(pending.id, 'x'))).toContain('ya fue');
  });

  it('perimetro y permisos', async () => {
    const actions = {
      ...(await import('./orders.server')),
      ...(await import('./order-send.server')),
      ...(await import('./order-queries.server')),
    };
    const req = await approvedRequest([10]);
    const foreign = await approvedRequest([10], OTHER_COMPANY);

    expect(
      expectFail(
        await actions.createPurchaseOrder(
          orderForm([orderLine(req.lineIds[0], '1')], { supplierId: FOREIGN_SUPPLIER }),
          { submit: false }
        )
      )
    ).toBe('El proveedor no existe');
    expect(
      expectFail(
        await actions.createPurchaseOrder(
          orderForm([orderLine(req.lineIds[0], '1')], { supplierId: INACTIVE_SUPPLIER }),
          { submit: false }
        )
      )
    ).toContain('inactivo');
    expect(
      expectFail(await actions.createPurchaseOrder(orderForm([orderLine(foreign.lineIds[0], '1')]), { submit: false }))
    ).toContain('no existe');

    const pending = await approvedRequest([1]);
    const prisma = await db();
    await prisma.purchase_requests.update({ where: { id: pending.id }, data: { status: 'PENDING_APPROVAL' } });
    expect(
      expectFail(await actions.createPurchaseOrder(orderForm([orderLine(pending.lineIds[0], '1')]), { submit: false }))
    ).toContain('pendiente de aprobación');

    const created = expectOk(
      await actions.createPurchaseOrder(orderForm([orderLine(req.lineIds[0], '1')]), { submit: true })
    );
    state.denied.add('compras:ordenes:approve');
    expect(expectFail(await actions.approvePurchaseOrder(created.id))).toBe(
      'No tenés permiso para realizar esta acción'
    );
  });

  it('el mail de la decision que falla no deshace la aprobacion', async () => {
    const actions = {
      ...(await import('./orders.server')),
      ...(await import('./order-send.server')),
      ...(await import('./order-queries.server')),
    };
    const req = await approvedRequest([1]);
    const created = expectOk(
      await actions.createPurchaseOrder(orderForm([orderLine(req.lineIds[0], '1')]), { submit: true })
    );
    state.decisionMailFails = true;
    expectOk(await actions.approvePurchaseOrder(created.id));
    expect((await order(created.id)).status).toBe('APPROVED');
  });

  it('envio al proveedor: con mail OK queda enviada con el PDF; si el mail falla sigue aprobada', async () => {
    const actions = {
      ...(await import('./orders.server')),
      ...(await import('./order-send.server')),
      ...(await import('./order-queries.server')),
    };
    const req = await approvedRequest([2]);
    const draft = expectOk(
      await actions.createPurchaseOrder(orderForm([orderLine(req.lineIds[0], '1')]), { submit: true })
    );
    expect(
      expectFail(await actions.sendPurchaseOrder(draft.id, { to: ['ventas@lubricantes.test'], message: '' }))
    ).toContain('no está aprobada');
    expectOk(await actions.approvePurchaseOrder(draft.id));

    state.supplierMailOk = false;
    expect(
      expectFail(await actions.sendPurchaseOrder(draft.id, { to: ['ventas@lubricantes.test'], message: '' }))
    ).toContain('la orden sigue aprobada');
    expect((await order(draft.id)).status).toBe('APPROVED');

    state.supplierMailOk = true;
    state.realPdf = true;
    expectOk(
      await actions.sendPurchaseOrder(draft.id, {
        to: ['ventas@lubricantes.test', 'compras@lubricantes.test'],
        message: 'Gracias',
      })
    );
    const stored = await order(draft.id);
    expect(stored.status).toBe('SENT');
    expect(stored.sent_to).toEqual(['ventas@lubricantes.test', 'compras@lubricantes.test']);
    const [call] = mails.supplier.mock.calls.at(-1) as unknown as [
      { attachment: { filename: string; content: Uint8Array } },
    ];
    expect(call.attachment.filename).toMatch(/^OC-\d{6}\.pdf$/);
    expect(Buffer.from(call.attachment.content).subarray(0, 4).toString()).toBe('%PDF');

    expectOk(await actions.cancelPurchaseOrder(draft.id, 'Error de carga'));
    expect(await requestStatus(req.id)).toBe('APPROVED');
  }, 30_000);

  it('marcar como enviada y PDF en borrador', async () => {
    const actions = {
      ...(await import('./orders.server')),
      ...(await import('./order-send.server')),
      ...(await import('./order-queries.server')),
    };
    const req = await approvedRequest([1]);
    const created = expectOk(
      await actions.createPurchaseOrder(orderForm([orderLine(req.lineIds[0], '1')]), { submit: true })
    );
    expectOk(await actions.approvePurchaseOrder(created.id));
    expectOk(await actions.markPurchaseOrderSent(created.id));
    const stored = await order(created.id);
    expect(stored.status).toBe('SENT');
    expect(stored.sent_to).toEqual([]);

    state.realPdf = true;
    const pdf = expectOk(await actions.getPurchaseOrderPdf(created.id));
    expect(Buffer.from(pdf.base64, 'base64').subarray(0, 4).toString()).toBe('%PDF');
  }, 30_000);

  it('detalle: avisos de documentos vencidos y destinatarios', async () => {
    const actions = {
      ...(await import('./orders.server')),
      ...(await import('./order-send.server')),
      ...(await import('./order-queries.server')),
    };
    const req = await approvedRequest([1]);
    const created = expectOk(
      await actions.createPurchaseOrder(orderForm([orderLine(req.lineIds[0], '1')]), { submit: false })
    );
    const detail = await actions.getPurchaseOrderDetail(created.id);
    expect(detail?.expiredDocuments.map((d) => d.name)).toEqual(['Constancia ARCA']);
    expect(detail?.recipients).toEqual([{ name: 'Ventas', email: 'ventas@lubricantes.test', isPrimary: true }]);
    expect(detail?.lines[0].available).toBe('1.0000');
  });

  // ── Revision final ─────────────────────────────────────────────────────────

  it('I-1: dos ediciones cruzadas de borradores no se bloquean ni dejan mal el avance', async () => {
    const actions = {
      ...(await import('./orders.server')),
      ...(await import('./order-send.server')),
      ...(await import('./order-queries.server')),
    };
    const r1 = await approvedRequest([10]);
    const r2 = await approvedRequest([10]);
    const o1 = expectOk(
      await actions.createPurchaseOrder(orderForm([orderLine(r2.lineIds[0], '5')]), { submit: false })
    );
    const o2 = expectOk(
      await actions.createPurchaseOrder(orderForm([orderLine(r1.lineIds[0], '5')]), { submit: false })
    );
    for (let round = 0; round < 5; round++) {
      const [a, b] = await Promise.all([
        actions.updatePurchaseOrderDraft(o1.id, orderForm([orderLine(round % 2 ? r2.lineIds[0] : r1.lineIds[0], '5')])),
        actions.updatePurchaseOrderDraft(o2.id, orderForm([orderLine(round % 2 ? r1.lineIds[0] : r2.lineIds[0], '5')])),
      ]);
      expect([a.ok, b.ok]).toEqual([true, true]);
    }
    const prisma = await db();
    const ordered = async (requestId: string) =>
      (
        await prisma.purchase_order_lines.aggregate({
          where: { request_line: { request_id: requestId }, order: { status: { not: 'CANCELLED' } } },
          _sum: { quantity: true },
        })
      )._sum.quantity?.toNumber() ?? 0;
    for (const r of [r1, r2]) {
      const expected =
        (await ordered(r.id)) === 0 ? 'APPROVED' : (await ordered(r.id)) >= 10 ? 'ORDERED' : 'PARTIALLY_ORDERED';
      expect(await requestStatus(r.id)).toBe(expected);
    }
  }, 60_000);

  it('I-2: precios e importes fuera de rango dan un mensaje, no un error de base', async () => {
    const actions = {
      ...(await import('./orders.server')),
      ...(await import('./order-send.server')),
      ...(await import('./order-queries.server')),
    };
    const req = await approvedRequest([1000]);
    expect(
      expectFail(
        await actions.createPurchaseOrder(orderForm([orderLine(req.lineIds[0], '1', { unitPrice: '100000000000' })]), {
          submit: false,
        })
      )
    ).toContain('Precio demasiado grande');
    expect(
      expectFail(
        await actions.createPurchaseOrder(
          orderForm([orderLine(req.lineIds[0], '1000', { unitPrice: '50000000000' })]),
          { submit: false }
        )
      )
    ).toContain('supera el máximo');
  });

  it('M-1: al editar con el plazo vacio se toma el del proveedor', async () => {
    const actions = {
      ...(await import('./orders.server')),
      ...(await import('./order-send.server')),
      ...(await import('./order-queries.server')),
    };
    const req = await approvedRequest([1]);
    const created = expectOk(
      await actions.createPurchaseOrder(orderForm([orderLine(req.lineIds[0], '1')], { paymentTermDays: '10' }), {
        submit: false,
      })
    );
    expectOk(await actions.updatePurchaseOrderDraft(created.id, orderForm([orderLine(req.lineIds[0], '1')])));
    expect((await order(created.id)).payment_term_days).toBe(30);
  });

  it('M-2: crear y enviar a aprobacion exige tambien Editar', async () => {
    const actions = {
      ...(await import('./orders.server')),
      ...(await import('./order-send.server')),
      ...(await import('./order-queries.server')),
    };
    const req = await approvedRequest([1]);
    state.denied.add('compras:ordenes:update');
    expect(
      expectFail(await actions.createPurchaseOrder(orderForm([orderLine(req.lineIds[0], '1')]), { submit: true }))
    ).toBe('No tenés permiso para realizar esta acción');
    expectOk(await actions.createPurchaseOrder(orderForm([orderLine(req.lineIds[0], '1')]), { submit: false }));
  });

  it('M-4: si se cambia el precio cotizado, la linea deja de figurar como de la cotizacion', async () => {
    const actions = {
      ...(await import('./orders.server')),
      ...(await import('./order-send.server')),
      ...(await import('./order-queries.server')),
    };
    const quotes = { ...(await import('./quotes.server')), ...(await import('./quote-send.server')) };
    const req = await approvedRequest([2]);
    const {
      quotes: [quote],
    } = expectOk(await quotes.requestQuotes({ requestLineIds: req.lineIds, supplierIds: [SUPPLIER], notes: '' }));
    expectOk(await quotes.markPurchaseQuoteSent(quote.id));
    const prisma = await db();
    const quoteLine = await prisma.purchase_quote_lines.findFirstOrThrow({ where: { quote_id: quote.id } });
    expectOk(
      await quotes.recordPurchaseQuoteResponse(quote.id, {
        receivedAt: '2026-10-08',
        validUntil: '',
        deliveryDays: '',
        supplierNotes: '',
        lines: [{ lineId: quoteLine.id, notQuoted: false, unitPrice: '100', vatRateId: 5 }],
      })
    );
    const created = expectOk(await actions.createPurchaseOrderFromQuote(quote.id));
    expectOk(
      await actions.updatePurchaseOrderDraft(
        created.id,
        orderForm([orderLine(req.lineIds[0], '2', { unitPrice: '90', quoteLineId: quoteLine.id })])
      )
    );
    const stored = await prisma.purchase_orders.findUniqueOrThrow({
      where: { id: created.id },
      select: { quote_id: true, lines: { select: { quote_line_id: true } } },
    });
    expect(stored.lines[0].quote_line_id).toBeNull();
    expect(stored.quote_id).toBeNull();
  });

  it('M-5: un borrador sobre una solicitud cerrada no puede pedir mas de lo que ya tenia', async () => {
    const actions = {
      ...(await import('./orders.server')),
      ...(await import('./order-send.server')),
      ...(await import('./order-queries.server')),
    };
    const requests = await import('./requests.server');
    const req = await approvedRequest([10]);
    const created = expectOk(
      await actions.createPurchaseOrder(orderForm([orderLine(req.lineIds[0], '4')]), { submit: false })
    );
    expectOk(await requests.closePurchaseRequest(req.id, 'No se compra más'));
    expect(
      expectFail(await actions.updatePurchaseOrderDraft(created.id, orderForm([orderLine(req.lineIds[0], '6')])))
    ).toContain('cerrada');
    expectOk(await actions.updatePurchaseOrderDraft(created.id, orderForm([orderLine(req.lineIds[0], '3')])));
  });

  it('M-7: si la OC se anula mientras sale el mail, se avisa en vez de decir enviada', async () => {
    const actions = {
      ...(await import('./orders.server')),
      ...(await import('./order-send.server')),
      ...(await import('./order-queries.server')),
    };
    const req = await approvedRequest([1]);
    const created = expectOk(
      await actions.createPurchaseOrder(orderForm([orderLine(req.lineIds[0], '1')]), { submit: true })
    );
    expectOk(await actions.approvePurchaseOrder(created.id));
    state.duringSend = async () => {
      state.duringSend = null;
      expectOk(await actions.cancelPurchaseOrder(created.id, 'Anulada mientras salía el mail'));
    };
    expect(
      expectFail(await actions.sendPurchaseOrder(created.id, { to: ['ventas@lubricantes.test'], message: '' }))
    ).toContain('El mail salió');
    expect((await order(created.id)).status).toBe('CANCELLED');
  });

  // ── Etapa 3 ────────────────────────────────────────────────────────────────

  it('cerrar una OC enviada sin recibir devuelve lo pedido a la solicitud', async () => {
    const actions = {
      ...(await import('./orders.server')),
      ...(await import('./order-send.server')),
      ...(await import('./order-queries.server')),
    };
    const req = await approvedRequest([10]);
    const draft = expectOk(
      await actions.createPurchaseOrder(orderForm([orderLine(req.lineIds[0], '10')]), { submit: true })
    );
    expect(expectFail(await actions.closePurchaseOrder(draft.id, 'No llega'))).toContain('ya fue');
    expectOk(await actions.approvePurchaseOrder(draft.id));
    expectOk(await actions.markPurchaseOrderSent(draft.id));
    expect(await requestStatus(req.id)).toBe('ORDERED');
    expect(expectFail(await actions.closePurchaseOrder(draft.id, ''))).toBeTruthy();
    expectOk(await actions.closePurchaseOrder(draft.id, 'El proveedor no tiene stock'));
    expect((await order(draft.id)).status).toBe('CLOSED');
    expect(await requestStatus(req.id)).toBe('APPROVED');
    const search = await actions.searchOrderableRequestLines(req.number);
    expect(search.items.map((i) => i.remaining)).toEqual(['10.0000']);
  });
});
