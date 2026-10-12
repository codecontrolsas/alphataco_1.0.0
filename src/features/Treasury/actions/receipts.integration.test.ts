import moment from 'moment';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { treasuryToday } from '../lib/today';

/**
 * Tesorería etapa 2 (cobranzas) contra el Postgres del compose: `npm run test:treasury`. Se
 * simulan la sesión, la empresa activa, los permisos, el storage y el mail.
 */

const COMPANY = 'e9000000-0000-4000-8000-000000000001';
const OTHER_COMPANY = 'e9000000-0000-4000-8000-000000000002';
const USER = 'e9000000-0000-4000-8000-000000000003';
const CUSTOMER_A = 'e9000000-0000-4000-8000-000000000010';
const CUSTOMER_B = 'e9000000-0000-4000-8000-000000000011';
const FOREIGN_CUSTOMER = 'e9000000-0000-4000-8000-000000000012';
const SALES_POINT = 'e9000000-0000-4000-8000-000000000020';
const FOREIGN_SALES_POINT = 'e9000000-0000-4000-8000-000000000021';
const BANK = 'e9000000-0000-4000-8000-000000000030';
const CASH = 'e9000000-0000-4000-8000-000000000031';
const PORTFOLIO = 'e9000000-0000-4000-8000-000000000032';

const state = vi.hoisted(() => ({ denied: new Set<string>() }));

vi.mock('@/shared/lib/tenant', () => ({ getActiveCompanyId: async () => 'e9000000-0000-4000-8000-000000000001' }));
vi.mock('@/features/Permissions', () => ({
  checkPermissionServer: async (module: string, tab: string, action: string) => !state.denied.has(`${module}:${tab}:${action}`),
}));
vi.mock('@/shared/actions/auth.actions', () => {
  const current = () => ({
    id: 'e9000000-0000-4000-8000-000000000003',
    credentialId: 'e9000000-0000-4000-8000-000000000003',
    fullname: null,
    email: null,
  });
  return { getServerAuthProfile: async () => current(), requireServerAuthProfile: async () => current() };
});
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

const files = vi.hoisted(() => ({
  storageUpload: vi.fn(async (_bucket: string, path: string) => ({ ok: true as const, data: { path } })),
  storageRemove: vi.fn(async () => ({ ok: true as const, data: null })),
  storagePublicUrl: vi.fn(async (bucket: string, path: string) => `/api/files/${bucket}/${path}`),
  storageDownload: vi.fn(async () => ({ ok: false as const, error: 'sin archivo', code: 'not-found' as const })),
  sendCustomerReceiptEmail: vi.fn(async () => true),
}));
vi.mock('@/shared/lib/storage', () => ({
  storageUpload: files.storageUpload,
  storageRemove: files.storageRemove,
  storagePublicUrl: files.storagePublicUrl,
  storageDownload: files.storageDownload,
}));
vi.mock('@/shared/lib/mail/templates/treasury', () => ({ sendCustomerReceiptEmail: files.sendCustomerReceiptEmail }));
vi.mock('../pdf/render-receipt-pdf.server', () => ({
  renderCustomerReceiptPdf: async () => ({ filename: 'recibo.pdf', content: new Uint8Array([37, 80, 68, 70]) }),
}));

const RUN = Boolean(process.env.DATABASE_URL);

// Hoy en hora argentina, como el servidor (lib/today.ts).
const TODAY = treasuryToday();
const TOMORROW = moment(TODAY).add(1, 'day').format('YYYY-MM-DD');
const YESTERDAY = moment(TODAY).subtract(1, 'day').format('YYYY-MM-DD');
const IN_30_DAYS = moment(TODAY).add(30, 'days').format('YYYY-MM-DD');

function expectOk<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(`Se esperaba ok y vino: ${result.error}`);
  return result.data;
}

function expectFail(result: { ok: true } | { ok: false; error: string }): string {
  if (result.ok) throw new Error('Se esperaba un error');
  return result.error;
}

async function db() {
  return (await import('@/shared/lib/prisma')).prisma;
}

/** Los comprobantes autorizados tienen guarda de DELETE: se borran sin triggers. */
async function cleanup() {
  const prisma = await db();
  const companies = [COMPANY, OTHER_COMPANY];
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
    await tx.$executeRaw`DELETE FROM treasury_movements WHERE company_id = ANY(${companies}::uuid[])`;
    await tx.$executeRaw`DELETE FROM third_party_check_events e USING third_party_checks c WHERE c.id = e.check_id AND c.company_id = ANY(${companies}::uuid[])`;
    await tx.$executeRaw`DELETE FROM third_party_checks WHERE company_id = ANY(${companies}::uuid[])`;
    await tx.$executeRaw`DELETE FROM customer_receipts WHERE company_id = ANY(${companies}::uuid[])`;
    await tx.$executeRaw`DELETE FROM customer_receipt_lines l WHERE NOT EXISTS (SELECT 1 FROM customer_receipts r WHERE r.id = l.receipt_id)`;
    await tx.$executeRaw`DELETE FROM customer_receipt_withholdings w WHERE NOT EXISTS (SELECT 1 FROM customer_receipts r WHERE r.id = w.receipt_id)`;
    await tx.$executeRaw`DELETE FROM customer_receipt_payments p WHERE NOT EXISTS (SELECT 1 FROM customer_receipts r WHERE r.id = p.receipt_id)`;
    await tx.$executeRaw`DELETE FROM invoices WHERE company_id = ANY(${companies}::uuid[])`;
    await tx.$executeRaw`DELETE FROM sales_points WHERE company_id = ANY(${companies}::uuid[])`;
    await tx.$executeRaw`DELETE FROM customers WHERE company_id = ANY(${companies}::uuid[])`;
    await tx.$executeRaw`DELETE FROM treasury_accounts WHERE company_id = ANY(${companies}::uuid[])`;
    await tx.$executeRaw`DELETE FROM profile WHERE id = ${USER}::uuid`;
    await tx.$executeRaw`DELETE FROM company WHERE id = ANY(${companies}::uuid[])`;
  });
}

let invoiceNumber = 0;

/** Comprobante autorizado (simulado) insertado directo: el INSERT no tiene guarda. */
async function insertInvoice(input: {
  cbteType?: number;
  total: string;
  currency?: 'ARS' | 'USD';
  exchangeRate?: string;
  customerId?: string;
  companyId?: string;
  issueDate?: string;
  dueDate?: string | null;
  associatedInvoiceId?: string;
}): Promise<string> {
  const prisma = await db();
  invoiceNumber += 1;
  const companyId = input.companyId ?? COMPANY;
  const currency = input.currency ?? 'ARS';
  const invoice = await prisma.invoices.create({
    data: {
      company_id: companyId,
      environment: 'homologacion',
      status: 'autorizada',
      simulated: true,
      sales_point_id: companyId === COMPANY ? SALES_POINT : FOREIGN_SALES_POINT,
      customer_id: input.customerId ?? CUSTOMER_A,
      cbte_type: input.cbteType ?? 1,
      number: invoiceNumber,
      issue_date: new Date(`${input.issueDate ?? '2026-09-01'}T00:00:00.000Z`),
      payment_due_date: input.dueDate === null ? null : new Date(`${input.dueDate ?? '2026-09-30'}T00:00:00.000Z`),
      currency,
      arca_currency_id: currency === 'ARS' ? 'PES' : 'DOL',
      exchange_rate: input.exchangeRate ?? '1',
      net_taxed: input.total,
      total: input.total,
      receiver_doc_number: BigInt(30712345679),
      receiver_vat_condition_id: 1,
      associated_invoice_id: input.associatedInvoiceId ?? null,
      cae: '12345678901234',
      cae_due_date: new Date('2026-12-31T00:00:00.000Z'),
      authorized_at: new Date(),
    },
    select: { id: true },
  });
  return invoice.id;
}

type LineInput =
  | { kind: 'INVOICE'; invoiceId: string; amount: string; currency?: string; rate?: string; invoiceRate?: string; ars?: string }
  | { kind: 'ADVANCE'; amount: string; description?: string }
  | { kind: 'ADVANCE_APPLIED'; sourceLineId: string; amount: string };

let receiptNumber = 900;

/** Recibo insertado directo (para probar las lecturas sin pasar por las actions). */
async function insertReceipt(input: {
  status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
  customerId?: string;
  date?: string;
  lines: LineInput[];
}): Promise<{ id: string; lineIds: string[] }> {
  const prisma = await db();
  const now = new Date();
  const numbered = input.status !== 'DRAFT';
  if (numbered) receiptNumber += 1;
  const receipt = await prisma.customer_receipts.create({
    data: {
      company_id: COMPANY,
      customer_id: input.customerId ?? CUSTOMER_A,
      status: input.status,
      number: numbered ? `RE-${receiptNumber}` : null,
      date: new Date(`${input.date ?? '2026-09-10'}T00:00:00.000Z`),
      created_by: USER,
      confirmed_by: numbered ? USER : null,
      confirmed_at: numbered ? now : null,
      cancelled_by: input.status === 'CANCELLED' ? USER : null,
      cancelled_at: input.status === 'CANCELLED' ? now : null,
      cancel_reason: input.status === 'CANCELLED' ? 'prueba' : null,
    },
    select: { id: true },
  });
  const lineIds: string[] = [];
  for (const [position, line] of input.lines.entries()) {
    const created = await prisma.customer_receipt_lines.create({
      data: {
        receipt_id: receipt.id,
        position,
        kind: line.kind,
        invoice_id: line.kind === 'INVOICE' ? line.invoiceId : null,
        source_line_id: line.kind === 'ADVANCE_APPLIED' ? line.sourceLineId : null,
        currency: line.kind === 'INVOICE' ? (line.currency ?? 'ARS') : 'ARS',
        applied_amount: line.amount,
        exchange_rate: line.kind === 'INVOICE' ? (line.rate ?? '1') : '1',
        invoice_exchange_rate: line.kind === 'INVOICE' ? (line.invoiceRate ?? '1') : '1',
        amount_ars: line.kind === 'INVOICE' ? (line.ars ?? line.amount) : line.amount,
        description: line.kind === 'ADVANCE' ? (line.description ?? null) : null,
      },
      select: { id: true },
    });
    lineIds.push(created.id);
  }
  return { id: receipt.id, lineIds };
}

describe.skipIf(!RUN)('cobranzas (integracion)', () => {
  beforeAll(async () => {
    await cleanup();
    const prisma = await db();
    const city = await prisma.cities.findFirstOrThrow({ select: { id: true } });
    for (const [id, cuit] of [
      [COMPANY, '30999999970'],
      [OTHER_COMPANY, '30999999954'],
    ] as const) {
      await prisma.company.create({
        data: {
          id,
          company_name: `Cobranzas test ${cuit}`,
          description: 'empresa de prueba',
          contact_email: 'cobranzas-test@alphataco.local',
          contact_phone: '+542991234567',
          address: 'Calle 123',
          city: city.id,
          country: 'argentina',
          industry: 'Petroleo',
          company_cuit: cuit,
        },
      });
    }
    await prisma.profile.create({ data: { id: USER, credential_id: USER, email: 'cobranzas@alphataco.local' } });
    await prisma.customers.createMany({
      data: [
        { id: CUSTOMER_A, company_id: COMPANY, name: 'Cliente A', cuit: BigInt(30711111118), client_email: 'pagos@cliente-a.test', vat_condition_id: 1 },
        { id: CUSTOMER_B, company_id: COMPANY, name: 'Cliente B', cuit: BigInt(30722222226), vat_condition_id: 1 },
        { id: FOREIGN_CUSTOMER, company_id: OTHER_COMPANY, name: 'Ajeno', cuit: BigInt(30733333334), vat_condition_id: 1 },
      ],
    });
    await prisma.sales_points.createMany({
      data: [
        { id: SALES_POINT, company_id: COMPANY, number: 9, name: 'PV test' },
        { id: FOREIGN_SALES_POINT, company_id: OTHER_COMPANY, number: 9, name: 'PV ajeno' },
      ],
    });
    await prisma.treasury_accounts.createMany({
      data: [
        { id: BANK, company_id: COMPANY, kind: 'BANK', name: 'Banco test' },
        { id: CASH, company_id: COMPANY, kind: 'CASH', name: 'Caja test' },
        { id: PORTFOLIO, company_id: COMPANY, kind: 'CHECK_PORTFOLIO', name: 'Cartera test' },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    await cleanup();
  }, 60_000);

  beforeEach(() => {
    state.denied.clear();
  });

  describe('lecturas: pendiente, anticipos y cuenta corriente', () => {
    it('pendiente = total − NC − cobrado − reservado; un recibo anulado no cuenta', async () => {
      const { invoiceBalances } = await import('../lib/receivables');
      const prisma = await db();
      const invoice = await insertInvoice({ total: '1000.00' });
      await insertInvoice({ cbteType: 3, total: '200.00', associatedInvoiceId: invoice });
      await insertReceipt({ status: 'CONFIRMED', lines: [{ kind: 'INVOICE', invoiceId: invoice, amount: '300.00' }] });
      const draft = await insertReceipt({ status: 'DRAFT', lines: [{ kind: 'INVOICE', invoiceId: invoice, amount: '100.00' }] });
      await insertReceipt({ status: 'CANCELLED', lines: [{ kind: 'INVOICE', invoiceId: invoice, amount: '50.00' }] });

      const balance = (await invoiceBalances(prisma, [invoice])).get(invoice);
      expect(balance).toMatchObject({ total: '1000.00', credited: '200.00', collected: '300.00', reserved: '100.00', pending: '400.00' });
      const excluding = (await invoiceBalances(prisma, [invoice], { excludeReceiptId: draft.id })).get(invoice);
      expect(excluding).toMatchObject({ reserved: '0.00', pending: '500.00' });
    });

    it('comprobantes abiertos del cliente: facturas y ND con pendiente, sin NC ni lo ya cobrado', async () => {
      const { openInvoicesOfCustomer } = await import('../lib/receivables');
      const prisma = await db();
      const open = await insertInvoice({ total: '700.00', customerId: CUSTOMER_B, dueDate: '2026-09-05' });
      const debit = await insertInvoice({ cbteType: 2, total: '50.00', customerId: CUSTOMER_B, associatedInvoiceId: open, dueDate: null });
      const paid = await insertInvoice({ total: '100.00', customerId: CUSTOMER_B });
      await insertReceipt({ status: 'CONFIRMED', customerId: CUSTOMER_B, lines: [{ kind: 'INVOICE', invoiceId: paid, amount: '100.00' }] });
      await insertInvoice({ total: '999.00', customerId: FOREIGN_CUSTOMER, companyId: OTHER_COMPANY });

      const rows = await openInvoicesOfCustomer(prisma, COMPANY, CUSTOMER_B);
      expect(rows.map((r) => [r.invoiceId, r.pending])).toEqual([
        [open, '700.00'],
        [debit, '50.00'],
      ]);
      expect(rows[0]?.label).toMatch(/^Factura A 00009-\d{8}$/);
      expect(rows[0]?.dueDate).toBe('2026-09-05');
      expect(await openInvoicesOfCustomer(prisma, COMPANY, FOREIGN_CUSTOMER)).toEqual([]);
    });

    it('disponible de un anticipo: solo de recibos confirmados, menos lo aplicado (los borradores reservan)', async () => {
      const { advanceBalances, availableAdvancesOfCustomer } = await import('../lib/receivables');
      const prisma = await db();
      const origin = await insertReceipt({ status: 'CONFIRMED', customerId: CUSTOMER_B, lines: [{ kind: 'ADVANCE', amount: '1000.00', description: 'A cuenta' }] });
      const advanceLine = origin.lineIds[0] as string;
      const draft = await insertReceipt({
        status: 'DRAFT',
        customerId: CUSTOMER_B,
        lines: [{ kind: 'ADVANCE_APPLIED', sourceLineId: advanceLine, amount: '300.00' }],
      });
      const notYet = await insertReceipt({ status: 'DRAFT', customerId: CUSTOMER_B, lines: [{ kind: 'ADVANCE', amount: '50.00' }] });

      expect((await advanceBalances(prisma, [advanceLine])).get(advanceLine)).toMatchObject({ amount: '1000.00', available: '700.00' });
      expect((await advanceBalances(prisma, [advanceLine], { excludeReceiptId: draft.id })).get(advanceLine)?.available).toBe('1000.00');
      expect((await advanceBalances(prisma, [notYet.lineIds[0] as string])).size).toBe(0);
      const listed = await availableAdvancesOfCustomer(prisma, COMPANY, CUSTOMER_B);
      expect(listed.map((a) => [a.lineId, a.available, a.description])).toEqual([[advanceLine, '700.00', 'A cuenta']]);
    });

    it('una NC posterior al cobro total deja saldo a favor', async () => {
      const { creditBalanceOfCustomer, invoiceBalances } = await import('../lib/receivables');
      const prisma = await db();
      const customer = await prisma.customers.create({
        data: { company_id: COMPANY, name: 'Cliente NC', cuit: BigInt(30744444442), vat_condition_id: 1 },
        select: { id: true },
      });
      const invoice = await insertInvoice({ total: '500.00', customerId: customer.id });
      await insertReceipt({ status: 'CONFIRMED', customerId: customer.id, lines: [{ kind: 'INVOICE', invoiceId: invoice, amount: '500.00' }] });
      await insertInvoice({ cbteType: 3, total: '100.00', customerId: customer.id, associatedInvoiceId: invoice });
      expect((await invoiceBalances(prisma, [invoice])).get(invoice)?.pending).toBe('-100.00');
      expect(await creditBalanceOfCustomer(prisma, COMPANY, customer.id)).toEqual({ ARS: '100.00' });
    });

    it('cuenta corriente: saldo anterior y acumulado por moneda', async () => {
      const { getCustomerStatement } = await import('../lib/customer-statement');
      const prisma = await db();
      const customer = await prisma.customers.create({
        data: { company_id: COMPANY, name: 'Cliente CC', cuit: BigInt(30755555550), vat_condition_id: 1 },
        select: { id: true },
      });
      const old = await insertInvoice({ total: '100.00', customerId: customer.id, issueDate: '2026-08-15' });
      const ars = await insertInvoice({ total: '1000.00', customerId: customer.id, issueDate: '2026-09-02' });
      const usd = await insertInvoice({ total: '50.00', currency: 'USD', exchangeRate: '1000', customerId: customer.id, issueDate: '2026-09-03' });
      await insertInvoice({ cbteType: 3, total: '200.00', customerId: customer.id, associatedInvoiceId: ars, issueDate: '2026-09-04' });
      await insertReceipt({
        status: 'CONFIRMED',
        customerId: customer.id,
        date: '2026-09-20',
        lines: [
          { kind: 'INVOICE', invoiceId: ars, amount: '300.00' },
          { kind: 'INVOICE', invoiceId: usd, amount: '20.00', currency: 'USD', rate: '1100', invoiceRate: '1000', ars: '22000.00' },
          { kind: 'ADVANCE', amount: '40.00' },
        ],
      });
      await insertReceipt({ status: 'CANCELLED', customerId: customer.id, date: '2026-09-21', lines: [{ kind: 'INVOICE', invoiceId: ars, amount: '1.00' }] });

      const statement = await getCustomerStatement(prisma, COMPANY, customer.id, '2026-09-01', '2026-09-30');
      expect(statement.customer.name).toBe('Cliente CC');
      const [pesos, dollars] = statement.currencies;
      expect(pesos?.currency).toBe('ARS');
      expect(pesos?.previous).toBe('100.00');
      expect(pesos?.rows.slice(0, 2).map((r) => [r.kind, r.debit, r.credit, r.balance])).toEqual([
        ['INVOICE', '1000.00', '0.00', '1100.00'],
        ['CREDIT_NOTE', '0.00', '200.00', '900.00'],
      ]);
      // Las dos líneas del recibo son del mismo día: su orden relativo es por id (no se fija acá).
      expect(pesos?.rows.slice(2).map((r) => [r.kind, r.credit]).sort()).toEqual([
        ['ADVANCE', '40.00'],
        ['RECEIPT', '300.00'],
      ]);
      expect(pesos?.closing).toBe('560.00');
      expect(pesos?.rows.find((r) => r.kind === 'RECEIPT')?.label).toMatch(/^RE-\d+ · Factura A 00009-\d{8}$/);
      expect(dollars?.currency).toBe('USD');
      expect(dollars?.closing).toBe('30.00');
      expect(statement.advancesAvailable).toBe('40.00');
      expect(old).toBeTruthy();
    });
  });

  describe('recibo: borrador, confirmación, anulación y envío', () => {
    type Values = import('../schemas/receipts').ReceiptFormValues;
    type Payment = Values['payments'][number];
    const payment = (amount: string, over: Partial<Payment> = {}): Payment => ({
      method: 'TRANSFER',
      accountId: BANK,
      amount,
      reference: '',
      checkNumber: '',
      checkBank: '',
      checkDueOn: '',
      ...over,
    });
    const form = (over: Partial<Values> = {}): Values => ({
      customerId: CUSTOMER_A,
      date: TODAY,
      notes: '',
      rates: [],
      invoices: [],
      advancesApplied: [],
      advance: { amount: '', description: '' },
      withholdings: [],
      payments: [],
      ...over,
    });
    const actions = () => import('./receipts.server');
    async function pendingOf(invoiceId: string) {
      const { invoiceBalances } = await import('../lib/receivables');
      return (await invoiceBalances(await db(), [invoiceId])).get(invoiceId)?.pending;
    }
    async function movementsOf(receiptId: string) {
      const prisma = await db();
      return prisma.treasury_movements.findMany({
        where: { customer_receipt_payment: { receipt_id: receiptId } },
        select: { kind: true, amount: true, date: true, description: true, cancelled_at: true, cancel_reason: true },
      });
    }
    async function statusOf(receiptId: string) {
      const prisma = await db();
      return prisma.customer_receipts.findUniqueOrThrow({ where: { id: receiptId }, select: { status: true, number: true, sent_to: true } });
    }
    async function balanceOf(accountId: string) {
      const { getAccountIndicators } = await import('../lib/balances');
      return (await getAccountIndicators(await db(), COMPANY, TODAY, [accountId])).get(accountId)?.balance ?? '0.00';
    }

    it('borrador sin número ni movimientos; al confirmar toma número y mueve la cuenta', async () => {
      const { confirmReceipt, saveReceiptDraft } = await actions();
      const invoice = await insertInvoice({ total: '1000.00' });
      const values = form({ invoices: [{ invoiceId: invoice, amount: '400' }], payments: [payment('400')] });
      const draft = expectOk(await saveReceiptDraft(null, values));
      expect(await statusOf(draft.id)).toMatchObject({ status: 'DRAFT', number: null });
      expect(await movementsOf(draft.id)).toEqual([]);
      expect(await pendingOf(invoice)).toBe('600.00');

      const confirmed = expectOk(await confirmReceipt(draft.id, values));
      expect(confirmed.number).toMatch(/^RE-\d{6}$/);
      const movements = await movementsOf(draft.id);
      expect(movements).toHaveLength(1);
      expect(movements[0]).toMatchObject({ kind: 'CUSTOMER_RECEIPT', description: `${confirmed.number} — Cliente A` });
      expect(movements[0]?.amount.toFixed(2)).toBe('400.00');
      expect(moment.utc(movements[0]?.date).format('YYYY-MM-DD')).toBe(TODAY);
      expect(await pendingOf(invoice)).toBe('600.00');
    });

    it('cheques (etapa 3a): a fecha o vencidos, entran a la cartera en la fecha del cobro', async () => {
      const { confirmReceipt } = await actions();
      const invoice = await insertInvoice({ total: '300.00' });
      const check = { checkIssueDate: YESTERDAY, drawerName: 'Cliente A SA', drawerCuit: '30712345671' };
      const created = expectOk(
        await confirmReceipt(
          null,
          form({
            invoices: [{ invoiceId: invoice, amount: '300' }],
            payments: [
              payment('100', { method: 'ECHECK', accountId: PORTFOLIO, checkNumber: '111', checkBank: 'Galicia', checkDueOn: IN_30_DAYS, ...check }),
              payment('200', { method: 'CHECK', accountId: PORTFOLIO, checkNumber: '222', checkBank: 'Nación', checkDueOn: YESTERDAY, ...check }),
            ],
          })
        )
      );
      const dates = (await movementsOf(created.id)).map((m) => [m.amount.toFixed(2), moment.utc(m.date).format('YYYY-MM-DD')]).sort();
      expect(dates).toEqual([
        ['100.00', TODAY],
        ['200.00', TODAY],
      ]);
      expect((await movementsOf(created.id)).find((m) => m.amount.toFixed(2) === '100.00')?.description).toContain('Cheque N° 111');
    });

    it('fecha de hoy (Argentina) vale y mañana no; lo cobrado hoy entra al saldo', async () => {
      const { confirmReceipt, saveReceiptDraft } = await actions();
      const invoice = await insertInvoice({ total: '50.00' });
      const values = form({ invoices: [{ invoiceId: invoice, amount: '50' }], payments: [payment('50', { accountId: CASH, method: 'CASH' })] });
      expect(expectFail(await saveReceiptDraft(null, { ...values, date: TOMORROW }))).toBe('La fecha no puede ser futura');
      const before = await balanceOf(CASH);
      expectOk(await confirmReceipt(null, values));
      const after = await balanceOf(CASH);
      expect(Number(after) - Number(before)).toBe(50);
    });

    it('factura en USD cobrada en pesos: diferencia de cambio y pendiente en 0', async () => {
      const { confirmReceipt } = await actions();
      const { openInvoicesOfCustomer } = await import('../lib/receivables');
      const invoice = await insertInvoice({ total: '1000.00', currency: 'USD', exchangeRate: '1000', customerId: CUSTOMER_B });
      const created = expectOk(
        await confirmReceipt(
          null,
          form({
            customerId: CUSTOMER_B,
            rates: [{ currency: 'USD', rate: '1250' }],
            invoices: [{ invoiceId: invoice, amount: '1000.00' }],
            payments: [payment('1250000')],
          })
        )
      );
      const prisma = await db();
      const line = await prisma.customer_receipt_lines.findFirstOrThrow({ where: { receipt_id: created.id } });
      expect(line.amount_ars.toFixed(2)).toBe('1250000.00');
      expect(line.fx_difference.toFixed(2)).toBe('250000.00');
      expect(line.invoice_exchange_rate.toFixed(6)).toBe('1000.000000');
      const receipt = await prisma.customer_receipts.findUniqueOrThrow({ where: { id: created.id } });
      expect(receipt.fx_difference_total.toFixed(2)).toBe('250000.00');
      expect(await pendingOf(invoice)).toBe('0.00');
      expect((await openInvoicesOfCustomer(prisma, COMPANY, CUSTOMER_B)).some((r) => r.invoiceId === invoice)).toBe(false);
    });

    it('sin cotización de la moneda del comprobante no se guarda', async () => {
      const { saveReceiptDraft } = await actions();
      const invoice = await insertInvoice({ total: '10.00', currency: 'USD', exchangeRate: '1000' });
      expect(expectFail(await saveReceiptDraft(null, form({ invoices: [{ invoiceId: invoice, amount: '10' }] })))).toBe('Indicá la cotización del USD');
    });

    it('dos borradores no reservan más que el pendiente', async () => {
      const { saveReceiptDraft } = await actions();
      const invoice = await insertInvoice({ total: '500.00' });
      const values = form({ invoices: [{ invoiceId: invoice, amount: '500' }] });
      const results = await Promise.all([saveReceiptDraft(null, values), saveReceiptDraft(null, values)]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      const error = results.find((r) => !r.ok);
      expect(error && !error.ok ? error.error : '').toMatch(/el pendiente es \$ 0,00 y está reservado en otro borrador$/);
    });

    it('confirmaciones simultáneas: números consecutivos; el mismo borrador se confirma una vez', async () => {
      const { confirmReceipt, saveReceiptDraft } = await actions();
      const first = await insertInvoice({ total: '10.00' });
      const second = await insertInvoice({ total: '20.00' });
      const a = form({ invoices: [{ invoiceId: first, amount: '10' }], payments: [payment('10')] });
      const b = form({ invoices: [{ invoiceId: second, amount: '20' }], payments: [payment('20')] });
      const [ra, rb] = await Promise.all([confirmReceipt(null, a), confirmReceipt(null, b)]);
      const numbers = [expectOk(ra).number, expectOk(rb).number].map((n) => Number(n.slice(3))).sort((x, y) => x - y);
      expect(numbers[1]! - numbers[0]!).toBe(1);

      const third = await insertInvoice({ total: '30.00' });
      const c = form({ invoices: [{ invoiceId: third, amount: '30' }], payments: [payment('30')] });
      const draft = expectOk(await saveReceiptDraft(null, c));
      const twice = await Promise.all([confirmReceipt(draft.id, c), confirmReceipt(draft.id, c)]);
      expect(twice.filter((r) => r.ok)).toHaveLength(1);
      const failed = twice.find((r) => !r.ok);
      expect(failed && !failed.ok ? failed.error : '').toBe('El recibo ya fue confirmado');
      expect(await movementsOf(draft.id)).toHaveLength(1);
    });

    it('un recibo que no cierra no se confirma; uno vacío tampoco', async () => {
      const { confirmReceipt, saveReceiptDraft } = await actions();
      const invoice = await insertInvoice({ total: '400.00' });
      const values = form({ invoices: [{ invoiceId: invoice, amount: '400' }], payments: [payment('300')] });
      const draft = expectOk(await saveReceiptDraft(null, values));
      expect(expectFail(await confirmReceipt(draft.id, values))).toBe('El recibo no cierra: faltan $ 100,00');
      expect((await statusOf(draft.id)).status).toBe('DRAFT');
      expect(expectFail(await confirmReceipt(null, form()))).toBe('Cargá al menos un comprobante, un anticipo o un cobro a cuenta');
    });

    it('comprobantes de otro cliente, de otra empresa o NC se rechazan', async () => {
      const { saveReceiptDraft } = await actions();
      const ofB = await insertInvoice({ total: '10.00', customerId: CUSTOMER_B });
      const foreign = await insertInvoice({ total: '10.00', customerId: FOREIGN_CUSTOMER, companyId: OTHER_COMPANY });
      const base = await insertInvoice({ total: '10.00' });
      const credit = await insertInvoice({ cbteType: 3, total: '5.00', associatedInvoiceId: base });
      for (const invoiceId of [ofB, foreign]) {
        expect(expectFail(await saveReceiptDraft(null, form({ invoices: [{ invoiceId, amount: '1' }] })))).toBe('El comprobante no existe');
      }
      expect(expectFail(await saveReceiptDraft(null, form({ invoices: [{ invoiceId: credit, amount: '1' }] })))).toBe(
        'Las notas de crédito no se cobran'
      );
    });

    it('una NC autorizada mientras el recibo está en borrador frena la confirmación', async () => {
      const { confirmReceipt, saveReceiptDraft } = await actions();
      const invoice = await insertInvoice({ total: '1000.00' });
      const values = form({ invoices: [{ invoiceId: invoice, amount: '1000' }], payments: [payment('1000')] });
      const draft = expectOk(await saveReceiptDraft(null, values));
      await insertInvoice({ cbteType: 3, total: '1000.00', associatedInvoiceId: invoice });
      expect(expectFail(await confirmReceipt(draft.id, values))).toMatch(/: el pendiente es \$ 0,00$/);
      expect((await statusOf(draft.id)).status).toBe('DRAFT');
      expect(await movementsOf(draft.id)).toEqual([]);
    });

    it('anticipos: el cobro a cuenta queda disponible y aplicarlo no mueve plata; anular el origen se bloquea', async () => {
      const { cancelReceipt, confirmReceipt, saveReceiptDraft } = await actions();
      const prisma = await db();
      const origin = expectOk(await confirmReceipt(null, form({ advance: { amount: '1000', description: 'A cuenta' }, payments: [payment('1000')] })));
      const advanceLine = await prisma.customer_receipt_lines.findFirstOrThrow({ where: { receipt_id: origin.id, kind: 'ADVANCE' } });
      const invoice = await insertInvoice({ total: '300.00' });
      const applying = form({ invoices: [{ invoiceId: invoice, amount: '300' }], advancesApplied: [{ sourceLineId: advanceLine.id, amount: '300' }] });

      const draft = expectOk(await saveReceiptDraft(null, applying));
      expect(expectFail(await cancelReceipt(origin.id, 'error'))).toBe('El anticipo de este recibo se aplicó en un recibo en borrador: quitalo de ahí primero');
      expect((await statusOf(origin.id)).status).toBe('CONFIRMED');
      expect((await movementsOf(origin.id)).every((m) => m.cancelled_at === null)).toBe(true);

      const before = await balanceOf(BANK);
      const applied = expectOk(await confirmReceipt(draft.id, applying));
      expect(await movementsOf(draft.id)).toEqual([]);
      expect(await balanceOf(BANK)).toBe(before);
      expect(expectFail(await cancelReceipt(origin.id, 'error'))).toBe(
        `El anticipo de este recibo se aplicó en ${applied.number}: anulá ese recibo primero`
      );
      expect(expectFail(await saveReceiptDraft(null, form({ advancesApplied: [{ sourceLineId: advanceLine.id, amount: '701' }] })))).toMatch(
        /disponible es \$ 700,00/
      );
    });

    it('anular: movimientos anulados con el motivo, el pendiente vuelve y el número queda', async () => {
      const { cancelReceipt, confirmReceipt, saveReceiptDraft } = await actions();
      const invoice = await insertInvoice({ total: '80.00' });
      const values = form({ invoices: [{ invoiceId: invoice, amount: '80' }], payments: [payment('80')] });
      const created = expectOk(await confirmReceipt(null, values));
      expect(await pendingOf(invoice)).toBe('0.00');
      expectOk(await cancelReceipt(created.id, 'Cheque rechazado'));
      expect(await statusOf(created.id)).toMatchObject({ status: 'CANCELLED', number: created.number });
      expect((await movementsOf(created.id)).map((m) => m.cancel_reason)).toEqual(['Cheque rechazado']);
      expect(await pendingOf(invoice)).toBe('80.00');
      expect(expectFail(await cancelReceipt(created.id, 'otra vez'))).toBe('El recibo ya está anulado');
      expect(expectFail(await saveReceiptDraft(created.id, values))).toBe('El recibo está anulado');

      const draft = expectOk(await saveReceiptDraft(null, values));
      expect(expectFail(await cancelReceipt(draft.id, 'x'))).toBe('Un borrador no se anula: borralo');
    });

    it('un recibo confirmado no se edita', async () => {
      const { confirmReceipt, saveReceiptDraft } = await actions();
      const invoice = await insertInvoice({ total: '5.00' });
      const values = form({ invoices: [{ invoiceId: invoice, amount: '5' }], payments: [payment('5')] });
      const created = expectOk(await confirmReceipt(null, values));
      expect(expectFail(await saveReceiptDraft(created.id, values))).toBe('El recibo ya fue confirmado');
    });

    it('borrar un borrador: sí; un confirmado: no', async () => {
      const { confirmReceipt, deleteReceiptDraft, saveReceiptDraft } = await actions();
      const invoice = await insertInvoice({ total: '5.00' });
      const values = form({ invoices: [{ invoiceId: invoice, amount: '5' }], payments: [payment('5')] });
      const draft = expectOk(await saveReceiptDraft(null, values));
      expectOk(await deleteReceiptDraft(draft.id));
      expect(await (await db()).customer_receipts.count({ where: { id: draft.id } })).toBe(0);
      const created = expectOk(await confirmReceipt(null, values));
      expect(expectFail(await deleteReceiptDraft(created.id))).toBe('Solo se borra un recibo en borrador: anulalo');
    });

    it('el mismo certificado de un cliente no se carga dos veces', async () => {
      const { confirmReceipt, saveReceiptDraft } = await actions();
      const invoice = await insertInvoice({ total: '100.00' });
      const withholding = { id: '', tax: 'GANANCIAS' as const, jurisdiction: '', certificateNumber: '0001-00000777', certificateDate: TODAY, amount: '10' };
      const created = expectOk(
        await confirmReceipt(null, form({ invoices: [{ invoiceId: invoice, amount: '50' }], withholdings: [withholding], payments: [payment('40')] }))
      );
      expect(expectFail(await saveReceiptDraft(null, form({ invoices: [{ invoiceId: invoice, amount: '10' }], withholdings: [withholding] })))).toBe(
        `El certificado 0001-00000777 de Ganancias ya está cargado en ${created.number}`
      );
    });

    it('certificados: reemplazar o quitar borra el archivo anterior después de guardar; si falla, el nuevo', async () => {
      const { attachWithholdingCertificate } = await import('./withholdings.server');
      const { cancelReceipt, confirmReceipt, saveReceiptDraft } = await actions();
      const invoice = await insertInvoice({ total: '100.00' });
      const withholding = { id: '', tax: 'IIBB' as const, jurisdiction: 'Neuquén', certificateNumber: 'C-1', certificateDate: TODAY, amount: '10' };
      const values = form({ invoices: [{ invoiceId: invoice, amount: '10' }], withholdings: [withholding] });
      const draft = expectOk(await saveReceiptDraft(null, values));
      const withholdingId = draft.withholdingIds[0] as string;
      const pdf = () => {
        const data = new FormData();
        data.set('file', new File([new Uint8Array([37, 80, 68, 70])], 'certificado.pdf', { type: 'application/pdf' }));
        return data;
      };

      files.storageRemove.mockClear();
      const first = expectOk(await attachWithholdingCertificate(withholdingId, pdf()));
      expect(first.name).toBe('certificado.pdf');
      const firstPath = files.storageUpload.mock.calls.at(-1)?.[1] as string;
      expect(firstPath).toMatch(new RegExp(`^${COMPANY}/${CUSTOMER_A}/withholdings/\\d+-certificado\\.pdf$`));
      expect(files.storageRemove).not.toHaveBeenCalled();
      expectOk(await attachWithholdingCertificate(withholdingId, pdf()));
      expect(files.storageRemove).toHaveBeenLastCalledWith('customer-documents', [firstPath]);
      const secondPath = files.storageUpload.mock.calls.at(-1)?.[1] as string;

      // Quitar la retención del borrador borra su certificado.
      expectOk(await saveReceiptDraft(draft.id, { ...values, withholdings: [] }));
      expect(files.storageRemove).toHaveBeenLastCalledWith('customer-documents', [secondPath]);

      // En un recibo anulado la transacción falla: se borra lo recién subido, no lo anterior.
      const kept = expectOk(
        await confirmReceipt(null, form({ invoices: [{ invoiceId: invoice, amount: '20' }], withholdings: [{ ...withholding, certificateNumber: 'C-2' }], payments: [payment('10')] }))
      );
      const keptId = kept.withholdingIds[0] as string;
      expectOk(await attachWithholdingCertificate(keptId, pdf()));
      const keptPath = files.storageUpload.mock.calls.at(-1)?.[1] as string;
      expectOk(await cancelReceipt(kept.id, 'error'));
      expect(expectFail(await attachWithholdingCertificate(keptId, pdf()))).toBe('El recibo está anulado');
      const rejectedPath = files.storageUpload.mock.calls.at(-1)?.[1] as string;
      expect(rejectedPath).not.toBe(keptPath);
      expect(files.storageRemove).toHaveBeenLastCalledWith('customer-documents', [rejectedPath]);
      const row = await (await db()).customer_receipt_withholdings.findUniqueOrThrow({ where: { id: keptId } });
      expect(row.file_path).toBe(keptPath);

      const notPdf = new FormData();
      notPdf.set('file', new File(['x'], 'foto.png', { type: 'image/png' }));
      expect(expectFail(await attachWithholdingCertificate(withholdingId, notPdf))).toBe('El certificado tiene que ser un PDF');
    });

    it('enviar al cliente: solo confirmados; guarda a quién solo si el mail salió', async () => {
      const { confirmReceipt, saveReceiptDraft, sendReceipt } = await actions();
      const invoice = await insertInvoice({ total: '30.00' });
      const values = form({ invoices: [{ invoiceId: invoice, amount: '15' }], payments: [payment('15')] });
      const draft = expectOk(await saveReceiptDraft(null, values));
      expect(expectFail(await sendReceipt(draft.id, { to: ['pagos@cliente-a.test'], message: '' }))).toBe('El recibo no está confirmado');

      const created = expectOk(await confirmReceipt(null, values));
      files.sendCustomerReceiptEmail.mockResolvedValueOnce(false);
      expect(expectFail(await sendReceipt(created.id, { to: ['pagos@cliente-a.test'], message: '' }))).toMatch(/no se pudo enviar/i);
      expect((await statusOf(created.id)).sent_to).toEqual([]);

      expectOk(await sendReceipt(created.id, { to: ['pagos@cliente-a.test'], message: 'Gracias' }));
      expect(files.sendCustomerReceiptEmail).toHaveBeenLastCalledWith(
        expect.objectContaining({ to: ['pagos@cliente-a.test'], number: created.number, customerName: 'Cliente A', message: 'Gracias' })
      );
      expect((await statusOf(created.id)).sent_to).toEqual(['pagos@cliente-a.test']);
    });

    it('permisos: sin delete no se anula', async () => {
      const { cancelReceipt } = await actions();
      state.denied.add('tesoreria:cobranzas:delete');
      expect(expectFail(await cancelReceipt(CUSTOMER_A, 'x'))).toBe('No tenés permiso para realizar esta acción');
    });

    it('el movimiento de un cobro no se toca desde Movimientos', async () => {
      const { confirmReceipt } = await actions();
      const { cancelManualMovement } = await import('./movements.server');
      const invoice = await insertInvoice({ total: '7.00' });
      const created = expectOk(await confirmReceipt(null, form({ invoices: [{ invoiceId: invoice, amount: '7' }], payments: [payment('7')] })));
      const movement = await (await db()).treasury_movements.findFirstOrThrow({ where: { customer_receipt_payment: { receipt_id: created.id } } });
      expect(expectFail(await cancelManualMovement(movement.id, 'x'))).toBe(`Este movimiento es del recibo ${created.number}. Para revertirlo, anulá el recibo`);
    });

    it('cliente desactivado: no se le crean recibos, pero su borrador se confirma', async () => {
      const { confirmReceipt, saveReceiptDraft } = await actions();
      const prisma = await db();
      const customer = await prisma.customers.create({
        data: { company_id: COMPANY, name: 'Cliente baja', cuit: BigInt(30766666665), vat_condition_id: 1 },
        select: { id: true },
      });
      const invoice = await insertInvoice({ total: '9.00', customerId: customer.id });
      const values = form({ customerId: customer.id, invoices: [{ invoiceId: invoice, amount: '9' }], payments: [payment('9')] });
      const draft = expectOk(await saveReceiptDraft(null, values));
      await prisma.customers.update({ where: { id: customer.id }, data: { is_active: false } });
      expect(expectFail(await saveReceiptDraft(null, values))).toBe('El cliente está inactivo');
      expectOk(await confirmReceipt(draft.id, values));
    });
  });

  describe('filtros hostiles: ningún valor de la URL termina en un error', () => {
    const NUL = '\u0000';
    const BIG_INT = '99999999999';
    const BIG_DIGITS = '9'.repeat(400);
    const BAD_DATES = ['2026-02-31', '2026-13-01', '0000-01-01', '9999-12-31', '2026-2-1', 'abc', NUL];
    const BAD_UUIDS = ['nope', "' OR 1=1 --", '__null__', NUL, '3f0e2b1c-1111-4222-8333-44445555666z'];
    const BAD_ENUMS = ['NOPE', '__null__', NUL, "'; DROP TABLE x;--", 'constructor'];
    const BAD_AMOUNTS = ['99999999999999999999', '10000000000000.00', BIG_DIGITS, '1e5', 'abc', '-1', '1,2,3', NUL, '0.0000001'];
    const BAD_INTS = [BIG_INT, '2147483648', BIG_DIGITS, '-1', '1.5', 'abc', NUL];
    const BAD_TEXT = [NUL, `a${NUL}b`, '%', '_', '\\', "'", 'x'.repeat(100_000)];

    /** Cada pareja clave/valor se prueba sola: un valor roto no puede esconderse detrás de otro. */
    const cases: Array<[string, string]> = [
      ...['issue_date_from', 'issue_date_to', 'due_date_from', 'due_date_to', 'date_from', 'date_to', 'created_at_from', 'created_at_to', 'certificate_date_from', 'certificate_date_to'].flatMap((k) => BAD_DATES.map((v): [string, string] => [k, v])),
      ...['customer', 'account', 'from_account', 'to_account', 'concept'].flatMap((k) => BAD_UUIDS.map((v): [string, string] => [k, v])),
      ...['status', 'kind', 'tax', 'state', 'sent', 'certificate', 'currency'].flatMap((k) => BAD_ENUMS.map((v): [string, string] => [k, v])),
      ...['total', 'pending', 'received_total', 'withholdings_total', 'income', 'expense', 'amount'].flatMap((k) => BAD_AMOUNTS.map((v): [string, string] => [k, v])),
      ...['overdue_days', 'invoices_count'].flatMap((k) => BAD_INTS.map((v): [string, string] => [k, v])),
      ...['number', 'description', 'origin', 'cancel_reason', 'notes', 'jurisdiction', 'certificate_number', 'receipt', 'cuit', 'voucher', 'search'].flatMap((k) => BAD_TEXT.map((v): [string, string] => [k, v])),
      ['page', 'abc'], ['page', '1e99'], ['page', '-5'], ['page', '99999999999999999999'],
      ['pageSize', 'abc'], ['pageSize', '0'], ['pageSize', '-1'], ['pageSize', '99999999999999999999'],
      ['sort', 'constructor.asc'], ['sort', '__proto__.desc'], ['sort', 'toString.asc'], ['sort', 'hasOwnProperty.desc'],
    ];

    const lists = async () => {
      const receivables = await import('../Collections/ReceivablesList/actions.server');
      const receipts = await import('../Collections/ReceiptsList/actions.server');
      const withholdings = await import('../Withholdings/WithholdingsList/actions.server');
      const movements = await import('../Movements/MovementsList/actions.server');
      const transfers = await import('../Transfers/TransfersList/actions.server');
      return [
        ['recibos a cobrar', receivables.getReceivablesPaginated, receivables.getAllReceivablesForExport],
        ['recibos', receipts.getReceiptsPaginated, receipts.getAllReceiptsForExport],
        ['retenciones', withholdings.getWithholdingsPaginated, withholdings.getAllWithholdingsForExport],
        ['movimientos', movements.getTreasuryMovementsPaginated, movements.getAllTreasuryMovementsForExport],
        ['transferencias', transfers.getTreasuryTransfersPaginated, transfers.getAllTreasuryTransfersForExport],
      ] as const;
    };

    it('la consulta paginada y el export responden con cualquier valor', async () => {
      const failures: string[] = [];
      for (const [name, paginated, exporter] of await lists()) {
        for (const [key, value] of cases) {
          const params = { [key]: value };
          try {
            await paginated(params);
            if (key !== 'page' && key !== 'pageSize' && key !== 'sort') await exporter(params);
          } catch {
            failures.push(`${name}: ${key}=${value.slice(0, 30)}`);
          }
        }
      }
      expect(failures).toEqual([]);
    }, 120_000);

    it('los facets (cross-filter) responden con cualquier valor', async () => {
      const receivables = await import('../Collections/ReceivablesList/actions.server');
      const receipts = await import('../Collections/ReceiptsList/actions.server');
      const withholdings = await import('../Withholdings/WithholdingsList/actions.server');
      const movements = await import('../Movements/MovementsList/actions.server');
      const transfers = await import('../Transfers/TransfersList/actions.server');
      const facets: Array<[string, (c: string, p: Record<string, string>) => Promise<unknown>, string[]]> = [
        ['recibos a cobrar', receivables.getReceivableSingleFacet, ['customer', 'currency', 'state']],
        ['recibos', receipts.getReceiptSingleFacet, ['customer', 'status', 'sent']],
        ['retenciones', withholdings.getWithholdingSingleFacet, ['customer', 'tax', 'certificate']],
        ['movimientos', movements.getTreasuryMovementSingleFacet, ['account', 'kind', 'concept', 'state']],
        ['transferencias', transfers.getTreasuryTransferSingleFacet, ['from_account', 'to_account', 'state']],
      ];
      const failures: string[] = [];
      for (const [name, facet, columns] of facets) {
        for (const [key, value] of cases) {
          for (const column of columns) {
            // El facet traga los errores y devuelve null: null en una columna conocida = la consulta falló
            if ((await facet(column, { [key]: value })) === null) failures.push(`${name}.${column}: ${key}=${value.slice(0, 30)}`);
          }
        }
      }
      expect(failures).toEqual([]);
    }, 240_000);

    it('un importe más grande que numeric(15,2) da cero filas', async () => {
      const movements = await import('../Movements/MovementsList/actions.server');
      const result = await movements.getTreasuryMovementsPaginated({ income: '99999999999999999999' });
      expect(result.total).toBe(0);
    });

    it('un id de cliente inválido en Recibos se ignora (no da error)', async () => {
      const { getReceiptsPaginated } = await import('../Collections/ReceiptsList/actions.server');
      const all = await getReceiptsPaginated({});
      const filtered = await getReceiptsPaginated({ customer: 'no-es-un-uuid' });
      expect(filtered.total).toBe(all.total);
    });

    it('el filtro por fecha de alta usa el día argentino, no el UTC', async () => {
      const prisma = await db();
      const { getTreasuryMovementsPaginated } = await import('../Movements/MovementsList/actions.server');
      // 22:00 del 1/3 en Argentina = 01:00 UTC del 2/3
      await prisma.treasury_movements.create({
        data: {
          company_id: COMPANY,
          account_id: BANK,
          date: new Date('2026-03-01T00:00:00.000Z'),
          amount: '5.00',
          kind: 'OPENING',
          description: 'filtro-alta-argentina',
          created_by: USER,
          created_at: new Date('2026-03-02T01:00:00.000Z'),
        },
      });
      const day = async (d: string) =>
        (await getTreasuryMovementsPaginated({ search: 'filtro-alta-argentina', created_at_from: d, created_at_to: d })).total;
      expect(await day('2026-03-01')).toBe(1);
      expect(await day('2026-03-02')).toBe(0);
    });
  });

  describe('revisión final', () => {
    type Values = import('../schemas/receipts').ReceiptFormValues;
    const form = (over: Partial<Values> = {}): Values => ({
      customerId: CUSTOMER_B,
      date: TODAY,
      notes: '',
      rates: [],
      invoices: [],
      advancesApplied: [],
      advance: { amount: '', description: '' },
      withholdings: [],
      payments: [],
      ...over,
    });
    const transfer = (amount: string) => ({ method: 'TRANSFER' as const, accountId: BANK, amount, reference: '', checkNumber: '', checkBank: '', checkDueOn: '' });

    it('anular el origen y aplicar su anticipo en paralelo: nunca quedan los dos', async () => {
      const { cancelReceipt, confirmReceipt } = await import('./receipts.server');
      const prisma = await db();
      for (let round = 0; round < 6; round += 1) {
        const origin = expectOk(await confirmReceipt(null, form({ advance: { amount: '100', description: 'a cuenta' }, payments: [transfer('100')] })));
        const line = await prisma.customer_receipt_lines.findFirstOrThrow({ where: { receipt_id: origin.id, kind: 'ADVANCE' } });
        const invoice = await insertInvoice({ total: '100.00', customerId: CUSTOMER_B });
        const [cancelled, applied] = await Promise.all([
          cancelReceipt(origin.id, 'carrera'),
          confirmReceipt(null, form({ invoices: [{ invoiceId: invoice, amount: '100' }], advancesApplied: [{ sourceLineId: line.id, amount: '100' }] })),
        ]);
        expect([cancelled.ok, applied.ok].filter(Boolean)).toHaveLength(1);
      }
    });

    it('un borrador cuya factura quedó sin pendiente la sigue mostrando y se puede destildar', async () => {
      const { getReceiptFormData, saveReceiptDraft } = await import('./receipts.server');
      const invoice = await insertInvoice({ total: '300.00', customerId: CUSTOMER_B });
      const values = form({ invoices: [{ invoiceId: invoice, amount: '300' }] });
      const draft = expectOk(await saveReceiptDraft(null, values));
      await insertInvoice({ cbteType: 3, total: '300.00', customerId: CUSTOMER_B, associatedInvoiceId: invoice });
      const data = await getReceiptFormData({ receiptId: draft.id });
      expect(data?.openInvoices.find((i) => i.invoiceId === invoice)?.pending).toBe('0.00');
      expectOk(await saveReceiptDraft(draft.id, { ...values, invoices: [] }));
    });

    it('el pendiente que ve Comercial distingue cobrada, en borrador y anulada por NC', async () => {
      const { getInvoiceReceivable } = await import('./customer-statement.server');
      const { confirmReceipt, saveReceiptDraft } = await import('./receipts.server');
      const paid = await insertInvoice({ total: '10.00', customerId: CUSTOMER_B });
      expectOk(await confirmReceipt(null, form({ invoices: [{ invoiceId: paid, amount: '10' }], payments: [transfer('10')] })));
      const reserved = await insertInvoice({ total: '20.00', customerId: CUSTOMER_B });
      expectOk(await saveReceiptDraft(null, form({ invoices: [{ invoiceId: reserved, amount: '20' }] })));
      const credited = await insertInvoice({ total: '30.00', customerId: CUSTOMER_B });
      await insertInvoice({ cbteType: 3, total: '30.00', customerId: CUSTOMER_B, associatedInvoiceId: credited });
      expect((await getInvoiceReceivable(paid))?.state).toBe('COLLECTED');
      expect(await getInvoiceReceivable(reserved)).toMatchObject({ state: 'IN_DRAFT', reserved: '20.00' });
      expect((await getInvoiceReceivable(credited))?.state).toBe('NO_BALANCE');
    });
  });
});
