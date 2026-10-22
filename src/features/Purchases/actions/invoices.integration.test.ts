import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Facturas de proveedor y Libro IVA Compras (Compras etapa 4) contra el Postgres del compose:
 * `npm run test:purchases`. Se simulan la sesion, la empresa activa, los permisos y los mails; las
 * OC y las recepciones se arman con las actions reales (lineas de servicio: no tocan stock).
 */

const COMPANY = 'd6000000-0000-4000-8000-000000000001';
const OTHER_COMPANY = 'd6000000-0000-4000-8000-000000000002';
const BUYER = 'd6000000-0000-4000-8000-000000000003';
const UNIT = 'd6000000-0000-4000-8000-000000000010';
const SUPPLIER = 'd6000000-0000-4000-8000-000000000030';
const MONO_SUPPLIER = 'd6000000-0000-4000-8000-000000000031';
const OTHER_SUPPLIER = 'd6000000-0000-4000-8000-000000000032';
const FOREIGN_SUPPLIER = 'd6000000-0000-4000-8000-000000000033';
const FOREIGN_CATEGORY = 'd6000000-0000-4000-8000-000000000040';

const state = vi.hoisted(() => ({ denied: new Set<string>() }));
const mails = vi.hoisted(() => ({ any: vi.fn(async () => true) }));

vi.mock('@/shared/lib/tenant', () => ({ getActiveCompanyId: async () => 'd6000000-0000-4000-8000-000000000001' }));
vi.mock('@/features/Permissions/actions/permissions.server', () => ({
  checkPermissionServer: async (module: string, tab: string, action: string) =>
    !state.denied.has(`${module}:${tab}:${action}`),
}));
vi.mock('@/shared/actions/auth.actions', () => {
  const current = () => ({
    id: 'd6000000-0000-4000-8000-000000000003',
    credentialId: 'd6000000-0000-4000-8000-000000000003',
    fullname: null,
    email: null,
  });
  return { getServerAuthProfile: async () => current(), requireServerAuthProfile: async () => current() };
});
// Las plantillas de aviso solo arman el contenido (#786); el envío al proveedor sí se captura.
vi.mock('@/shared/lib/mail/templates/purchases', async (importActual) => ({
  ...(await importActual<typeof import('@/shared/lib/mail/templates/purchases')>()),
  sendSupplierDocumentEmail: mails.any,
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
  await prisma.treasury_movements.deleteMany({ where: { company_id } });
  await prisma.payment_orders.deleteMany({ where: { company_id } });
  await prisma.supplier_invoices.updateMany({ where: { company_id }, data: { related_invoice_id: null } });
  await prisma.supplier_invoices.deleteMany({ where: { company_id } });
  await prisma.purchase_expense_categories.deleteMany({ where: { company_id } });
  await prisma.purchase_orders.updateMany({
    where: { company_id },
    data: { complements_order_id: null, complements_receipt_id: null },
  });
  await prisma.purchase_receipts.deleteMany({ where: { company_id } });
  await prisma.purchase_orders.deleteMany({ where: { company_id } });
  await prisma.purchase_requests.deleteMany({ where: { company_id } });
  await prisma.suppliers.deleteMany({ where: { company_id } });
  await prisma.measurement_units.deleteMany({ where: { company_id } });
  await prisma.company_fiscal_profiles.deleteMany({ where: { company_id } });
  await prisma.profile.deleteMany({ where: { id: BUYER } });
  await prisma.company.deleteMany({ where: { id: company_id } });
}

function expectOk<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(`Se esperaba ok y vino: ${result.error}`);
  return result.data;
}

function expectFail(result: { ok: true } | { ok: false; error: string }): string {
  if (result.ok) throw new Error('Se esperaba un error');
  return result.error;
}

let counter = 0;

/** Solicitud aprobada + OC enviada con lineas de servicio, recibida en `received` (si se indica). */
async function receivedOrder(
  plans: { quantity: number; price?: string; received?: number; vatRateId?: number }[],
  supplierId = SUPPLIER
) {
  const prisma = await db();
  const orders = { ...(await import('./orders.server')), ...(await import('./order-queries.server')) };
  const receipts = await import('./receipts.server');
  counter += 1;
  const request = await prisma.purchase_requests.create({
    data: {
      company_id: COMPANY,
      number: `SC-F${String(counter).padStart(4, '0')}`,
      status: 'APPROVED',
      requested_by: BUYER,
      decided_by: BUYER,
      decided_at: new Date(),
      lines: {
        create: plans.map((p, i) => ({
          position: i + 1,
          description: `Servicio ${i + 1}`,
          quantity: p.quantity,
          unit_id: UNIT,
        })),
      },
    },
    select: { id: true, lines: { select: { id: true }, orderBy: { position: 'asc' } } },
  });
  const created = await orders.createPurchaseOrder(
    {
      supplierId,
      deliveryDate: '',
      deliveryPlace: '',
      paymentTermDays: '',
      notes: '',
      lines: plans.map((p, i) => ({
        requestLineId: request.lines[i]!.id,
        quoteLineId: '',
        quantity: String(p.quantity),
        unitPrice: p.price ?? '1200',
        vatRateId: p.vatRateId ?? 5,
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
  const toReceive = plans.flatMap((p, i) =>
    p.received ? [{ orderLineId: lines[i]!.id, quantity: String(p.received) }] : []
  );
  if (toReceive.length > 0) {
    const receipt = await receipts.createPurchaseReceipt({
      orderId: created.data.id,
      warehouseId: '',
      receivedOn: '2026-10-02',
      deliveryNote: '',
      notes: '',
      lines: toReceive.map((l) => ({ ...l, batchNumber: '', batchExpiresOn: '', serialNumbers: '' })),
    });
    if (!receipt.ok) throw new Error(receipt.error);
  }
  return { id: created.data.id, number: created.data.number, lineIds: lines.map((l) => l.id) };
}

let invoiceNumber = 1000;

type FormValues = import('../schemas/invoices').SupplierInvoiceFormValues;
type FormLine = FormValues['lines'][number];

const orderLine = (orderLineId: string, quantity: string, unitPrice = '1200', vatRateId = '5'): FormLine => ({
  kind: 'order',
  orderLineId,
  expenseCategoryId: '',
  description: '',
  quantity,
  unitPrice,
  net: '',
  vatRateId,
});

/** IVA calculado de las lineas (como lo precarga el formulario). */
function computedVat(cbteType: number, lines: FormLine[]): FormValues['vat'] {
  if (cbteType >= 11) return [];
  const bases = new Map<number, number>();
  for (const l of lines) {
    const net = l.kind === 'order' ? Number(l.quantity) * Number(l.unitPrice) : Number(l.net.replace(',', '.'));
    bases.set(Number(l.vatRateId), (bases.get(Number(l.vatRateId)) ?? 0) + net);
  }
  const rates: Record<number, number> = { 3: 0, 4: 10.5, 5: 21, 6: 27, 8: 5, 9: 2.5 };
  return [...bases.entries()].map(([vatRateId, base]) => ({
    vatRateId,
    amount: (Math.round(base * rates[vatRateId]!) / 100).toFixed(2),
  }));
}

function invoiceForm(lines: FormLine[], over: Partial<FormValues> = {}): FormValues {
  invoiceNumber += 1;
  const cbteType = over.cbteType ?? 1;
  return {
    supplierId: SUPPLIER,
    cbteType,
    salesPoint: '3',
    number: String(invoiceNumber),
    issueDate: '2026-10-03',
    dueDate: '',
    vatPeriod: '2026-10',
    cae: '',
    caeDueDate: '',
    relatedInvoiceId: '',
    notes: '',
    lines,
    vat: computedVat(cbteType, lines),
    untaxed: '',
    exempt: '',
    taxes: [],
    ...over,
  };
}

async function invoiceRow(id: string) {
  const prisma = await db();
  return prisma.supplier_invoices.findUniqueOrThrow({
    where: { id },
    select: { status: true, total: true, observations: true, resolution_comment: true, cancelled_at: true },
  });
}

const codes = (observations: { code: string }[]) => observations.map((o) => o.code);

describe.skipIf(!RUN)('facturas de proveedor (integracion)', () => {
  beforeAll(async () => {
    await cleanup();
    const prisma = await db();
    const city = await prisma.cities.findFirstOrThrow({ select: { id: true } });
    for (const [id, cuit] of [
      [COMPANY, '30999999950'],
      [OTHER_COMPANY, '30999999951'],
    ] as const) {
      await prisma.company.create({
        data: {
          id,
          company_name: `Facturas test ${cuit}`,
          description: 'empresa de prueba',
          contact_email: 'facturas-test@alphataco.local',
          contact_phone: '+542991234567',
          address: 'Calle 123',
          city: city.id,
          country: 'argentina',
          industry: 'Petroleo',
          company_cuit: cuit,
        },
      });
    }
    await prisma.company_fiscal_profiles.create({
      data: {
        company_id: COMPANY,
        tax_condition: 'responsable_inscripto',
        activity_start_date: new Date('2020-01-01'),
        fiscal_street: 'Calle 123',
        fiscal_city: 'Neuquén',
        fiscal_postal_code: '8300',
      },
    });
    await prisma.profile.create({ data: { id: BUYER, credential_id: BUYER, email: 'facturas@alphataco.local' } });
    await prisma.measurement_units.create({
      data: { id: UNIT, company_id: COMPANY, name: 'Unidad fc', abbreviation: 'u' },
    });
    await prisma.suppliers.createMany({
      data: [
        {
          id: SUPPLIER,
          company_id: COMPANY,
          name: 'Repuestos del Sur',
          cuit: BigInt('30712345678'),
          vat_condition_id: 1,
        },
        {
          id: MONO_SUPPLIER,
          company_id: COMPANY,
          name: 'Juan Electricista',
          cuit: BigInt('20123456786'),
          vat_condition_id: 6,
        },
        {
          id: OTHER_SUPPLIER,
          company_id: COMPANY,
          name: 'Otro proveedor',
          cuit: BigInt('30711111119'),
          vat_condition_id: 1,
        },
        {
          id: FOREIGN_SUPPLIER,
          company_id: OTHER_COMPANY,
          name: 'Ajeno',
          cuit: BigInt('30722222228'),
          vat_condition_id: 1,
        },
      ],
    });
    await prisma.purchase_expense_categories.create({
      data: { id: FOREIGN_CATEGORY, company_id: OTHER_COMPANY, name: 'Ajeno' },
    });
  }, 60_000);

  afterAll(async () => {
    await cleanup();
  }, 60_000);

  beforeEach(() => {
    state.denied.clear();
  });

  describe('conceptos de gasto', () => {
    it('alta, duplicado sin distinguir mayusculas, renombrar y desactivar', async () => {
      const actions = await import('./expense-categories.server');
      const light = expectOk(await actions.createExpenseCategory({ name: 'Luz' }));
      expect(expectFail(await actions.createExpenseCategory({ name: ' luz ' }))).toBe('Ya existe el concepto «Luz»');
      const fees = expectOk(await actions.createExpenseCategory({ name: 'Honorarios' }));
      expect(expectFail(await actions.renameExpenseCategory(fees.id, { name: 'LUZ' }))).toBe(
        'Ya existe el concepto «Luz»'
      );
      expectOk(await actions.renameExpenseCategory(light.id, { name: 'Energía eléctrica' }));
      expectOk(await actions.setExpenseCategoryActive(light.id, false));
      const rows = await actions.getExpenseCategories();
      expect(rows.map((r) => [r.name, r.is_active])).toEqual([
        ['Energía eléctrica', false],
        ['Honorarios', true],
      ]);
    });

    it('perimetro y permisos', async () => {
      const actions = await import('./expense-categories.server');
      expect(expectFail(await actions.renameExpenseCategory(FOREIGN_CATEGORY, { name: 'X' }))).toBe(
        'El concepto no existe'
      );
      expect(expectFail(await actions.setExpenseCategoryActive(FOREIGN_CATEGORY, false))).toBe('El concepto no existe');
      state.denied.add('compras:config-compras:update');
      expect(expectFail(await actions.createExpenseCategory({ name: 'Fletes' }))).toBe(
        'No tenés permiso para realizar esta acción'
      );
    });
  });

  describe('carga y control contra la OC', () => {
    it('conforme: factura A de lo recibido al precio de la OC; totales calculados', async () => {
      const actions = { ...(await import('./invoices.server')), ...(await import('./invoice-queries.server')) };
      const order = await receivedOrder([{ quantity: 10, received: 10 }]);
      const created = expectOk(
        await actions.createSupplierInvoice(
          invoiceForm([orderLine(order.lineIds[0]!, '10')], {
            taxes: [{ kind: 'VAT_PERCEPTION', provinceId: '', description: '', amount: '300' }],
          })
        )
      );
      expect(created.status).toBe('CONFORMING');
      expect(created.observations).toEqual([]);
      expect(created.label).toMatch(/^Factura A 00003-\d{8}$/);
      const row = await invoiceRow(created.id);
      expect(row.total.toString()).toBe('14820');
      const prisma = await db();
      const vat = await prisma.supplier_invoice_vat.findMany({
        where: { invoice_id: created.id },
        select: { vat_rate_id: true, base: true, amount: true },
      });
      expect(vat.map((v) => [v.vat_rate_id, v.base.toString(), v.amount.toString()])).toEqual([[5, '12000', '2520']]);
    });

    it('observaciones: letra, IVA, precio, alicuota y cantidad', async () => {
      const actions = { ...(await import('./invoices.server')), ...(await import('./invoice-queries.server')) };
      const order = await receivedOrder([
        { quantity: 10, received: 10 },
        { quantity: 5, received: 5 },
      ]);
      const lines = [orderLine(order.lineIds[0]!, '12', '1250'), orderLine(order.lineIds[1]!, '5', '1200', '4')];
      const values = invoiceForm(lines, { cbteType: 6 });
      values.vat = values.vat.map((v) => (v.vatRateId === 5 ? { ...v, amount: (Number(v.amount) + 5).toFixed(2) } : v));
      const created = expectOk(await actions.createSupplierInvoice(values));
      expect(created.status).toBe('OBSERVED');
      expect(codes(created.observations).sort()).toEqual(['LETTER', 'PRICE', 'QUANTITY', 'VAT', 'VAT_RATE']);
      expect(created.observations.find((o) => o.code === 'QUANTITY')?.message).toBe(
        `Servicio 1: facturado 12 u, recibido 10 u en la ${order.number}`
      );
    });

    it('errores: OC de otro proveedor, OC no aprobada, duplicado', async () => {
      const actions = { ...(await import('./invoices.server')), ...(await import('./invoice-queries.server')) };
      const order = await receivedOrder([{ quantity: 2, received: 2 }]);
      expect(
        expectFail(
          await actions.createSupplierInvoice(
            invoiceForm([orderLine(order.lineIds[0]!, '2')], { supplierId: OTHER_SUPPLIER })
          )
        )
      ).toBe(`Servicio 1: la ${order.number} es de otro proveedor`);

      const prisma = await db();
      const draft = await prisma.purchase_orders.update({
        where: { id: order.id },
        data: { status: 'DRAFT' },
        select: { id: true },
      });
      expect(expectFail(await actions.createSupplierInvoice(invoiceForm([orderLine(order.lineIds[0]!, '2')])))).toBe(
        `La ${order.number} no está aprobada`
      );
      await prisma.purchase_orders.update({ where: { id: draft.id }, data: { status: 'RECEIVED' } });

      const values = invoiceForm([orderLine(order.lineIds[0]!, '2')]);
      expectOk(await actions.createSupplierInvoice(values));
      expect(expectFail(await actions.createSupplierInvoice({ ...values }))).toBe(
        `Ya está cargada la Factura A 00003-${values.number.padStart(8, '0')} de Repuestos del Sur`
      );
    });

    it('aprobar y rechazar solo observados y con permiso', async () => {
      const actions = { ...(await import('./invoices.server')), ...(await import('./invoice-queries.server')) };
      const order = await receivedOrder([{ quantity: 3, received: 3 }]);
      const conform = expectOk(await actions.createSupplierInvoice(invoiceForm([orderLine(order.lineIds[0]!, '1')])));
      expect(expectFail(await actions.approveSupplierInvoice(conform.id, 'ok'))).toContain('no está observada');

      const observed = expectOk(
        await actions.createSupplierInvoice(invoiceForm([orderLine(order.lineIds[0]!, '1', '1300')]))
      );
      state.denied.add('compras:facturas:approve');
      expect(expectFail(await actions.approveSupplierInvoice(observed.id, 'ok'))).toBe(
        'No tenés permiso para realizar esta acción'
      );
      state.denied.clear();
      expect(expectFail(await actions.approveSupplierInvoice(observed.id, ' '))).toBe('Indicá el motivo');
      expectOk(await actions.approveSupplierInvoice(observed.id, 'Aumento acordado por teléfono'));
      expect((await invoiceRow(observed.id)).status).toBe('APPROVED');

      const other = expectOk(
        await actions.createSupplierInvoice(invoiceForm([orderLine(order.lineIds[0]!, '1', '1300')]))
      );
      expectOk(await actions.rejectSupplierInvoice(other.id, 'Precio no acordado'));
      const rejected = await invoiceRow(other.id);
      expect(rejected.status).toBe('REJECTED');
      expect(rejected.resolution_comment).toBe('Precio no acordado');
    });

    it('una NC libera cantidad; un rechazado no cuenta; anular libera', async () => {
      const actions = { ...(await import('./invoices.server')), ...(await import('./invoice-queries.server')) };
      const order = await receivedOrder([{ quantity: 10, received: 10 }]);
      const line = order.lineIds[0]!;
      const invoice = expectOk(await actions.createSupplierInvoice(invoiceForm([orderLine(line, '10')])));
      const credit = expectOk(
        await actions.createSupplierInvoice(
          invoiceForm([orderLine(line, '2')], { cbteType: 3, relatedInvoiceId: invoice.id })
        )
      );
      expect(credit.status).toBe('CONFORMING');
      const next = expectOk(await actions.createSupplierInvoice(invoiceForm([orderLine(line, '2')])));
      expect(next.status).toBe('CONFORMING');

      // NC que deja lo facturado en negativo
      expect(
        expectFail(await actions.createSupplierInvoice(invoiceForm([orderLine(line, '11')], { cbteType: 3 })))
      ).toBe(`Servicio 1: la nota de crédito acredita 11 u y en la ${order.number} hay 10 u facturadas`);

      // Rechazada: no cuenta
      const extra = expectOk(await actions.createSupplierInvoice(invoiceForm([orderLine(line, '3')])));
      expect(codes(extra.observations)).toEqual(['QUANTITY']);
      expectOk(await actions.rejectSupplierInvoice(extra.id, 'No corresponde'));
      const afterReject = expectOk(await actions.createSupplierInvoice(invoiceForm([orderLine(line, '0.5')])));
      expect(afterReject.observations[0]?.message).toContain('facturado 10,5 u');

      // No se anula la factura con la NC vinculada; anulando la NC primero, si.
      expect(expectFail(await actions.cancelSupplierInvoice(invoice.id, 'Error de carga'))).toMatch(
        /^Tiene la Nota de Crédito A 00003-\d{8} vinculada: anulala primero$/
      );
      expectOk(await actions.cancelSupplierInvoice(credit.id, 'Error de carga'));
      expectOk(await actions.cancelSupplierInvoice(invoice.id, 'Error de carga'));
      expect((await invoiceRow(invoice.id)).status).toBe('CANCELLED');
      const freed = expectOk(await actions.createSupplierInvoice(invoiceForm([orderLine(line, '7')])));
      expect(freed.status).toBe('CONFORMING');
    });

    it('un duplicado de un anulado se puede cargar', async () => {
      const actions = { ...(await import('./invoices.server')), ...(await import('./invoice-queries.server')) };
      const order = await receivedOrder([{ quantity: 2, received: 2 }]);
      const values = invoiceForm([orderLine(order.lineIds[0]!, '1')]);
      const first = expectOk(await actions.createSupplierInvoice(values));
      expectOk(await actions.cancelSupplierInvoice(first.id, 'Mal cargada'));
      expectOk(await actions.createSupplierInvoice({ ...values }));
    });

    it('NC vinculada a una factura de otro proveedor o de otra letra → error', async () => {
      const actions = { ...(await import('./invoices.server')), ...(await import('./invoice-queries.server')) };
      const order = await receivedOrder([{ quantity: 2, received: 2 }]);
      const invoice = expectOk(await actions.createSupplierInvoice(invoiceForm([orderLine(order.lineIds[0]!, '1')])));
      expect(
        expectFail(
          await actions.createSupplierInvoice(
            invoiceForm([orderLine(order.lineIds[0]!, '1')], { cbteType: 8, relatedInvoiceId: invoice.id })
          )
        )
      ).toBe('La nota tiene que vincularse a una factura vigente del mismo proveedor y la misma letra');
    });

    it('concurrencia: dos facturas de 6 sobre 10 recibidas → una conforme y otra observada', async () => {
      const actions = { ...(await import('./invoices.server')), ...(await import('./invoice-queries.server')) };
      const order = await receivedOrder([{ quantity: 10, received: 10 }]);
      const [a, b] = await Promise.all([
        actions.createSupplierInvoice(invoiceForm([orderLine(order.lineIds[0]!, '6')])),
        actions.createSupplierInvoice(invoiceForm([orderLine(order.lineIds[0]!, '6')])),
      ]);
      const statuses = [expectOk(a).status, expectOk(b).status].sort();
      expect(statuses).toEqual(['CONFORMING', 'OBSERVED']);
    });

    it('editar: pasar la linea a otra OC libera la vieja y controla la nueva', async () => {
      const actions = { ...(await import('./invoices.server')), ...(await import('./invoice-queries.server')) };
      const first = await receivedOrder([{ quantity: 5, received: 5 }]);
      const second = await receivedOrder([{ quantity: 5, received: 2 }]);
      const invoice = expectOk(await actions.createSupplierInvoice(invoiceForm([orderLine(first.lineIds[0]!, '5')])));
      const prisma = await db();
      const current = await prisma.supplier_invoices.findUniqueOrThrow({
        where: { id: invoice.id },
        select: { number: true },
      });
      const edited = expectOk(
        await actions.updateSupplierInvoice(
          invoice.id,
          invoiceForm([orderLine(second.lineIds[0]!, '5')], { number: String(current.number) })
        )
      );
      expect(codes(edited.observations)).toEqual(['QUANTITY']);
      const again = expectOk(await actions.createSupplierInvoice(invoiceForm([orderLine(first.lineIds[0]!, '5')])));
      expect(again.status).toBe('CONFORMING');
    });

    it('editar un aprobado vuelve a controlar y borra la resolucion', async () => {
      const actions = { ...(await import('./invoices.server')), ...(await import('./invoice-queries.server')) };
      const order = await receivedOrder([{ quantity: 4, received: 4 }]);
      const values = invoiceForm([orderLine(order.lineIds[0]!, '4', '1300')]);
      const observed = expectOk(await actions.createSupplierInvoice(values));
      expectOk(await actions.approveSupplierInvoice(observed.id, 'Acordado'));
      const edited = expectOk(
        await actions.updateSupplierInvoice(observed.id, {
          ...values,
          lines: [orderLine(order.lineIds[0]!, '4')],
          vat: computedVat(1, [orderLine(order.lineIds[0]!, '4')]),
        })
      );
      expect(edited.status).toBe('CONFORMING');
      expect((await invoiceRow(observed.id)).resolution_comment).toBeNull();
    });

    it('solo gastos (C de un monotributista) y comprobante mixto', async () => {
      const actions = { ...(await import('./invoices.server')), ...(await import('./invoice-queries.server')) };
      const categories = await import('./expense-categories.server');
      const freight = expectOk(await categories.createExpenseCategory({ name: 'Fletes' }));
      const expense = (net: string, vatRateId: string): FormLine => ({
        kind: 'expense',
        orderLineId: '',
        expenseCategoryId: freight.id,
        description: 'Flete Neuquén',
        quantity: '',
        unitPrice: '',
        net,
        vatRateId,
      });
      const c = expectOk(
        await actions.createSupplierInvoice(
          invoiceForm([expense('5000', '')], { cbteType: 11, supplierId: MONO_SUPPLIER })
        )
      );
      expect(c.status).toBe('CONFORMING');
      expect((await invoiceRow(c.id)).total.toString()).toBe('5000');

      const order = await receivedOrder([{ quantity: 1, received: 1 }]);
      const mixed = expectOk(
        await actions.createSupplierInvoice(invoiceForm([orderLine(order.lineIds[0]!, '1'), expense('100', '5')]))
      );
      expect(mixed.status).toBe('CONFORMING');
      expect((await invoiceRow(mixed.id)).total.toString()).toBe('1573');
    });

    it('el detalle de la OC muestra lo facturado y los comprobantes', async () => {
      const actions = { ...(await import('./invoices.server')), ...(await import('./invoice-queries.server')) };
      const orders = { ...(await import('./orders.server')), ...(await import('./order-queries.server')) };
      const order = await receivedOrder([{ quantity: 8, received: 8 }]);
      const invoice = expectOk(await actions.createSupplierInvoice(invoiceForm([orderLine(order.lineIds[0]!, '5')])));
      const detail = await orders.getPurchaseOrderDetail(order.id);
      expect(detail?.lines[0]?.invoiced).toBe('5.0000');
      expect(detail?.invoices.map((i) => i.id)).toEqual([invoice.id]);
      const invoiceDetail = await actions.getSupplierInvoiceDetail(invoice.id);
      expect(invoiceDetail?.lines[0]?.order?.number).toBe(order.number);
    });

    it('perimetro: proveedor, linea de OC, vinculado y concepto de otra empresa', async () => {
      const actions = { ...(await import('./invoices.server')), ...(await import('./invoice-queries.server')) };
      const prisma = await db();
      expect(
        expectFail(
          await actions.createSupplierInvoice(
            invoiceForm([orderLine('d6000000-0000-4000-8000-0000000000ff', '1')], { supplierId: FOREIGN_SUPPLIER })
          )
        )
      ).toBe('El proveedor no existe');
      expect(
        expectFail(
          await actions.createSupplierInvoice(invoiceForm([orderLine('d6000000-0000-4000-8000-0000000000ff', '1')]))
        )
      ).toBe('La línea de OC no existe');
      const foreign = await prisma.supplier_invoices.create({
        data: {
          company_id: OTHER_COMPANY,
          supplier_id: FOREIGN_SUPPLIER,
          cbte_type: 1,
          sales_point: 1,
          number: 1,
          issue_date: new Date('2026-10-01'),
          vat_period: '2026-10',
          net_taxed: 0,
          net_untaxed: 0,
          exempt: 0,
          vat_total: 0,
          vat_perceptions: 0,
          gross_income_perceptions: 0,
          other_taxes: 0,
          total: 0,
          status: 'CONFORMING',
          created_by: BUYER,
        },
        select: { id: true },
      });
      const order = await receivedOrder([{ quantity: 1, received: 1 }]);
      expect(
        expectFail(
          await actions.createSupplierInvoice(
            invoiceForm([orderLine(order.lineIds[0]!, '1')], { cbteType: 3, relatedInvoiceId: foreign.id })
          )
        )
      ).toBe('La nota tiene que vincularse a una factura vigente del mismo proveedor y la misma letra');
      const expense: FormLine = {
        kind: 'expense',
        orderLineId: '',
        expenseCategoryId: FOREIGN_CATEGORY,
        description: 'x',
        quantity: '',
        unitPrice: '',
        net: '10',
        vatRateId: '5',
      };
      expect(expectFail(await actions.createSupplierInvoice(invoiceForm([expense])))).toBe(
        'El concepto de gasto no existe'
      );
      expect(await actions.getSupplierInvoiceDetail(foreign.id)).toBeNull();
      state.denied.add('compras:facturas:create');
      expect(expectFail(await actions.createSupplierInvoice(invoiceForm([orderLine(order.lineIds[0]!, '1')])))).toBe(
        'No tenés permiso para realizar esta acción'
      );
    });
  });

  describe('constatar en ARCA (modo simulado)', () => {
    const withScenario = async <T>(scenario: string | undefined, run: () => Promise<T>) => {
      const before = { mode: process.env.ARCA_MODE, scenario: process.env.ARCA_MOCK_SCENARIO };
      process.env.ARCA_MODE = 'mock';
      if (scenario) process.env.ARCA_MOCK_SCENARIO = scenario;
      else delete process.env.ARCA_MOCK_SCENARIO;
      try {
        return await run();
      } finally {
        if (before.mode === undefined) delete process.env.ARCA_MODE;
        else process.env.ARCA_MODE = before.mode;
        if (before.scenario === undefined) delete process.env.ARCA_MOCK_SCENARIO;
        else process.env.ARCA_MOCK_SCENARIO = before.scenario;
      }
    };

    it('aprobada: guarda el resultado y no cambia el estado', async () => {
      const actions = {
        ...(await import('./invoices.server')),
        ...(await import('./invoice-queries.server')),
        ...(await import('./invoice-arca.server')),
      };
      const order = await receivedOrder([{ quantity: 1, received: 1 }]);
      const invoice = expectOk(
        await actions.createSupplierInvoice(invoiceForm([orderLine(order.lineIds[0]!, '1')], { cae: '76543210987654' }))
      );
      const checked = expectOk(await withScenario(undefined, () => actions.checkSupplierInvoiceInArca(invoice.id)));
      expect(checked.result).toBe('APPROVED');
      const prisma = await db();
      const row = await prisma.supplier_invoices.findUniqueOrThrow({
        where: { id: invoice.id },
        select: { status: true, arca_check_result: true, arca_checked_at: true },
      });
      expect(row.status).toBe('CONFORMING');
      expect(row.arca_check_result).toBe('APPROVED');
      expect(row.arca_checked_at).not.toBeNull();
    });

    it('rechazada: pasa a observada (aunque estuviera aprobada) con la observacion de ARCA', async () => {
      const actions = {
        ...(await import('./invoices.server')),
        ...(await import('./invoice-queries.server')),
        ...(await import('./invoice-arca.server')),
      };
      const order = await receivedOrder([{ quantity: 1, received: 1 }]);
      const invoice = expectOk(
        await actions.createSupplierInvoice(
          invoiceForm([orderLine(order.lineIds[0]!, '1', '1300')], { cae: '76543210987654' })
        )
      );
      expectOk(await actions.approveSupplierInvoice(invoice.id, 'Acordado'));
      const checked = expectOk(await withScenario('reject', () => actions.checkSupplierInvoiceInArca(invoice.id)));
      expect(checked.result).toBe('REJECTED');
      const row = await invoiceRow(invoice.id);
      expect(row.status).toBe('OBSERVED');
      expect(row.resolution_comment).toBeNull();
      expect(codes(row.observations as { code: string }[])).toEqual(['PRICE', 'ARCA']);
    });

    it('sin respuesta: queda "no respondio" y el estado no cambia', async () => {
      const actions = {
        ...(await import('./invoices.server')),
        ...(await import('./invoice-queries.server')),
        ...(await import('./invoice-arca.server')),
      };
      const order = await receivedOrder([{ quantity: 1, received: 1 }]);
      const invoice = expectOk(
        await actions.createSupplierInvoice(invoiceForm([orderLine(order.lineIds[0]!, '1')], { cae: '76543210987654' }))
      );
      const checked = expectOk(await withScenario('timeout', () => actions.checkSupplierInvoiceInArca(invoice.id)));
      expect(checked).toEqual({ result: 'UNAVAILABLE', message: 'ARCA no respondió: probá de nuevo más tarde' });
      const prisma = await db();
      const row = await prisma.supplier_invoices.findUniqueOrThrow({
        where: { id: invoice.id },
        select: { status: true, arca_check_result: true },
      });
      expect(row).toEqual({ status: 'CONFORMING', arca_check_result: 'UNAVAILABLE' });
    });

    it('I-3: editar sin cambios un comprobante rechazado por ARCA conserva la observacion; cambiar el total limpia la constatacion', async () => {
      const actions = {
        ...(await import('./invoices.server')),
        ...(await import('./invoice-queries.server')),
        ...(await import('./invoice-arca.server')),
      };
      const order = await receivedOrder([{ quantity: 2, received: 2 }]);
      const values = invoiceForm([orderLine(order.lineIds[0]!, '1')], { cae: '76543210987654' });
      const invoice = expectOk(await actions.createSupplierInvoice(values));
      expectOk(await withScenario('reject', () => actions.checkSupplierInvoiceInArca(invoice.id)));
      const same = expectOk(await actions.updateSupplierInvoice(invoice.id, values));
      expect(same.status).toBe('OBSERVED');
      expect(codes(same.observations)).toEqual(['ARCA']);
      const lines = [orderLine(order.lineIds[0]!, '2')];
      const changed = expectOk(
        await actions.updateSupplierInvoice(invoice.id, { ...values, lines, vat: computedVat(1, lines) })
      );
      expect(changed.status).toBe('CONFORMING');
      const prisma = await db();
      const row = await prisma.supplier_invoices.findUniqueOrThrow({
        where: { id: invoice.id },
        select: { arca_check_result: true },
      });
      expect(row.arca_check_result).toBeNull();
    });

    it('I-4: un rechazado que ARCA rechaza sigue rechazado', async () => {
      const actions = {
        ...(await import('./invoices.server')),
        ...(await import('./invoice-queries.server')),
        ...(await import('./invoice-arca.server')),
      };
      const order = await receivedOrder([{ quantity: 1, received: 1 }]);
      const invoice = expectOk(
        await actions.createSupplierInvoice(
          invoiceForm([orderLine(order.lineIds[0]!, '1', '1300')], { cae: '76543210987654' })
        )
      );
      expectOk(await actions.rejectSupplierInvoice(invoice.id, 'Precio no acordado'));
      expectOk(await withScenario('reject', () => actions.checkSupplierInvoiceInArca(invoice.id)));
      const row = await invoiceRow(invoice.id);
      expect(row.status).toBe('REJECTED');
      expect(codes(row.observations as { code: string }[])).toEqual(['PRICE', 'ARCA']);
    });

    it('etapa 5: en una orden de pago pagada, ARCA no lo saca de la deuda; observado en una orden no se rechaza', async () => {
      const actions = {
        ...(await import('./invoices.server')),
        ...(await import('./invoice-queries.server')),
        ...(await import('./invoice-arca.server')),
      };
      const prisma = await db();
      const order = await receivedOrder([{ quantity: 2, received: 2 }]);
      const invoice = expectOk(
        await actions.createSupplierInvoice(invoiceForm([orderLine(order.lineIds[0]!, '1')], { cae: '76543210987654' }))
      );
      const total = (
        await prisma.supplier_invoices.findUniqueOrThrow({ where: { id: invoice.id }, select: { total: true } })
      ).total;
      const payment = await prisma.payment_orders.create({
        data: {
          company_id: COMPANY,
          number: 'OP-900001',
          supplier_id: SUPPLIER,
          status: 'PAID',
          planned_on: new Date(),
          paid_on: new Date(),
          paid_by: BUYER,
          approved_by: BUYER,
          approved_at: new Date(),
          invoices_total: total,
          credits_total: 0,
          advance_total: 0,
          withholdings_total: 0,
          net_total: total,
          withholding_net_base: 0,
          withholding_vat_base: 0,
          created_by: BUYER,
          lines: { create: [{ position: 1, kind: 'INVOICE', amount: total, invoice_id: invoice.id }] },
        },
      });
      expectOk(await withScenario('reject', () => actions.checkSupplierInvoiceInArca(invoice.id)));
      const row = await invoiceRow(invoice.id);
      expect(row.status).toBe('CONFORMING');
      expect(codes(row.observations as { code: string }[])).toEqual(['ARCA']);
      // Si igual quedara observado dentro de una orden, rechazarlo no se permite.
      await prisma.supplier_invoices.update({ where: { id: invoice.id }, data: { status: 'OBSERVED' } });
      expect(expectFail(await actions.rejectSupplierInvoice(invoice.id, 'No va'))).toBe(
        'Está en la OP-900001: anulala o sacalo de ahí primero'
      );
      await prisma.payment_orders.delete({ where: { id: payment.id } });
    });

    it('sin CAE no se constata', async () => {
      const actions = {
        ...(await import('./invoices.server')),
        ...(await import('./invoice-queries.server')),
        ...(await import('./invoice-arca.server')),
      };
      const order = await receivedOrder([{ quantity: 1, received: 1 }]);
      const invoice = expectOk(await actions.createSupplierInvoice(invoiceForm([orderLine(order.lineIds[0]!, '1')])));
      expect(expectFail(await withScenario(undefined, () => actions.checkSupplierInvoiceInArca(invoice.id)))).toBe(
        'Cargá el CAE del comprobante para constatarlo en ARCA'
      );
    });
  });

  describe('Libro IVA Compras', () => {
    it('periodo: filas ordenadas, NC restando, alicuotas usadas y totales', async () => {
      const actions = {
        ...(await import('./invoices.server')),
        ...(await import('./invoice-queries.server')),
        ...(await import('./invoice-arca.server')),
      };
      const book = await import('./vat-book.server');
      const order = await receivedOrder([
        { quantity: 10, received: 10 },
        { quantity: 4, received: 4, vatRateId: 4 },
      ]);
      const period = '2026-11';
      const invoice = expectOk(
        await actions.createSupplierInvoice(
          invoiceForm([orderLine(order.lineIds[0]!, '10'), orderLine(order.lineIds[1]!, '4', '1200', '4')], {
            vatPeriod: period,
            issueDate: '2026-10-05',
            taxes: [
              { kind: 'VAT_PERCEPTION', provinceId: '', description: '', amount: '100' },
              { kind: 'INTERNAL_TAX', provinceId: '', description: '', amount: '50' },
            ],
          })
        )
      );
      expectOk(
        await actions.createSupplierInvoice(
          invoiceForm([orderLine(order.lineIds[0]!, '2')], {
            cbteType: 3,
            relatedInvoiceId: invoice.id,
            vatPeriod: period,
            issueDate: '2026-10-08',
          })
        )
      );
      const cancelled = expectOk(
        await actions.createSupplierInvoice(
          invoiceForm([orderLine(order.lineIds[0]!, '1')], { vatPeriod: period, issueDate: '2026-10-01' })
        )
      );
      expectOk(await actions.cancelSupplierInvoice(cancelled.id, 'Mal cargada'));

      const result = await book.getPurchasesVatBook(period);
      expect(result).not.toBeNull();
      expect(result!.rows).toHaveLength(2);
      expect(result!.rows.map((r) => r.issueDate)).toEqual(['2026-10-05', '2026-10-08']);
      expect(result!.vatRates.map((r) => r.id)).toEqual([4, 5]);
      const credit = result!.rows[1]!;
      expect(credit.netTaxed).toBe('-2400.00');
      expect(credit.vat[5]).toBe('-504.00');
      expect(result!.totals.netTaxed).toBe('14400.00');
      expect(result!.totals.vat[5]).toBe('2016.00');
      expect(result!.totals.vat[4]).toBe('504.00');
      expect(result!.totals.vatPerceptions).toBe('100.00');
      expect(result!.totals.otherTaxes).toBe('50.00');
      expect(result!.totals.total).toBe(String((12000 + 2520 + 4800 + 504 + 150 - 2400 - 504).toFixed(2)));
    });

    it('TXT: ZIP con los dos archivos y registros del largo justo', async () => {
      const book = await import('./vat-book.server');
      const exported = expectOk(await book.exportPurchasesVatBookTxt('2026-11'));
      expect(exported.fileName).toBe('LIBRO_IVA_COMPRAS_2026-11.zip');
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(Buffer.from(exported.base64, 'base64'));
      const cbte = (await zip.file('LIBRO_IVA_DIGITAL_COMPRAS_CBTE.txt')!.async('string')).split('\r\n');
      const alicuotas = (await zip.file('LIBRO_IVA_DIGITAL_COMPRAS_ALICUOTAS.txt')!.async('string')).split('\r\n');
      expect(cbte).toHaveLength(2);
      expect(alicuotas).toHaveLength(3);
      for (const line of cbte) expect(line).toHaveLength(325);
      for (const line of alicuotas) expect(line).toHaveLength(84);
    });

    it('periodo invalido y permisos', async () => {
      const book = await import('./vat-book.server');
      expect(await book.getPurchasesVatBook('2026-13')).toBeNull();
      expect(expectFail(await book.exportPurchasesVatBookTxt('x'))).toBe('Período inválido');
      state.denied.add('compras:libro-iva:view');
      expect(await book.getPurchasesVatBook('2026-11')).toBeNull();
      expect(expectFail(await book.exportPurchasesVatBookTxt('2026-11'))).toBe(
        'No tenés permiso para realizar esta acción'
      );
    });
  });

  describe('revision final: invariantes', () => {
    it('C-1: anular la factura base con una NC vigente sin vincular → error (facturado quedaria negativo)', async () => {
      const actions = {
        ...(await import('./invoices.server')),
        ...(await import('./invoice-queries.server')),
        ...(await import('./invoice-arca.server')),
      };
      const order = await receivedOrder([{ quantity: 10, received: 10 }]);
      const line = order.lineIds[0]!;
      const f1 = expectOk(await actions.createSupplierInvoice(invoiceForm([orderLine(line, '10')])));
      expectOk(await actions.createSupplierInvoice(invoiceForm([orderLine(line, '2')], { cbteType: 3 })));
      expect(expectFail(await actions.cancelSupplierInvoice(f1.id, 'Mal cargada'))).toContain(
        'quedaría con facturado negativo'
      );
      expect((await invoiceRow(f1.id)).status).toBe('CONFORMING');
    });

    it('C-1: rechazar una factura observada con NC vigente → error', async () => {
      const actions = {
        ...(await import('./invoices.server')),
        ...(await import('./invoice-queries.server')),
        ...(await import('./invoice-arca.server')),
      };
      const order = await receivedOrder([{ quantity: 10, received: 10 }]);
      const line = order.lineIds[0]!;
      const f1 = expectOk(await actions.createSupplierInvoice(invoiceForm([orderLine(line, '10', '1300')])));
      expectOk(
        await actions.createSupplierInvoice(
          invoiceForm([orderLine(line, '2', '1300')], { cbteType: 3, relatedInvoiceId: f1.id })
        )
      );
      expect(expectFail(await actions.rejectSupplierInvoice(f1.id, 'No corresponde'))).toContain(
        'quedaría con facturado negativo'
      );
    });

    it('C-1: editar la factura base por debajo de lo acreditado → error', async () => {
      const actions = {
        ...(await import('./invoices.server')),
        ...(await import('./invoice-queries.server')),
        ...(await import('./invoice-arca.server')),
      };
      const order = await receivedOrder([{ quantity: 10, received: 10 }]);
      const line = order.lineIds[0]!;
      const values = invoiceForm([orderLine(line, '10')]);
      const f1 = expectOk(await actions.createSupplierInvoice(values));
      expectOk(await actions.createSupplierInvoice(invoiceForm([orderLine(line, '2')], { cbteType: 3 })));
      const lines = [orderLine(line, '1')];
      expect(
        expectFail(await actions.updateSupplierInvoice(f1.id, { ...values, lines, vat: computedVat(1, lines) }))
      ).toContain('quedaría con facturado negativo');
    });

    it('I-6: fecha de emision futura → error', async () => {
      const actions = {
        ...(await import('./invoices.server')),
        ...(await import('./invoice-queries.server')),
        ...(await import('./invoice-arca.server')),
      };
      const order = await receivedOrder([{ quantity: 1, received: 1 }]);
      expect(
        expectFail(
          await actions.createSupplierInvoice(
            invoiceForm([orderLine(order.lineIds[0]!, '1')], { issueDate: '2099-01-01', vatPeriod: '2099-01' })
          )
        )
      ).toBe('La fecha de emisión no puede ser futura');
    });
  });
});
