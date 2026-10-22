import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Pedidos de cotizacion (Compras etapa 2) contra el Postgres del compose: `npm run test:purchases`.
 * Sesion, empresa activa, permisos y mails simulados; PDF real en el envio.
 */

const COMPANY = 'd4000000-0000-4000-8000-000000000001';
const OTHER_COMPANY = 'd4000000-0000-4000-8000-000000000002';
const BUYER = 'd4000000-0000-4000-8000-000000000003';
const UNIT = 'd4000000-0000-4000-8000-000000000010';
const MATERIAL = 'd4000000-0000-4000-8000-000000000020';
const SUPPLIER_A = 'd4000000-0000-4000-8000-000000000030';
const SUPPLIER_B = 'd4000000-0000-4000-8000-000000000031';
const FOREIGN_SUPPLIER = 'd4000000-0000-4000-8000-000000000032';

const state = vi.hoisted(() => ({
  denied: new Set<string>(),
  supplierMailOk: true,
}));
const mails = vi.hoisted(() => ({
  supplier: vi.fn(async () => state.supplierMailOk),
  decision: vi.fn(async () => true),
}));

vi.mock('@/shared/lib/tenant', () => ({ getActiveCompanyId: async () => 'd4000000-0000-4000-8000-000000000001' }));
vi.mock('@/features/Permissions/actions/permissions.server', () => ({
  checkPermissionServer: async (module: string, tab: string, action: string) =>
    !state.denied.has(`${module}:${tab}:${action}`),
}));
vi.mock('@/shared/actions/auth.actions', () => {
  const current = () => ({
    id: 'd4000000-0000-4000-8000-000000000003',
    credentialId: 'x',
    fullname: null,
    email: null,
  });
  return { getServerAuthProfile: async () => current(), requireServerAuthProfile: async () => current() };
});
// Las plantillas de aviso solo arman el contenido (#786); el envío al proveedor sí se captura.
vi.mock('@/shared/lib/mail/templates/purchases', async (importActual) => ({
  ...(await importActual<typeof import('@/shared/lib/mail/templates/purchases')>()),
  sendSupplierDocumentEmail: mails.supplier,
}));
// Los avisos internos los entrega el despachador de #786; acá no se prueban.
vi.mock('@/features/Notifications/lib/dispatch.server', () => ({ notifySafe: async () => undefined }));
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
  await prisma.profile.deleteMany({ where: { id: BUYER } });
  await prisma.company.deleteMany({ where: { id: company_id } });
}

let counter = 0;

async function approvedRequest(quantities: number[]) {
  const prisma = await db();
  counter += 1;
  const created = await prisma.purchase_requests.create({
    data: {
      company_id: COMPANY,
      number: `SC-Q${String(counter).padStart(4, '0')}`,
      status: 'APPROVED',
      requested_by: BUYER,
      decided_by: BUYER,
      decided_at: new Date(),
      lines: {
        create: quantities.map((quantity, i) =>
          i === 0
            ? { position: i + 1, material_id: MATERIAL, quantity, unit_id: UNIT }
            : { position: i + 1, description: `Servicio ${i}`, quantity, unit_id: UNIT }
        ),
      },
    },
    select: { id: true, number: true, lines: { select: { id: true }, orderBy: { position: 'asc' } } },
  });
  return { id: created.id, number: created.number, lineIds: created.lines.map((l) => l.id) };
}

function expectOk<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(`Se esperaba ok y vino: ${result.error}`);
  return result.data;
}

function expectFail(result: { ok: true } | { ok: false; error: string }): string {
  if (result.ok) throw new Error('Se esperaba un error');
  return result.error;
}

async function quoteLines(quoteId: string) {
  const prisma = await db();
  return prisma.purchase_quote_lines.findMany({
    where: { quote_id: quoteId },
    select: { id: true, request_line_id: true, quantity: true },
  });
}

async function quoteStatus(id: string) {
  const prisma = await db();
  return (await prisma.purchase_quotes.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
}

/** Respuesta: precio por linea (en el orden de `requestLineIds`), `null` = no cotiza. */
async function respond(quoteId: string, requestLineIds: string[], prices: (string | null)[]) {
  const actions = { ...(await import('./quotes.server')), ...(await import('./quote-queries.server')) };
  const lines = await quoteLines(quoteId);
  return actions.recordPurchaseQuoteResponse(quoteId, {
    receivedAt: '2026-10-08',
    validUntil: '2026-10-30',
    deliveryDays: '5',
    supplierNotes: '',
    lines: requestLineIds.map((requestLineId, i) => {
      const line = lines.find((candidate) => candidate.request_line_id === requestLineId)!;
      const price = prices[i];
      return price === null
        ? { lineId: line.id, notQuoted: true, unitPrice: '', vatRateId: null }
        : { lineId: line.id, notQuoted: false, unitPrice: price, vatRateId: 5 };
    }),
  });
}

describe.skipIf(!RUN)('pedidos de cotizacion (integracion)', () => {
  beforeAll(async () => {
    await cleanup();
    const prisma = await db();
    const city = await prisma.cities.findFirstOrThrow({ select: { id: true } });
    for (const [id, cuit] of [
      [COMPANY, '30999999972'],
      [OTHER_COMPANY, '30999999973'],
    ] as const) {
      await prisma.company.create({
        data: {
          id,
          company_name: `Cotizaciones test ${cuit}`,
          description: 'empresa de prueba',
          contact_email: 'cotizaciones-test@alphataco.local',
          contact_phone: '+542991234567',
          address: 'Calle 123',
          city: city.id,
          country: 'argentina',
          industry: 'Petroleo',
          company_cuit: cuit,
        },
      });
    }
    await prisma.profile.create({ data: { id: BUYER, credential_id: BUYER, email: 'comprador-pc@alphataco.local' } });
    await prisma.measurement_units.create({
      data: { id: UNIT, company_id: COMPANY, name: 'Unidad test', abbreviation: 'u' },
    });
    await prisma.materials.create({
      data: { id: MATERIAL, company_id: COMPANY, code: 'FIL-01', name: 'Filtro', unit_id: UNIT },
    });
    await prisma.suppliers.createMany({
      data: [
        { id: SUPPLIER_A, company_id: COMPANY, name: 'A Proveedor', cuit: BigInt('20123456786'), vat_condition_id: 1 },
        { id: SUPPLIER_B, company_id: COMPANY, name: 'B Proveedor', cuit: BigInt('20111111112'), vat_condition_id: 1 },
        {
          id: FOREIGN_SUPPLIER,
          company_id: OTHER_COMPANY,
          name: 'Ajeno',
          cuit: BigInt('20123456786'),
          vat_condition_id: 1,
        },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    await cleanup();
  }, 60_000);

  beforeEach(() => {
    state.denied.clear();
    state.supplierMailOk = true;
    mails.supplier.mockClear();
  });

  it('pedir a dos proveedores crea un pedido por proveedor con lo que falta', async () => {
    const actions = { ...(await import('./quotes.server')), ...(await import('./quote-queries.server')) };
    const orders = { ...(await import('./orders.server')), ...(await import('./order-queries.server')) };
    const req = await approvedRequest([10, 2]);
    expectOk(
      await orders.createPurchaseOrder(
        {
          supplierId: SUPPLIER_A,
          deliveryDate: '',
          deliveryPlace: '',
          paymentTermDays: '',
          notes: '',
          lines: [{ requestLineId: req.lineIds[0], quoteLineId: '', quantity: '4', unitPrice: '1', vatRateId: 5 }],
        },
        { submit: false }
      )
    );

    const { quotes } = expectOk(
      await actions.requestQuotes({ requestLineIds: req.lineIds, supplierIds: [SUPPLIER_B, SUPPLIER_A], notes: '' })
    );
    expect(quotes.map((q) => q.supplierName)).toEqual(['A Proveedor', 'B Proveedor']);
    expect(quotes[0].number).toMatch(/^PC-\d{6}$/);
    const lines = await quoteLines(quotes[0].id);
    const byRequestLine = new Map(lines.map((l) => [l.request_line_id, l.quantity.toString()]));
    expect(byRequestLine.get(req.lineIds[0])).toBe('6');
    expect(byRequestLine.get(req.lineIds[1])).toBe('2');
  });

  it('enviar por mail: OK queda enviada con PDF; si el mail falla sigue en borrador; marcar como enviada', async () => {
    const actions = { ...(await import('./quotes.server')), ...(await import('./quote-queries.server')) };
    const req = await approvedRequest([3]);
    const { quotes } = expectOk(
      await actions.requestQuotes({ requestLineIds: req.lineIds, supplierIds: [SUPPLIER_A, SUPPLIER_B], notes: '' })
    );

    state.supplierMailOk = false;
    expect(expectFail(await actions.sendPurchaseQuote(quotes[0].id, { to: ['ventas@a.test'], message: '' }))).toContain(
      'la cotización sigue en borrador'
    );
    expect(await quoteStatus(quotes[0].id)).toBe('DRAFT');

    state.supplierMailOk = true;
    expectOk(await actions.sendPurchaseQuote(quotes[0].id, { to: ['ventas@a.test'], message: '' }));
    expect(await quoteStatus(quotes[0].id)).toBe('SENT');
    const [call] = mails.supplier.mock.calls.at(-1) as unknown as [
      { kind: string; attachment: { filename: string; content: Uint8Array } },
    ];
    expect(call.kind).toBe('quote');
    expect(call.attachment.filename).toBe(`${quotes[0].number}.pdf`);
    expect(Buffer.from(call.attachment.content).subarray(0, 4).toString()).toBe('%PDF');

    expect(expectFail(await actions.sendPurchaseQuote(quotes[0].id, { to: ['ventas@a.test'], message: '' }))).toContain(
      'ya fue enviada'
    );

    expectOk(await actions.markPurchaseQuoteSent(quotes[1].id));
    expect(await quoteStatus(quotes[1].id)).toBe('SENT');
  }, 30_000);

  it('respuesta, correccion, comparativo y OC desde la mejor', async () => {
    const actions = { ...(await import('./quotes.server')), ...(await import('./quote-queries.server')) };
    const orders = { ...(await import('./orders.server')), ...(await import('./order-queries.server')) };
    const req = await approvedRequest([10, 1]);
    const { quotes } = expectOk(
      await actions.requestQuotes({ requestLineIds: req.lineIds, supplierIds: [SUPPLIER_A, SUPPLIER_B], notes: '' })
    );
    const [qa, qb] = quotes;
    expectOk(await actions.markPurchaseQuoteSent(qa.id));
    expectOk(await actions.markPurchaseQuoteSent(qb.id));

    // Sin ninguna linea con precio: se rechaza (para eso esta "No cotiza").
    expect(expectFail(await respond(qa.id, req.lineIds, [null, null]))).toContain('No cotiza');

    expectOk(await respond(qa.id, req.lineIds, ['100,5', null]));
    expectOk(await respond(qb.id, req.lineIds, ['100.5000', '30']));
    expect(await quoteStatus(qa.id)).toBe('RECEIVED');
    // Corregir mientras no tenga OC.
    expectOk(await respond(qb.id, req.lineIds, ['99', '30']));

    const comparison = await actions.getRequestQuoteComparison(req.id);
    expect(comparison?.columns.map((c) => c.supplierName)).toEqual(['A Proveedor', 'B Proveedor']);
    expect(comparison?.rows[0].bestQuoteIds).toEqual([qb.id]);
    expect(comparison?.rows[1].cells[qa.id]).toEqual({ state: 'not_quoted' });
    expect(comparison?.rows[1].bestQuoteIds).toEqual([qb.id]);

    // Pedimos 4 de la linea 1 por fuera; la OC desde B toma lo que falta (6) y la linea 2 (1).
    expectOk(
      await orders.createPurchaseOrder(
        {
          supplierId: SUPPLIER_A,
          deliveryDate: '',
          deliveryPlace: '',
          paymentTermDays: '',
          notes: '',
          lines: [{ requestLineId: req.lineIds[0], quoteLineId: '', quantity: '4', unitPrice: '100.5', vatRateId: 5 }],
        },
        { submit: false }
      )
    );
    const fromB = expectOk(await orders.createPurchaseOrderFromQuote(qb.id));
    expect(fromB.skipped).toBe(0);
    const prisma = await db();
    const created = await prisma.purchase_orders.findUniqueOrThrow({
      where: { id: fromB.id },
      select: {
        quote_id: true,
        supplier_id: true,
        lines: { select: { quantity: true, unit_price: true }, orderBy: { position: 'asc' } },
      },
    });
    expect(created.quote_id).toBe(qb.id);
    expect(created.supplier_id).toBe(SUPPLIER_B);
    expect(created.lines.map((l) => [l.quantity.toString(), l.unit_price.toString()]).sort()).toEqual([
      ['1', '30'],
      ['6', '99'],
    ]);

    // Con OC, la cotizacion ya no se corrige; y desde A no queda nada por pedir.
    expect(expectFail(await respond(qb.id, req.lineIds, ['98', '30']))).toContain('ya tiene una orden de compra');
    expect(expectFail(await orders.createPurchaseOrderFromQuote(qa.id))).toBe(
      'No queda nada por pedir de esta cotización'
    );
  });

  it('no cotiza, anular y transiciones invalidas', async () => {
    const actions = { ...(await import('./quotes.server')), ...(await import('./quote-queries.server')) };
    const req = await approvedRequest([1]);
    const { quotes } = expectOk(
      await actions.requestQuotes({ requestLineIds: req.lineIds, supplierIds: [SUPPLIER_A, SUPPLIER_B], notes: '' })
    );
    expect(expectFail(await actions.declinePurchaseQuote(quotes[0].id))).toContain('ya fue');
    expectOk(await actions.markPurchaseQuoteSent(quotes[0].id));
    expectOk(await actions.declinePurchaseQuote(quotes[0].id));
    expect(await quoteStatus(quotes[0].id)).toBe('DECLINED');

    expect(expectFail(await actions.cancelPurchaseQuote(quotes[1].id, ''))).toBeTruthy();
    expectOk(await actions.cancelPurchaseQuote(quotes[1].id, 'Ya no hace falta'));
    expect(await quoteStatus(quotes[1].id)).toBe('CANCELLED');
    expect(expectFail(await actions.cancelPurchaseQuote(quotes[1].id, 'otra vez'))).toContain('ya fue anulada');

    const answered = expectOk(
      await actions.requestQuotes({ requestLineIds: req.lineIds, supplierIds: [SUPPLIER_A], notes: '' })
    ).quotes[0];
    expectOk(await actions.markPurchaseQuoteSent(answered.id));
    expectOk(await respond(answered.id, req.lineIds, ['5']));
    expect(expectFail(await actions.cancelPurchaseQuote(answered.id, 'x'))).toContain('ya fue respondida');
  });

  it('perimetro y permisos', async () => {
    const actions = { ...(await import('./quotes.server')), ...(await import('./quote-queries.server')) };
    const req = await approvedRequest([1]);
    expect(
      expectFail(
        await actions.requestQuotes({ requestLineIds: req.lineIds, supplierIds: [FOREIGN_SUPPLIER], notes: '' })
      )
    ).toBe('Uno de los proveedores no existe');

    const other = expectOk(
      await actions.requestQuotes({ requestLineIds: req.lineIds, supplierIds: [SUPPLIER_A], notes: '' })
    ).quotes[0];
    const otherReq = await approvedRequest([1]);
    expectOk(await actions.markPurchaseQuoteSent(other.id));
    const foreignLine = (await quoteLines(other.id))[0];
    // Una linea que no es de la cotizacion: rechazada.
    const mine = expectOk(
      await actions.requestQuotes({ requestLineIds: otherReq.lineIds, supplierIds: [SUPPLIER_A], notes: '' })
    ).quotes[0];
    expectOk(await actions.markPurchaseQuoteSent(mine.id));
    expect(
      expectFail(
        await actions.recordPurchaseQuoteResponse(mine.id, {
          receivedAt: '2026-10-08',
          validUntil: '',
          deliveryDays: '',
          supplierNotes: '',
          lines: [{ lineId: foreignLine.id, notQuoted: false, unitPrice: '1', vatRateId: 5 }],
        })
      )
    ).toContain('no corresponden');

    const prisma = await db();
    await prisma.purchase_quotes.update({ where: { id: mine.id }, data: { company_id: OTHER_COMPANY } });
    expect(await actions.getPurchaseQuoteDetail(mine.id)).toBeNull();
    await prisma.purchase_quotes.update({ where: { id: mine.id }, data: { company_id: COMPANY } });

    state.denied.add('compras:cotizaciones:create');
    expect(
      expectFail(await actions.requestQuotes({ requestLineIds: req.lineIds, supplierIds: [SUPPLIER_A], notes: '' }))
    ).toBe('No tenés permiso para realizar esta acción');
  });
});
