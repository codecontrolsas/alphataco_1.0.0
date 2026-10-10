import moment from 'moment';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { treasuryToday } from '@/features/Treasury/lib/today';

/**
 * Pagos (Compras etapa 5) contra el Postgres del compose: `npm run test:purchases`. Se simulan la
 * sesion, la empresa activa, los permisos y los mails; los comprobantes se cargan como gastos sin
 * OC (con las actions reales de la etapa 4).
 */

const COMPANY = 'd7000000-0000-4000-8000-000000000001';
const OTHER_COMPANY = 'd7000000-0000-4000-8000-000000000002';
const BUYER = 'd7000000-0000-4000-8000-000000000003';
const SUPPLIER = 'd7000000-0000-4000-8000-000000000030';
const MONO_SUPPLIER = 'd7000000-0000-4000-8000-000000000031';
const OTHER_SUPPLIER = 'd7000000-0000-4000-8000-000000000032';
const FOREIGN_SUPPLIER = 'd7000000-0000-4000-8000-000000000033';
const FOREIGN_ACCOUNT = 'd7000000-0000-4000-8000-000000000040';
const FOREIGN_REGIME = 'd7000000-0000-4000-8000-000000000041';

const state = vi.hoisted(() => ({ denied: new Set<string>() }));
const mails = vi.hoisted(() => ({ any: vi.fn(async () => true) }));

vi.mock('@/shared/lib/tenant', () => ({ getActiveCompanyId: async () => 'd7000000-0000-4000-8000-000000000001' }));
vi.mock('@/features/Permissions', () => ({
  checkPermissionServer: async (module: string, tab: string, action: string) => !state.denied.has(`${module}:${tab}:${action}`),
}));
vi.mock('@/shared/actions/auth.actions', () => {
  const current = () => ({
    id: 'd7000000-0000-4000-8000-000000000003',
    credentialId: 'd7000000-0000-4000-8000-000000000003',
    fullname: null,
    email: null,
  });
  return { getServerAuthProfile: async () => current(), requireServerAuthProfile: async () => current() };
});
vi.mock('@/shared/lib/mail/templates/purchases', () => ({
  sendPurchaseRequestDecisionEmail: mails.any,
  sendPurchaseOrderDecisionEmail: mails.any,
  sendSupplierDocumentEmail: mails.any,
}));
const revalidated = vi.hoisted(() => ({ paths: [] as string[] }));
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => void revalidated.paths.push(path) }));

const RUN = Boolean(process.env.DATABASE_URL);

async function db() {
  return (await import('@/shared/lib/prisma')).prisma;
}

async function cleanup() {
  const prisma = await db();
  const company_id = { in: [COMPANY, OTHER_COMPANY] };
  await prisma.treasury_movements.deleteMany({ where: { company_id } });
  await prisma.payment_order_lines.deleteMany({ where: { payment_order: { company_id }, kind: 'ADVANCE_APPLIED' } });
  await prisma.payment_orders.deleteMany({ where: { company_id } });
  await prisma.supplier_withholding_profiles.deleteMany({ where: { supplier: { company_id } } });
  await prisma.withholding_regimes.deleteMany({ where: { company_id } });
  await prisma.treasury_accounts.deleteMany({ where: { company_id } });
  await prisma.supplier_invoices.updateMany({ where: { company_id }, data: { related_invoice_id: null } });
  await prisma.supplier_invoices.deleteMany({ where: { company_id } });
  await prisma.purchase_expense_categories.deleteMany({ where: { company_id } });
  await prisma.suppliers.deleteMany({ where: { company_id } });
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


// Hora local, como el servidor (en UTC, a la noche ya es "mañana" y la factura sale con fecha futura).
const TODAY = moment().format('YYYY-MM-DD');
const NEXT_MONTH = moment().add(1, 'month').startOf('month').format('YYYY-MM-DD');
// Tesorería clasifica pasado/futuro con el día argentino (lib/today.ts), no con el del proceso.
const AR_TODAY = treasuryToday();
const TOMORROW = moment(AR_TODAY).add(1, 'day').format('YYYY-MM-DD');

const accountForm = (name: string) => ({ kind: 'BANK' as const, name, bankName: '', accountNumber: '', cbu: '', openingDate: '', openingAmount: '' });

let invoiceNumber = 5000;
let categoryId = '';
let accountId = '';

/** Factura A (o NC A) de gasto por `net` + 21 % de IVA, cargada con la action real de la etapa 4. */
async function expenseInvoice(supplierId: string, net: string, cbteType = 1, relatedInvoiceId = '') {
  const invoices = await import('./invoices.server');
  invoiceNumber += 1;
  const vat = (Math.round(Number(net) * 21) / 100).toFixed(2);
  const created = await invoices.createSupplierInvoice({
    supplierId,
    cbteType,
    salesPoint: '7',
    number: String(invoiceNumber),
    issueDate: TODAY,
    dueDate: '',
    vatPeriod: TODAY.slice(0, 7),
    cae: '',
    caeDueDate: '',
    relatedInvoiceId,
    notes: '',
    lines: [{ kind: 'expense', orderLineId: '', expenseCategoryId: categoryId, description: 'Servicio', quantity: '', unitPrice: '', net, vatRateId: '5' }],
    vat: [{ vatRateId: 5, amount: vat }],
    untaxed: '',
    exempt: '',
    taxes: [],
  });
  if (!created.ok) throw new Error(created.error);
  return created.data.id;
}

type PayForm = import('../schemas/payment-orders').PaymentOrderFormValues;
type PayLine = PayForm['lines'][number];

const invoiceLine = (invoiceId: string, amount: string): PayLine => ({ kind: 'INVOICE', invoiceId, sourceLineId: '', amount });
const creditLine = (invoiceId: string, amount: string): PayLine => ({ kind: 'CREDIT_NOTE', invoiceId, sourceLineId: '', amount });
const advanceApplied = (sourceLineId: string, amount: string): PayLine => ({ kind: 'ADVANCE_APPLIED', invoiceId: '', sourceLineId, amount });

const paymentForm = (supplierId: string, lines: PayLine[], over: Partial<PayForm> = {}): PayForm => ({
  supplierId,
  plannedOn: TODAY,
  notes: '',
  lines,
  advance: { amount: '', purchaseOrderId: '', description: '' },
  manualWithholdings: [],
  ...over,
});

const payValues = (amount: string, over: Partial<import('../schemas/payment-orders').RegisterPaymentFormValues> = {}) => ({
  paidOn: TODAY,
  payments: [{ method: 'TRANSFER' as const, accountId, amount, reference: 'TRF-1', checkNumber: '', checkBank: '', checkDueOn: '' }],
  ...over,
});

async function approveAndPay(orderId: string, net: string) {
  const actions = await import('./payment-orders.server');
  expectOk(await actions.submitPaymentOrder(orderId));
  expectOk(await actions.approvePaymentOrder(orderId));
  expectOk(await actions.registerPayment(orderId, payValues(net)));
}

async function orderRow(id: string) {
  const prisma = await db();
  return prisma.payment_orders.findUniqueOrThrow({
    where: { id },
    select: {
      status: true,
      net_total: true,
      withholdings_total: true,
      withholdings: { select: { tax: true, amount: true, certificate_number: true, cancelled_at: true }, orderBy: { tax: 'asc' } },
    },
  });
}

const amounts = (rows: { tax: string; amount: { toString(): string } }[]) => Object.fromEntries(rows.map((r) => [r.tax, r.amount.toString()]));

describe.skipIf(!RUN)('pagos (integracion)', () => {
  beforeAll(async () => {
    await cleanup();
    const prisma = await db();
    const city = await prisma.cities.findFirstOrThrow({ select: { id: true } });
    for (const [id, cuit] of [
      [COMPANY, '30999999940'],
      [OTHER_COMPANY, '30999999941'],
    ] as const) {
      await prisma.company.create({
        data: {
          id,
          company_name: `Pagos test ${cuit}`,
          description: 'empresa de prueba',
          contact_email: 'pagos-test@alphataco.local',
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
    await prisma.profile.create({ data: { id: BUYER, credential_id: BUYER, email: 'pagos@alphataco.local' } });
    await prisma.suppliers.createMany({
      data: [
        { id: SUPPLIER, company_id: COMPANY, name: 'Repuestos del Sur', cuit: BigInt('30712345678'), vat_condition_id: 1 },
        { id: MONO_SUPPLIER, company_id: COMPANY, name: 'Juan Electricista', cuit: BigInt('20123456786'), vat_condition_id: 6 },
        { id: OTHER_SUPPLIER, company_id: COMPANY, name: 'Otro proveedor', cuit: BigInt('30711111119'), vat_condition_id: 1 },
        { id: FOREIGN_SUPPLIER, company_id: OTHER_COMPANY, name: 'Ajeno', cuit: BigInt('30722222228'), vat_condition_id: 1 },
      ],
    });
    await prisma.treasury_accounts.create({ data: { id: FOREIGN_ACCOUNT, company_id: OTHER_COMPANY, kind: 'BANK', name: 'Ajena' } });
    await prisma.withholding_regimes.create({
      data: { id: FOREIGN_REGIME, company_id: OTHER_COMPANY, tax: 'GANANCIAS', code: '078', description: 'Ajeno', rate_registered: 2 },
    });
  }, 60_000);

  afterAll(async () => {
    await cleanup();
  }, 60_000);

  beforeEach(() => {
    state.denied.clear();
  });

  describe('regimenes de retencion', () => {
    it('alta por impuesto con sus reglas, duplicado y perimetro', async () => {
      const actions = await import('./withholding-regimes.server');
      const base = {
        tax: 'GANANCIAS' as const,
        code: '078',
        description: 'Enajenación de bienes muebles',
        rateRegistered: '2',
        rateUnregistered: '10',
        monthlyExemptAmount: '224000',
        minimumWithholding: '240',
        vatPercentage: '',
        scale: [],
      };
      expectOk(await actions.createWithholdingRegime(base));
      expect(expectFail(await actions.createWithholdingRegime(base))).toBe('Ya existe el régimen 078 de Ganancias');
      expect(expectFail(await actions.createWithholdingRegime({ ...base, tax: 'IVA', code: '499' }))).toBe('Indicá el porcentaje del IVA a retener');
      expectOk(await actions.createWithholdingRegime({ ...base, tax: 'IVA', code: '499', description: 'IVA general', vatPercentage: '50' }));
      const honorarios = expectOk(
        await actions.createWithholdingRegime({
          ...base,
          code: '116',
          description: 'Honorarios',
          scale: [
            { from: '0', to: '8000', fixed: '0', rate: '5' },
            { from: '8000', to: '', fixed: '400', rate: '9' },
          ],
        })
      );
      const rows = await actions.getWithholdingRegimes();
      expect(rows.map((r) => `${r.tax} ${r.code}`)).toEqual(['GANANCIAS 078', 'GANANCIAS 116', 'IVA 499']);
      expect(rows.find((r) => r.id === honorarios.id)?.scale).toHaveLength(2);
      expect(expectFail(await actions.setWithholdingRegimeActive(FOREIGN_REGIME, false))).toBe('El régimen no existe');
    });
  });

  describe('situacion impositiva del proveedor', () => {
    it('guarda por impuesto, borra el que no aplica y valida regimen y vigencia', async () => {
      const regimes = await import('./withholding-regimes.server');
      const actions = await import('./withholding-profiles.server');
      const gan = (await regimes.getWithholdingRegimes()).find((r) => r.code === '078')!;
      type Profile = import('../schemas/payment-settings').WithholdingProfilesFormValues['profiles']['GANANCIAS'];
      const profile = (over: Partial<Profile>): Profile => ({
        status: 'NONE',
        regimeId: '',
        rate: '',
        exclusionPercentage: '',
        exclusionFrom: '',
        exclusionTo: '',
        exclusionCertificate: '',
        ...over,
      });
      const values = {
        profiles: {
          GANANCIAS: profile({ status: 'SUBJECT', regimeId: gan.id, exclusionPercentage: '50', exclusionFrom: '2026-01-01', exclusionTo: '2026-12-31', exclusionCertificate: 'EX-1' }),
          IVA: profile({}),
          IIBB: profile({ status: 'SUBJECT', rate: '1.75' }),
          SUSS: profile({}),
        },
      };
      expectOk(await actions.saveSupplierWithholdingProfiles(SUPPLIER, values));
      let saved = await actions.getSupplierWithholdingProfiles(SUPPLIER);
      expect(saved.map((p) => [p.tax, p.status])).toEqual([
        ['GANANCIAS', 'SUBJECT'],
        ['IIBB', 'SUBJECT'],
      ]);
      expectOk(await actions.saveSupplierWithholdingProfiles(SUPPLIER, { profiles: { ...values.profiles, IIBB: profile({}) } }));
      saved = await actions.getSupplierWithholdingProfiles(SUPPLIER);
      expect(saved.map((p) => p.tax)).toEqual(['GANANCIAS']);

      expect(
        expectFail(
          await actions.saveSupplierWithholdingProfiles(SUPPLIER, {
            profiles: { ...values.profiles, GANANCIAS: profile({ status: 'SUBJECT', regimeId: FOREIGN_REGIME }) },
          })
        )
      ).toBe('El régimen no existe o no es de ese impuesto');
      expect(
        expectFail(
          await actions.saveSupplierWithholdingProfiles(SUPPLIER, {
            profiles: { ...values.profiles, GANANCIAS: profile({ status: 'SUBJECT', regimeId: gan.id, exclusionPercentage: '50' }) },
          })
        )
      ).toBe('Ganancias: indicá la vigencia de la exclusión');
      expect(expectFail(await actions.saveSupplierWithholdingProfiles(FOREIGN_SUPPLIER, values))).toBe('El proveedor no existe');
      state.denied.add('compras:proveedores:update');
      expect(expectFail(await actions.saveSupplierWithholdingProfiles(SUPPLIER, values))).toBe('No tenés permiso para realizar esta acción');
    });
  });

  describe('ordenes de pago', () => {
    beforeAll(async () => {
      state.denied.clear();
      const categories = await import('./expense-categories.server');
      const accounts = await import('@/features/Treasury/actions/accounts.server');
      const regimes = await import('./withholding-regimes.server');
      const profiles = await import('./withholding-profiles.server');
      categoryId = expectOk(await categories.createExpenseCategory({ name: 'Servicios pagos' })).id;
      accountId = expectOk(await accounts.createTreasuryAccount(accountForm('Banco pagos'))).id;
      const all = await regimes.getWithholdingRegimes();
      const gan = all.find((r) => r.tax === 'GANANCIAS' && r.code === '078')!;
      const iva = all.find((r) => r.tax === 'IVA')!;
      const iibb = expectOk(
        await regimes.createWithholdingRegime({
          tax: 'IIBB', code: '001', description: 'IIBB Neuquén', rateRegistered: '2.5', rateUnregistered: '', monthlyExemptAmount: '', minimumWithholding: '', vatPercentage: '', scale: [],
        })
      );
      const none = { status: 'NONE' as const, regimeId: '', rate: '', exclusionPercentage: '', exclusionFrom: '', exclusionTo: '', exclusionCertificate: '' };
      expectOk(
        await profiles.saveSupplierWithholdingProfiles(SUPPLIER, {
          profiles: {
            GANANCIAS: { ...none, status: 'SUBJECT', regimeId: gan.id },
            IVA: { ...none, status: 'SUBJECT', regimeId: iva.id },
            IIBB: { ...none, status: 'SUBJECT', regimeId: iibb.id, rate: '1.5' },
            SUSS: none,
          },
        })
      );
    });

    it('pago parcial con retenciones; el pendiente cuenta el borrador', async () => {
      const actions = await import('./payment-orders.server');
      const invoice = await expenseInvoice(SUPPLIER, '1000000');
      const order = expectOk(await actions.createPaymentOrder(paymentForm(SUPPLIER, [invoiceLine(invoice, '605000')])));
      expect(order.number).toMatch(/^OP-\d{6}$/);
      const row = await orderRow(order.id);
      // Ganancias (500000 − 224000) × 2 % = 5520; IVA 105000 × 50 % = 52500; IIBB 500000 × 1,5 % = 7500
      expect(amounts(row.withholdings)).toEqual({ GANANCIAS: '5520', IIBB: '7500', IVA: '52500' });
      expect(row.net_total.toString()).toBe('539480');
      const data = await actions.getPaymentOrderFormData(SUPPLIER);
      expect(data?.openItems.invoices.find((i) => i.id === invoice)?.pending).toBe('605000.00');
      expect(expectFail(await actions.createPaymentOrder(paymentForm(SUPPLIER, [invoiceLine(invoice, '605000.01')])))).toMatch(/supera lo pendiente/);
    });

    it('circuito: aprobar y pagar; medios que no suman, otro mes; certificados numerados', async () => {
      const actions = await import('./payment-orders.server');
      const invoice = await expenseInvoice(SUPPLIER, '10000');
      const order = expectOk(await actions.createPaymentOrder(paymentForm(SUPPLIER, [invoiceLine(invoice, '12100')])));
      expect(expectFail(await actions.registerPayment(order.id, payValues('1')))).toMatch(/ya fue|no está aprobada/);
      expectOk(await actions.submitPaymentOrder(order.id));
      state.denied.add('compras:pagos:approve');
      expect(expectFail(await actions.approvePaymentOrder(order.id))).toBe('No tenés permiso para realizar esta acción');
      state.denied.clear();
      expectOk(await actions.approvePaymentOrder(order.id));
      const row = await orderRow(order.id);
      const net = row.net_total.toString();
      expect(expectFail(await actions.registerPayment(order.id, payValues('1')))).toMatch(/no suman el neto/);
      expect(expectFail(await actions.registerPayment(order.id, payValues(net, { paidOn: NEXT_MONTH })))).toMatch(/volvé la orden a borrador/);
      expectOk(await actions.registerPayment(order.id, payValues(net)));
      const paid = await orderRow(order.id);
      expect(paid.status).toBe('PAID');
      expect(paid.withholdings.every((w) => /^(GAN|IVA|IIBB|SUSS)-\d{6}$/.test(w.certificate_number ?? ''))).toBe(true);
    });

    it('acumulado de Ganancias entre dos ordenes pagadas del mes', async () => {
      const actions = await import('./payment-orders.server');
      const prisma = await db();
      const before = await prisma.payment_orders.aggregate({
        where: { supplier_id: SUPPLIER, status: 'PAID' },
        _sum: { withholding_net_base: true },
      });
      const invoice = await expenseInvoice(SUPPLIER, '400000');
      const first = expectOk(await actions.createPaymentOrder(paymentForm(SUPPLIER, [invoiceLine(invoice, '242000')])));
      await approveAndPay(first.id, (await orderRow(first.id)).net_total.toString());
      const second = expectOk(await actions.createPaymentOrder(paymentForm(SUPPLIER, [invoiceLine(invoice, '242000')])));
      const gan = (await orderRow(second.id)).withholdings.find((w) => w.tax === 'GANANCIAS');
      const previousBase = Number(before._sum.withholding_net_base ?? 0) + 200000;
      const accumulated = previousBase + 200000;
      const paidGan = await prisma.payment_order_withholdings.aggregate({
        where: { tax: 'GANANCIAS', cancelled_at: null, payment_order: { supplier_id: SUPPLIER, status: 'PAID' } },
        _sum: { amount: true },
      });
      const expected = Math.round((Math.max(accumulated - 224000, 0) * 2) ) / 100 - Number(paidGan._sum.amount ?? 0);
      expect(Number(gan?.amount ?? 0)).toBeCloseTo(expected, 2);
    });

    it('dos borradores del mes: al pagar el segundo se exige recalcular Ganancias con el primero pagado', async () => {
      const actions = await import('./payment-orders.server');
      const invoice = await expenseInvoice(SUPPLIER, '600000');
      const first = expectOk(await actions.createPaymentOrder(paymentForm(SUPPLIER, [invoiceLine(invoice, '363000')])));
      const second = expectOk(await actions.createPaymentOrder(paymentForm(SUPPLIER, [invoiceLine(invoice, '363000')])));
      const ganBefore = Number((await orderRow(second.id)).withholdings.find((w) => w.tax === 'GANANCIAS')?.amount ?? 0);
      expectOk(await actions.submitPaymentOrder(second.id));
      expectOk(await actions.approvePaymentOrder(second.id));
      await approveAndPay(first.id, (await orderRow(first.id)).net_total.toString());
      expect(expectFail(await actions.registerPayment(second.id, payValues((await orderRow(second.id)).net_total.toString())))).toMatch(
        /La retención de Ganancias cambió .*Volvé la orden a borrador/
      );
      expectOk(await actions.backToDraftPaymentOrder(second.id));
      expectOk(await actions.updatePaymentOrder(second.id, paymentForm(SUPPLIER, [invoiceLine(invoice, '363000')])));
      const ganAfter = Number((await orderRow(second.id)).withholdings.find((w) => w.tax === 'GANANCIAS')?.amount ?? 0);
      expect(ganAfter).toBeGreaterThan(ganBefore);
      await approveAndPay(second.id, (await orderRow(second.id)).net_total.toString());
    });

    it('neto 0 (factura compensada con su NC): se paga sin medios de pago', async () => {
      const actions = await import('./payment-orders.server');
      const invoice = await expenseInvoice(OTHER_SUPPLIER, '1000');
      const credit = await expenseInvoice(OTHER_SUPPLIER, '1000', 3, invoice);
      const order = expectOk(await actions.createPaymentOrder(paymentForm(OTHER_SUPPLIER, [invoiceLine(invoice, '1210'), creditLine(credit, '1210')])));
      expect((await orderRow(order.id)).net_total.toString()).toBe('0');
      expectOk(await actions.submitPaymentOrder(order.id));
      expectOk(await actions.approvePaymentOrder(order.id));
      expectOk(await actions.registerPayment(order.id, { paidOn: TODAY, payments: [] }));
      expect((await orderRow(order.id)).status).toBe('PAID');
      const prisma = await db();
      expect(await prisma.treasury_movements.count({ where: { payment_order_payment: { payment_order_id: order.id } } })).toBe(0);
      const other = await expenseInvoice(OTHER_SUPPLIER, '500');
      const withNet = expectOk(await actions.createPaymentOrder(paymentForm(OTHER_SUPPLIER, [invoiceLine(other, '605')])));
      expectOk(await actions.submitPaymentOrder(withNet.id));
      expectOk(await actions.approvePaymentOrder(withNet.id));
      expect(expectFail(await actions.registerPayment(withNet.id, { paidOn: TODAY, payments: [] }))).toBe('Agregá al menos un medio de pago');
    });

    it('concurrencia: dos ordenes sobre el mismo comprobante que juntas superan el pendiente', async () => {
      const actions = await import('./payment-orders.server');
      const invoice = await expenseInvoice(OTHER_SUPPLIER, '100000');
      const results = await Promise.all([
        actions.createPaymentOrder(paymentForm(OTHER_SUPPLIER, [invoiceLine(invoice, '80000')])),
        actions.createPaymentOrder(paymentForm(OTHER_SUPPLIER, [invoiceLine(invoice, '80000')])),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.find((r) => !r.ok) && !results.find((r) => !r.ok)!.ok && (results.find((r) => !r.ok) as { error: string }).error).toMatch(
        /supera lo pendiente/
      );
    });

    it('anticipo, NC y anticipo aplicado; no se anula la orden del anticipo consumido', async () => {
      const actions = await import('./payment-orders.server');
      const advanceOrder = expectOk(
        await actions.createPaymentOrder(paymentForm(OTHER_SUPPLIER, [], { advance: { amount: '50000', purchaseOrderId: '', description: 'Anticipo obra' } }))
      );
      await approveAndPay(advanceOrder.id, '50000.00');
      const invoice = await expenseInvoice(OTHER_SUPPLIER, '100000');
      const credit = await expenseInvoice(OTHER_SUPPLIER, '10000', 3, invoice);
      const data = await actions.getPaymentOrderFormData(OTHER_SUPPLIER);
      const advance = data!.openItems.advances[0]!;
      expect(advance.available).toBe('50000.00');
      const order = expectOk(
        await actions.createPaymentOrder(
          paymentForm(OTHER_SUPPLIER, [invoiceLine(invoice, '121000'), creditLine(credit, '12100'), advanceApplied(advance.lineId, '50000')])
        )
      );
      expect((await orderRow(order.id)).net_total.toString()).toBe('58900');
      expect(expectFail(await actions.cancelPaymentOrder(advanceOrder.id, 'Error'))).toMatch(/se aplicó en la OP-/);
      expectOk(await actions.cancelPaymentOrder(order.id, 'Rehacer'));
      expectOk(await actions.cancelPaymentOrder(advanceOrder.id, 'Error'));
      expect((await orderRow(advanceOrder.id)).status).toBe('CANCELLED');
    });

    it('anular una orden pagada anula sus certificados', async () => {
      const actions = await import('./payment-orders.server');
      const invoice = await expenseInvoice(SUPPLIER, '20000');
      const order = expectOk(await actions.createPaymentOrder(paymentForm(SUPPLIER, [invoiceLine(invoice, '24200')])));
      await approveAndPay(order.id, (await orderRow(order.id)).net_total.toString());
      expectOk(await actions.cancelPaymentOrder(order.id, 'Transferencia rebotada'));
      const row = await orderRow(order.id);
      expect(row.status).toBe('CANCELLED');
      expect(row.withholdings.every((w) => w.cancelled_at !== null)).toBe(true);
    });

    it('neto negativo y nada que pagar → error', async () => {
      const actions = await import('./payment-orders.server');
      const invoice = await expenseInvoice(OTHER_SUPPLIER, '1000');
      const credit = await expenseInvoice(OTHER_SUPPLIER, '5000', 3);
      expect(expectFail(await actions.createPaymentOrder(paymentForm(OTHER_SUPPLIER, [invoiceLine(invoice, '1210'), creditLine(credit, '6050')])))).toMatch(
        /neto a pagar da negativo/
      );
      expect(expectFail(await actions.createPaymentOrder(paymentForm(OTHER_SUPPLIER, [])))).toBe('Agregá qué se paga: comprobantes o un anticipo');
    });

    it('etapa 4: un comprobante en una orden no se edita ni se anula', async () => {
      const actions = await import('./payment-orders.server');
      const invoices = await import('./invoices.server');
      const invoice = await expenseInvoice(OTHER_SUPPLIER, '3000');
      const order = expectOk(await actions.createPaymentOrder(paymentForm(OTHER_SUPPLIER, [invoiceLine(invoice, '3630')])));
      expect(expectFail(await invoices.cancelSupplierInvoice(invoice, 'x'))).toBe(`Está en la ${order.number}: anulala o sacalo de ahí primero`);
      const values = await invoices.getSupplierInvoiceEditValues(invoice);
      expect(expectFail(await invoices.updateSupplierInvoice(invoice, values!))).toBe(`Está en la ${order.number}: anulala o sacalo de ahí primero`);
    });

    it('perimetro: proveedor y cuenta de otra empresa', async () => {
      const actions = await import('./payment-orders.server');
      expect(expectFail(await actions.createPaymentOrder(paymentForm(FOREIGN_SUPPLIER, [], { advance: { amount: '10', purchaseOrderId: '', description: '' } })))).toBe(
        'El proveedor no existe'
      );
      const order = expectOk(
        await actions.createPaymentOrder(paymentForm(OTHER_SUPPLIER, [], { advance: { amount: '100', purchaseOrderId: '', description: '' } }))
      );
      expectOk(await actions.submitPaymentOrder(order.id));
      expectOk(await actions.approvePaymentOrder(order.id));
      const bad = payValues('100.00');
      bad.payments[0]!.accountId = FOREIGN_ACCOUNT;
      expect(expectFail(await actions.registerPayment(order.id, bad))).toBe('La cuenta no existe');
    });

    describe('tesoreria: el pago mueve el saldo', () => {
      let chequesId = '';

      beforeAll(async () => {
        const accounts = await import('@/features/Treasury/actions/accounts.server');
        chequesId = expectOk(await accounts.createTreasuryAccount(accountForm('Banco cheques'))).id;
      });

      async function indicatorsOf(id: string) {
        const accounts = await import('@/features/Treasury/actions/accounts.server');
        const row = (await accounts.getTreasuryAccounts()).find((r) => r.id === id)!;
        return { balance: row.balance, toDebit: row.toDebit };
      }

      async function approvedAdvance(amount: string) {
        const actions = await import('./payment-orders.server');
        const order = expectOk(
          await actions.createPaymentOrder(paymentForm(OTHER_SUPPLIER, [], { plannedOn: AR_TODAY, advance: { amount, purchaseOrderId: '', description: 'Anticipo' } }))
        );
        expectOk(await actions.submitPaymentOrder(order.id));
        expectOk(await actions.approvePaymentOrder(order.id));
        return order;
      }

      const echeck = (amount: string, dueOn: string) => ({
        method: 'ECHECK' as const,
        accountId: chequesId,
        amount,
        reference: '',
        checkNumber: '987',
        checkBank: '',
        checkDueOn: dueOn,
      });
      const transfer = (amount: string) => ({ method: 'TRANSFER' as const, accountId: chequesId, amount, reference: 'T', checkNumber: '', checkBank: '', checkDueOn: '' });

      it('transferencia + e-cheq a mañana: dos movimientos, el e-cheq a debitar en su fecha; anular la orden anula los dos', async () => {
        const actions = await import('./payment-orders.server');
        const order = await approvedAdvance('1000');
        expectOk(await actions.registerPayment(order.id, { paidOn: AR_TODAY, payments: [transfer('400'), echeck('600', TOMORROW)] }));
        const prisma = await db();
        const movements = await prisma.treasury_movements.findMany({
          where: { payment_order_payment: { payment_order_id: order.id } },
          orderBy: { amount: 'asc' },
          select: { amount: true, date: true, kind: true, description: true, account_id: true },
        });
        expect(movements.map((m) => [m.kind, m.amount.toString(), m.date.toISOString().slice(0, 10), m.account_id])).toEqual([
          ['SUPPLIER_PAYMENT', '-600', TOMORROW, chequesId],
          ['SUPPLIER_PAYMENT', '-400', AR_TODAY, chequesId],
        ]);
        expect(movements[0]!.description).toBe(`${order.number} — Otro proveedor — Cheque N° 987`);
        expect(await indicatorsOf(chequesId)).toEqual({ balance: '-400.00', toDebit: '-600.00' });
        expect(revalidated.paths).toContain('/dashboard/treasury');
        revalidated.paths.length = 0;

        const results = await Promise.all([actions.cancelPaymentOrder(order.id, 'Primera'), actions.cancelPaymentOrder(order.id, 'Segunda')]);
        expect(results.filter((r) => r.ok)).toHaveLength(1);
        const reason = (await prisma.payment_orders.findUniqueOrThrow({ where: { id: order.id } })).cancel_reason;
        const cancelled = await prisma.treasury_movements.findMany({ where: { payment_order_payment: { payment_order_id: order.id } } });
        expect(cancelled.every((m) => m.cancelled_at !== null && m.cancel_reason === reason)).toBe(true);
        expect(revalidated.paths).toContain('/dashboard/treasury');
        expect(await indicatorsOf(chequesId)).toEqual({ balance: '0.00', toDebit: '0.00' });
      });

      it('un e-cheq con fecha de hoy entra al saldo y no queda a debitar', async () => {
        const actions = await import('./payment-orders.server');
        const order = await approvedAdvance('250');
        expectOk(await actions.registerPayment(order.id, { paidOn: AR_TODAY, payments: [echeck('250', AR_TODAY)] }));
        expect(await indicatorsOf(chequesId)).toEqual({ balance: '-250.00', toDebit: '0.00' });
      });

      it('pagar desde una cuenta desactivada dice cuál está inactiva', async () => {
        const actions = await import('./payment-orders.server');
        const accounts = await import('@/features/Treasury/actions/accounts.server');
        const order = await approvedAdvance('10');
        expectOk(await accounts.setTreasuryAccountActive(chequesId, false));
        expect(expectFail(await actions.registerPayment(order.id, { paidOn: AR_TODAY, payments: [transfer('10')] }))).toBe(
          'La cuenta «Banco cheques» está inactiva'
        );
        expectOk(await accounts.setTreasuryAccountActive(chequesId, true));
        expect((await orderRow(order.id)).status).toBe('APPROVED');
      });
    });
  });

  describe('cuenta corriente y retenciones del mes', () => {
    beforeAll(() => {
      state.denied.clear();
    });

    it('cuenta corriente: comprobantes suman, NC y ordenes pagadas restan; saldo y resumen', async () => {
      const account = await import('./supplier-account.server');
      const actions = await import('./payment-orders.server');
      const invoice = await expenseInvoice(OTHER_SUPPLIER, '10000');
      const before = await account.getSupplierAccount(OTHER_SUPPLIER);
      expect(before).not.toBeNull();
      const order = expectOk(await actions.createPaymentOrder(paymentForm(OTHER_SUPPLIER, [invoiceLine(invoice, '12100')])));
      await approveAndPay(order.id, (await orderRow(order.id)).net_total.toString());
      const after = await account.getSupplierAccount(OTHER_SUPPLIER);
      expect(Number(after!.summary.balance)).toBeCloseTo(Number(before!.summary.balance) - 12100, 2);
      const last = after!.movements.at(-1)!;
      expect(last.kind).toBe('PAYMENT');
      expect(last.label).toBe(order.number);
      expect(Number(last.balance)).toBeCloseTo(Number(after!.summary.balance), 2);
      expect(await account.getSupplierAccount(FOREIGN_SUPPLIER)).toBeNull();
    });

    it('retenciones del mes: listado, totales y archivos con el largo justo', async () => {
      const report = await import('./withholdings-report.server');
      const actions = await import('./payment-orders.server');
      const big = await expenseInvoice(SUPPLIER, '2000000');
      const order = expectOk(await actions.createPaymentOrder(paymentForm(SUPPLIER, [invoiceLine(big, '2420000')])));
      await approveAndPay(order.id, (await orderRow(order.id)).net_total.toString());
      const period = TODAY.slice(0, 7);
      const all = await report.getWithholdingsReport(period);
      expect(all).not.toBeNull();
      const gan = all!.rows.filter((r) => r.tax === 'GANANCIAS' && !r.cancelled);
      expect(gan.length).toBeGreaterThan(0);
      expect(gan.every((r) => /^GAN-\d{6}$/.test(r.certificateNumber))).toBe(true);
      const exported = expectOk(await report.exportWithholdingsTxt(period));
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(Buffer.from(exported.base64, 'base64'));
      const sicore = (await zip.file('SICORE_RETENCIONES_GANANCIAS.txt')!.async('string')).split('\r\n');
      expect(sicore).toHaveLength(gan.length);
      for (const line of sicore) expect(line).toHaveLength(144);
      // La situacion y la exclusion salen de lo guardado al calcular, no del perfil actual.
      const prisma = await db();
      const saved = await prisma.payment_order_withholdings.findMany({
        where: { payment_order_id: order.id },
        select: { tax: true, supplier_status: true, exclusion_percentage: true },
      });
      expect(saved.every((w) => w.supplier_status === 'SUBJECT' && w.exclusion_percentage === null)).toBe(true);
      await prisma.supplier_withholding_profiles.updateMany({
        where: { supplier_id: SUPPLIER, tax: 'GANANCIAS' },
        data: { status: 'NOT_REGISTERED', exclusion_percentage: 50, exclusion_from: new Date('2020-01-01'), exclusion_to: new Date('2020-12-31') },
      });
      const again = await JSZip.loadAsync(Buffer.from(expectOk(await report.exportWithholdingsTxt(period)).base64, 'base64'));
      expect(await again.file('SICORE_RETENCIONES_GANANCIAS.txt')!.async('string')).toBe(sicore.join('\r\n'));
      await prisma.supplier_withholding_profiles.updateMany({
        where: { supplier_id: SUPPLIER, tax: 'GANANCIAS' },
        data: { status: 'SUBJECT', exclusion_percentage: null, exclusion_from: null, exclusion_to: null },
      });
      state.denied.add('compras:retenciones:view');
      expect(await report.getWithholdingsReport(period)).toBeNull();
      expect(expectFail(await report.exportWithholdingsTxt(period))).toBe('No tenés permiso para realizar esta acción');
    });
  });
});
