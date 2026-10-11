import moment from 'moment';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { treasuryToday } from '../lib/today';

/**
 * Tesorería etapa 3a (cheques de terceros) contra el Postgres del compose: `npm run test:treasury`.
 * Se simulan la sesión, la empresa activa, los permisos, el storage y el mail.
 */

const COMPANY = 'e9300000-0000-4000-8000-000000000001';
const OTHER_COMPANY = 'e9300000-0000-4000-8000-000000000002';
const USER = 'e9300000-0000-4000-8000-000000000003';
const CUSTOMER = 'e9300000-0000-4000-8000-000000000010';
const OTHER_CUSTOMER = 'e9300000-0000-4000-8000-000000000011';
const FOREIGN_CUSTOMER = 'e9300000-0000-4000-8000-000000000012';
const SUPPLIER = 'e9300000-0000-4000-8000-000000000015';
const PORTFOLIO = 'e9300000-0000-4000-8000-000000000020';
const BANK = 'e9300000-0000-4000-8000-000000000021';
const CASH = 'e9300000-0000-4000-8000-000000000022';
const FOREIGN_PORTFOLIO = 'e9300000-0000-4000-8000-000000000023';
const CONCEPT = 'e9300000-0000-4000-8000-000000000030';

/** CUIT válido (dígito verificador) del librador de los cheques de prueba. */
const DRAWER_CUIT = '30712345671';

const state = vi.hoisted(() => ({ denied: new Set<string>() }));

vi.mock('@/shared/lib/tenant', () => ({ getActiveCompanyId: async () => 'e9300000-0000-4000-8000-000000000001' }));
vi.mock('@/features/Permissions', () => ({
  checkPermissionServer: async (module: string, tab: string, action: string) => !state.denied.has(`${module}:${tab}:${action}`),
}));
vi.mock('@/shared/actions/auth.actions', () => {
  const current = () => ({
    id: 'e9300000-0000-4000-8000-000000000003',
    credentialId: 'e9300000-0000-4000-8000-000000000003',
    fullname: null,
    email: null,
  });
  return { getServerAuthProfile: async () => current(), requireServerAuthProfile: async () => current() };
});
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/shared/lib/storage', () => ({
  storageUpload: vi.fn(async (_bucket: string, path: string) => ({ ok: true as const, data: { path } })),
  storageRemove: vi.fn(async () => ({ ok: true as const, data: null })),
  storagePublicUrl: vi.fn(async (bucket: string, path: string) => `/api/files/${bucket}/${path}`),
  storageDownload: vi.fn(async () => ({ ok: false as const, error: 'sin archivo', code: 'not-found' as const })),
}));
vi.mock('@/shared/lib/mail/templates/treasury', () => ({ sendCustomerReceiptEmail: vi.fn(async () => true) }));
vi.mock('../pdf/render-receipt-pdf.server', () => ({
  renderCustomerReceiptPdf: async () => ({ filename: 'recibo.pdf', content: new Uint8Array([37, 80, 68, 70]) }),
}));

const RUN = Boolean(process.env.DATABASE_URL);

// Hoy en hora argentina, como el servidor (lib/today.ts).
const TODAY = treasuryToday();
const day = (offset: number) => moment(TODAY).add(offset, 'days').format('YYYY-MM-DD');

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

async function cleanup() {
  const prisma = await db();
  const companies = [COMPANY, OTHER_COMPANY];
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
    await tx.$executeRaw`DELETE FROM third_party_check_events e USING third_party_checks c WHERE c.id = e.check_id AND c.company_id = ANY(${companies}::uuid[])`;
    await tx.$executeRaw`DELETE FROM third_party_check_operation_items i USING third_party_check_operations o WHERE o.id = i.operation_id AND o.company_id = ANY(${companies}::uuid[])`;
    await tx.$executeRaw`DELETE FROM treasury_movements WHERE company_id = ANY(${companies}::uuid[])`;
    await tx.$executeRaw`DELETE FROM payment_orders WHERE company_id = ANY(${companies}::uuid[])`;
    await tx.$executeRaw`DELETE FROM customer_receipts WHERE company_id = ANY(${companies}::uuid[])`;
    await tx.$executeRaw`DELETE FROM customer_receipt_lines l WHERE NOT EXISTS (SELECT 1 FROM customer_receipts r WHERE r.id = l.receipt_id)`;
    await tx.$executeRaw`DELETE FROM customer_receipt_payments p WHERE NOT EXISTS (SELECT 1 FROM customer_receipts r WHERE r.id = p.receipt_id)`;
    await tx.$executeRaw`DELETE FROM payment_order_lines l WHERE NOT EXISTS (SELECT 1 FROM payment_orders o WHERE o.id = l.payment_order_id)`;
    await tx.$executeRaw`DELETE FROM payment_order_payments p WHERE NOT EXISTS (SELECT 1 FROM payment_orders o WHERE o.id = p.payment_order_id)`;
    await tx.$executeRaw`DELETE FROM third_party_checks WHERE company_id = ANY(${companies}::uuid[])`;
    await tx.$executeRaw`DELETE FROM third_party_check_operations WHERE company_id = ANY(${companies}::uuid[])`;
    await tx.$executeRaw`DELETE FROM treasury_concepts WHERE company_id = ANY(${companies}::uuid[])`;
    await tx.$executeRaw`DELETE FROM treasury_accounts WHERE company_id = ANY(${companies}::uuid[])`;
    await tx.$executeRaw`DELETE FROM suppliers WHERE company_id = ANY(${companies}::uuid[])`;
    await tx.$executeRaw`DELETE FROM customers WHERE company_id = ANY(${companies}::uuid[])`;
    await tx.$executeRaw`DELETE FROM profile WHERE id = ${USER}::uuid`;
    await tx.$executeRaw`DELETE FROM company WHERE id = ANY(${companies}::uuid[])`;
  });
}

let checkNumber = 1000;

/** Cheque EN CARTERA por carga inicial, creado con `createCheck` (la única escritura). */
async function insertCheck(input: { amount?: string; paymentDate?: string; customerId?: string; companyId?: string; portfolioId?: string; bank?: string; number?: string } = {}) {
  const prisma = await db();
  const { createCheck } = await import('../lib/checks');
  checkNumber += 1;
  const companyId = input.companyId ?? COMPANY;
  return prisma.$transaction(async (tx) => {
    const operation = await tx.third_party_check_operations.create({
      data: { company_id: companyId, kind: 'OPENING', date: new Date(`${TODAY}T00:00:00.000Z`), created_by: USER },
      select: { id: true },
    });
    const amount = input.amount ?? '1000.00';
    const check = await createCheck(tx, {
      companyId,
      portfolioId: input.portfolioId ?? (companyId === COMPANY ? PORTFOLIO : FOREIGN_PORTFOLIO),
      customerId: input.customerId ?? (companyId === COMPANY ? CUSTOMER : FOREIGN_CUSTOMER),
      userId: USER,
      date: TODAY,
      data: {
        kind: 'PHYSICAL',
        number: input.number ?? String(checkNumber),
        bank: input.bank ?? 'Banco Galicia',
        drawerName: 'Cliente SA',
        drawerCuit: DRAWER_CUIT,
        issueDate: day(-5),
        paymentDate: input.paymentDate ?? TODAY,
        amountCents: BigInt(Math.round(Number(amount) * 100)),
      },
      origin: { openingOperationId: operation.id },
    });
    return { id: check.id, operationId: operation.id, number: input.number ?? String(checkNumber) };
  });
}

/** Saldo de una cuenta (movimientos vigentes hasta `until`, por defecto todos). */
async function balanceOf(accountId: string, until?: string): Promise<string> {
  const prisma = await db();
  const rows = await prisma.$queryRaw<{ total: string }[]>`
    SELECT COALESCE(SUM(amount), 0)::numeric(15,2)::text AS total FROM treasury_movements
    WHERE account_id = ${accountId}::uuid AND cancelled_at IS NULL AND (${until ?? null}::date IS NULL OR date <= ${until ?? null}::date)
  `;
  return rows[0]!.total;
}

describe.skipIf(!RUN)('cheques de terceros (integracion)', () => {
  beforeAll(async () => {
    await cleanup();
    const prisma = await db();
    const city = await prisma.cities.findFirstOrThrow({ select: { id: true } });
    for (const [id, cuit] of [
      [COMPANY, '30999999930'],
      [OTHER_COMPANY, '30999999931'],
    ] as const) {
      await prisma.company.create({
        data: {
          id,
          company_name: `Cheques test ${cuit}`,
          description: 'empresa de prueba',
          contact_email: 'cheques-test@alphataco.local',
          contact_phone: '+542991234567',
          address: 'Calle 123',
          city: city.id,
          country: 'argentina',
          industry: 'Petroleo',
          company_cuit: cuit,
        },
      });
    }
    await prisma.profile.create({ data: { id: USER, credential_id: USER, email: 'cheques@alphataco.local' } });
    await prisma.customers.createMany({
      data: [
        { id: CUSTOMER, company_id: COMPANY, name: 'Cliente SA', cuit: BigInt(DRAWER_CUIT), vat_condition_id: 1 },
        { id: OTHER_CUSTOMER, company_id: COMPANY, name: 'Otro cliente', cuit: BigInt(30722222226), vat_condition_id: 1 },
        { id: FOREIGN_CUSTOMER, company_id: OTHER_COMPANY, name: 'Ajeno', cuit: BigInt(30733333334), vat_condition_id: 1 },
      ],
    });
    await prisma.suppliers.create({ data: { id: SUPPLIER, company_id: COMPANY, name: 'Proveedor SA', cuit: BigInt(30744444442), vat_condition_id: 1 } });
    await prisma.treasury_accounts.createMany({
      data: [
        { id: PORTFOLIO, company_id: COMPANY, kind: 'CHECK_PORTFOLIO', name: 'Cartera test' },
        { id: BANK, company_id: COMPANY, kind: 'BANK', name: 'Banco test' },
        { id: CASH, company_id: COMPANY, kind: 'CASH', name: 'Caja test' },
        { id: FOREIGN_PORTFOLIO, company_id: OTHER_COMPANY, kind: 'CHECK_PORTFOLIO', name: 'Cartera ajena' },
      ],
    });
    await prisma.treasury_concepts.create({ data: { id: CONCEPT, company_id: COMPANY, name: 'Varios', direction: 'BOTH' } });
  }, 60_000);

  afterAll(async () => {
    await cleanup();
  }, 60_000);

  beforeEach(() => {
    state.denied.clear();
  });

  describe('núcleo: alta, bloqueo, transiciones y deudas', () => {
    it('createCheck deja el cheque EN CARTERA con un evento', async () => {
      const prisma = await db();
      const { id, operationId } = await insertCheck();
      const check = await prisma.third_party_checks.findUniqueOrThrow({ where: { id }, select: { status: true, bank: true, events: true } });
      expect(check.status).toBe('IN_PORTFOLIO');
      expect(check.bank).toBe('BANCO GALICIA');
      expect(check.events).toHaveLength(1);
      expect(check.events[0]).toMatchObject({ from_status: null, to_status: 'IN_PORTFOLIO', operation_id: operationId });
    });

    it('el mismo cheque vigente no se carga dos veces (aunque el banco se escriba distinto)', async () => {
      await insertCheck({ number: '777', bank: 'Banco Nación' });
      await expect(insertCheck({ number: '777', bank: '  banco   nación ' })).rejects.toThrow('El cheque Nº 777 del banco BANCO NACIÓN ya está en la cartera');
    });

    it('lockChecks no ve cheques de otra empresa', async () => {
      const prisma = await db();
      const { lockChecks } = await import('../lib/checks');
      const foreign = await insertCheck({ companyId: OTHER_COMPANY });
      await expect(prisma.$transaction((tx) => lockChecks(tx, COMPANY, [foreign.id]))).rejects.toThrow('El cheque no existe');
    });

    it('una transición inválida no escribe nada', async () => {
      const prisma = await db();
      const { lockChecks, moveCheck } = await import('../lib/checks');
      const { id, operationId } = await insertCheck();
      await expect(
        prisma.$transaction(async (tx) => {
          const check = (await lockChecks(tx, COMPANY, [id])).get(id)!;
          await moveCheck(tx, { check, action: 'REJECT', date: TODAY, userId: USER, origin: { operationId } });
        })
      ).rejects.toThrow('está en cartera: no se puede rechazar');
      const after = await prisma.third_party_checks.findUniqueOrThrow({ where: { id }, select: { status: true, _count: { select: { events: true } } } });
      expect(after.status).toBe('IN_PORTFOLIO');
      expect(after._count.events).toBe(1);
    });

    it('una cartera no admite movimientos manuales ni transferencias', async () => {
      const { createManualMovement } = await import('./movements.server');
      const { createTransfer } = await import('./transfers.server');
      const manual = await createManualMovement({ accountId: PORTFOLIO, date: TODAY, direction: 'IN', amount: '10', conceptId: CONCEPT, description: '' });
      expect(expectFail(manual)).toBe('La cartera «Cartera test» solo mueve cheques');
      const transfer = await createTransfer({ fromAccountId: BANK, toAccountId: PORTFOLIO, date: TODAY, amount: '10', notes: '' });
      expect(expectFail(transfer)).toBe('La cartera «Cartera test» solo mueve cheques');
      expectOk(await createTransfer({ fromAccountId: BANK, toAccountId: CASH, date: TODAY, amount: '10', notes: '' }));
    });

    it('deudas de un cheque rechazado: del cliente siempre; del proveedor solo si venía endosado', async () => {
      const prisma = await db();
      const { customerCheckDebts, supplierCheckDebts, openCheckDebtsOfCustomer } = await import('../lib/rejected-checks');
      const endorsed = await insertCheck({ amount: '500.00' });
      const deposited = await insertCheck({ amount: '300.00' });
      // Rechazo cargado a mano (las acciones llegan en la Task 5): operación + item + estado.
      for (const [check, from] of [
        [endorsed.id, 'ENDORSED'],
        [deposited.id, 'DEPOSITED'],
      ] as const) {
        const op = await prisma.third_party_check_operations.create({
          data: { company_id: COMPANY, kind: 'REJECTION', number: `CR-T${check.slice(-4)}`, date: new Date(`${TODAY}T00:00:00.000Z`), reason: 'Sin fondos', returned_by: 'BANK', created_by: USER },
          select: { id: true },
        });
        await prisma.third_party_check_operation_items.create({ data: { operation_id: op.id, check_id: check, previous_status: from } });
        await prisma.third_party_checks.update({
          where: { id: check },
          data: {
            status: 'REJECTED',
            rejected_from: from,
            supplier_id: from === 'ENDORSED' ? SUPPLIER : null,
            bank_account_id: from === 'DEPOSITED' ? BANK : null,
          },
        });
      }
      const customer = await customerCheckDebts(prisma, [endorsed.id, deposited.id]);
      expect(customer.get(endorsed.id)).toMatchObject({ pending: '500.00', rejectedFrom: 'ENDORSED', rejectedOn: TODAY });
      expect(customer.get(deposited.id)).toMatchObject({ pending: '300.00', rejectedFrom: 'DEPOSITED' });
      expect(customer.get(endorsed.id)?.label).toBe(`Cheque rechazado Nº ${endorsed.number} — BANCO GALICIA`);

      const supplier = await supplierCheckDebts(prisma, [endorsed.id, deposited.id]);
      expect(supplier.get(endorsed.id)?.pending).toBe('500.00');
      expect(supplier.has(deposited.id)).toBe(false);

      // Un recibo en borrador reserva la deuda; excluyéndolo, vuelve a estar libre.
      const receipt = await prisma.customer_receipts.create({
        data: { company_id: COMPANY, customer_id: CUSTOMER, status: 'DRAFT', date: new Date(`${TODAY}T00:00:00.000Z`), created_by: USER },
        select: { id: true },
      });
      await prisma.customer_receipt_lines.create({
        data: { receipt_id: receipt.id, position: 0, kind: 'REJECTED_CHECK', third_party_check_id: deposited.id, currency: 'ARS', applied_amount: '100', amount_ars: '100' },
      });
      const reserved = await customerCheckDebts(prisma, [deposited.id]);
      expect(reserved.get(deposited.id)).toMatchObject({ pending: '200.00', reserved: '100.00' });
      expect((await customerCheckDebts(prisma, [deposited.id], { excludeReceiptId: receipt.id })).get(deposited.id)?.pending).toBe('300.00');
      const open = await openCheckDebtsOfCustomer(prisma, COMPANY, CUSTOMER);
      expect(open.map((d) => d.checkId)).toEqual(expect.arrayContaining([endorsed.id, deposited.id]));
    });
  });

  describe('recibo con cheques y cobro de deudas', () => {
    type Values = import('../schemas/receipts').ReceiptFormValues;
    type Payment = Values['payments'][number];
    let receiptCheck = 5000;
    const chequePayment = (amount: string, over: Partial<Payment> = {}): Payment => {
      receiptCheck += 1;
      return {
        method: 'CHECK',
        accountId: PORTFOLIO,
        amount,
        reference: '',
        checkNumber: String(receiptCheck),
        checkBank: 'Banco Galicia',
        checkDueOn: day(10),
        checkIssueDate: day(-1),
        drawerName: 'Cliente SA',
        drawerCuit: DRAWER_CUIT,
        ...over,
      };
    };
    /** Recibo a cuenta (sin comprobantes): el importe del anticipo cierra con los medios. */
    const form = (payments: Payment[], over: Partial<Values> = {}): Values => {
      const total = payments.reduce((acc, p) => acc + Number(p.amount), 0);
      return {
        customerId: CUSTOMER,
        date: TODAY,
        notes: '',
        rates: [],
        invoices: [],
        advancesApplied: [],
        advance: { amount: total ? total.toFixed(2) : '', description: '' },
        withholdings: [],
        payments,
        rejectedChecks: [],
        ...over,
      };
    };
    const actions = () => import('./receipts.server');
    async function checksOf(receiptId: string) {
      const prisma = await db();
      return prisma.third_party_checks.findMany({
        where: { receipt_payment: { receipt_id: receiptId } },
        select: { id: true, status: true, number: true, portfolio_id: true, amount: true, events: { select: { to_status: true, receipt_id: true } } },
        orderBy: { number: 'asc' },
      });
    }
    /** Deposita un cheque a mano (la acción llega en la Task 5): operación + item + estado. */
    async function depositByHand(checkId: string) {
      const prisma = await db();
      const { lockChecks, moveCheck } = await import('../lib/checks');
      await prisma.$transaction(async (tx) => {
        const op = await tx.third_party_check_operations.create({
          data: { company_id: COMPANY, kind: 'DEPOSIT', number: `CD-H${checkId.slice(-5)}`, date: new Date(`${TODAY}T00:00:00.000Z`), bank_account_id: BANK, created_by: USER },
          select: { id: true },
        });
        await tx.third_party_check_operation_items.create({ data: { operation_id: op.id, check_id: checkId, previous_status: 'IN_PORTFOLIO', credited_on: new Date(`${TODAY}T00:00:00.000Z`) } });
        const check = (await lockChecks(tx, COMPANY, [checkId])).get(checkId)!;
        await moveCheck(tx, { check, action: 'DEPOSIT', date: TODAY, userId: USER, origin: { operationId: op.id }, set: { creditedOn: TODAY, bankAccountId: BANK } });
      });
    }
    /** Rechaza un cheque depositado a mano: operación + item + estado. */
    async function rejectByHand(checkId: string) {
      const prisma = await db();
      const { lockChecks, moveCheck } = await import('../lib/checks');
      await prisma.$transaction(async (tx) => {
        const op = await tx.third_party_check_operations.create({
          data: { company_id: COMPANY, kind: 'REJECTION', number: `CR-H${checkId.slice(-5)}`, date: new Date(`${TODAY}T00:00:00.000Z`), reason: 'Sin fondos', returned_by: 'BANK', created_by: USER },
          select: { id: true },
        });
        await tx.third_party_check_operation_items.create({ data: { operation_id: op.id, check_id: checkId, previous_status: 'DEPOSITED' } });
        const check = (await lockChecks(tx, COMPANY, [checkId])).get(checkId)!;
        await moveCheck(tx, { check, action: 'REJECT', date: TODAY, userId: USER, origin: { operationId: op.id } });
      });
    }

    it('confirmar crea los cheques EN CARTERA y su entrada a la cartera con la fecha del recibo', async () => {
      const { confirmReceipt } = await actions();
      const before = await balanceOf(PORTFOLIO);
      const receipt = expectOk(await confirmReceipt(null, form([chequePayment('400'), chequePayment('600', { method: 'ECHECK', checkDueOn: day(40) })])));
      const checks = await checksOf(receipt.id);
      expect(checks).toHaveLength(2);
      for (const c of checks) {
        expect(c.status).toBe('IN_PORTFOLIO');
        expect(c.portfolio_id).toBe(PORTFOLIO);
        expect(c.events).toEqual([{ to_status: 'IN_PORTFOLIO', receipt_id: receipt.id }]);
      }
      const prisma = await db();
      const movements = await prisma.treasury_movements.findMany({ where: { customer_receipt_payment: { receipt_id: receipt.id } }, select: { account_id: true, date: true, kind: true } });
      expect(movements.every((m) => m.account_id === PORTFOLIO && m.kind === 'CUSTOMER_RECEIPT' && moment.utc(m.date).format('YYYY-MM-DD') === TODAY)).toBe(true);
      expect(Number(await balanceOf(PORTFOLIO)) - Number(before)).toBe(1000);
    });

    it('un cheque va a una cartera y una transferencia no puede ir a una cartera', async () => {
      const { saveReceiptDraft } = await actions();
      expect(expectFail(await saveReceiptDraft(null, form([chequePayment('10', { accountId: BANK })])))).toBe('Los cheques van a una cartera de cheques');
      const transfer: Payment = { method: 'TRANSFER', accountId: PORTFOLIO, amount: '10', reference: '', checkNumber: '', checkBank: '', checkDueOn: '' };
      expect(expectFail(await saveReceiptDraft(null, form([transfer])))).toBe('La cartera «Cartera test» solo mueve cheques');
    });

    it('el mismo cheque en dos borradores: se guardan; el segundo no se confirma y queda en borrador', async () => {
      const { confirmReceipt, saveReceiptDraft } = await actions();
      const payment = chequePayment('250', { checkNumber: '424242' });
      const first = expectOk(await saveReceiptDraft(null, form([payment])));
      const second = expectOk(await saveReceiptDraft(null, form([payment])));
      expectOk(await confirmReceipt(first.id, form([payment])));
      expect(expectFail(await confirmReceipt(second.id, form([payment])))).toBe('El cheque Nº 424242 del banco BANCO GALICIA ya está en la cartera');
      const prisma = await db();
      expect((await prisma.customer_receipts.findUniqueOrThrow({ where: { id: second.id }, select: { status: true } })).status).toBe('DRAFT');
      expect(await prisma.treasury_movements.count({ where: { customer_receipt_payment: { receipt_id: second.id } } })).toBe(0);
    });

    it('anular el recibo con sus cheques en cartera los deja anulados; el mismo cheque se puede volver a cargar', async () => {
      const { confirmReceipt, cancelReceipt } = await actions();
      const payment = chequePayment('300', { checkNumber: '515151' });
      const receipt = expectOk(await confirmReceipt(null, form([payment])));
      expectOk(await cancelReceipt(receipt.id, 'Cargado por error'));
      const [check] = await checksOf(receipt.id);
      expect(check?.status).toBe('CANCELLED');
      expect(check?.events.map((e) => e.to_status)).toEqual(['IN_PORTFOLIO', 'CANCELLED']);
      expectOk(await confirmReceipt(null, form([payment])));
    });

    it('un recibo con un cheque que ya salió de la cartera no se anula', async () => {
      const { confirmReceipt, cancelReceipt } = await actions();
      const receipt = expectOk(await confirmReceipt(null, form([chequePayment('80', { checkNumber: '616161' })])));
      const [check] = await checksOf(receipt.id);
      await depositByHand(check!.id);
      expect(expectFail(await cancelReceipt(receipt.id, 'x'))).toBe(
        'El cheque Nº 616161 (BANCO GALICIA) está depositado: anulá primero la operación que lo sacó de la cartera'
      );
      const prisma = await db();
      expect((await prisma.customer_receipts.findUniqueOrThrow({ where: { id: receipt.id }, select: { status: true } })).status).toBe('CONFIRMED');
    });

    it('la deuda de un cheque rechazado se cobra en partes y no más de lo que queda', async () => {
      const { confirmReceipt } = await actions();
      const transfer = (amount: string): Payment => ({ method: 'TRANSFER', accountId: BANK, amount, reference: '', checkNumber: '', checkBank: '', checkDueOn: '' });
      const receipt = expectOk(await confirmReceipt(null, form([chequePayment('900', { checkNumber: '717171' })])));
      const [check] = await checksOf(receipt.id);
      await depositByHand(check!.id);
      await rejectByHand(check!.id);
      const debt = (amount: string) => form([transfer(amount)], { advance: { amount: '', description: '' }, rejectedChecks: [{ checkId: check!.id, amount }] });
      expectOk(await confirmReceipt(null, debt('400')));
      expectOk(await confirmReceipt(null, debt('500')));
      expect(expectFail(await confirmReceipt(null, debt('1')))).toBe('Cheque rechazado Nº 717171 — BANCO GALICIA: la deuda es $ 0,00');
      const { customerCheckDebts } = await import('../lib/rejected-checks');
      expect((await customerCheckDebts(await db(), [check!.id])).get(check!.id)?.pending).toBe('0.00');

      // Cuenta corriente: el rechazo al debe y los dos cobros al haber.
      const { getCustomerStatement } = await import('../lib/customer-statement');
      const statement = await getCustomerStatement(await db(), COMPANY, CUSTOMER, day(-1), day(1));
      const rows = statement.currencies.find((c) => c.currency === 'ARS')!.rows;
      const rejected = rows.filter((r) => r.kind === 'REJECTED_CHECK' && r.label.includes('717171'));
      expect(rejected.map((r) => [r.debit, r.label])).toEqual([['900.00', 'Cheque rechazado Nº 717171 — BANCO GALICIA']]);
      const collected = rows.filter((r) => r.label.includes('Cheque rechazado Nº 717171') && r.kind === 'RECEIPT');
      expect(collected.map((r) => r.credit).sort()).toEqual(['400.00', '500.00']);
    });

    it('aviso de repetidos: encuentra el vigente y no el anulado', async () => {
      const { confirmReceipt, cancelReceipt, findDuplicateReceiptChecks } = await actions();
      const alive = chequePayment('10', { checkNumber: '818181' });
      const gone = chequePayment('10', { checkNumber: '828282' });
      expectOk(await confirmReceipt(null, form([alive])));
      const cancelled = expectOk(await confirmReceipt(null, form([gone])));
      expectOk(await cancelReceipt(cancelled.id, 'x'));
      const found = expectOk(
        await findDuplicateReceiptChecks([
          { bank: 'banco galicia', number: '818181', drawerCuit: DRAWER_CUIT },
          { bank: 'Banco Galicia', number: '828282', drawerCuit: DRAWER_CUIT },
        ])
      );
      expect(found.map((c) => c.number)).toEqual(['818181']);
    });
  });
  describe('operaciones de la cartera', () => {
    const ops = () => import('./checks.server');
    let opening = 9000;
    /** Carga inicial por la acción: cheques EN CARTERA con su entrada a la cartera. */
    async function openChecks(amounts: string[], paymentDate = TODAY): Promise<{ id: string; number: string }[]> {
      const { createOpeningChecks } = await ops();
      const numbers = amounts.map(() => String((opening += 1)));
      expectOk(
        await createOpeningChecks({
          portfolioId: PORTFOLIO,
          date: TODAY,
          customerId: CUSTOMER,
          checks: amounts.map((amount, i) => ({
            kind: 'PHYSICAL' as const,
            number: numbers[i]!,
            bank: 'Banco Galicia',
            drawerName: 'Cliente SA',
            drawerCuit: DRAWER_CUIT,
            issueDate: day(-30),
            paymentDate,
            amount,
          })),
        })
      );
      const prisma = await db();
      const rows = await prisma.third_party_checks.findMany({ where: { company_id: COMPANY, number: { in: numbers } }, select: { id: true, number: true }, orderBy: { number: 'asc' } });
      return rows;
    }
    async function statusOf(id: string) {
      const prisma = await db();
      return (await prisma.third_party_checks.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
    }
    async function indicators(accountId: string) {
      const { getAccountIndicators } = await import('../lib/balances');
      return (await getAccountIndicators(await db(), COMPANY, TODAY, [accountId])).get(accountId);
    }
    const deposit = (items: { checkId: string; creditedOn: string }[], date = TODAY) => ({ bankAccountId: BANK, date, slipNumber: '', items });

    it('carga inicial: cheques EN CARTERA con su entrada; anular uno lo deja anulado y saca su entrada', async () => {
      const { cancelOpeningCheck } = await ops();
      const before = Number(await balanceOf(PORTFOLIO));
      const [a, b] = await openChecks(['100.00', '200.00']);
      expect(Number(await balanceOf(PORTFOLIO)) - before).toBe(300);
      expectOk(await cancelOpeningCheck(a!.id, 'Cargado de más'));
      expect(await statusOf(a!.id)).toBe('CANCELLED');
      expect(Number(await balanceOf(PORTFOLIO)) - before).toBe(200);
      expect(await statusOf(b!.id)).toBe('IN_PORTFOLIO');
    });

    it('depósito: CD-, cartera baja hoy y el banco sube en cada acreditación', async () => {
      const { depositChecks } = await ops();
      const [a, b] = await openChecks(['100.00', '50.00']);
      const portfolioBefore = Number(await balanceOf(PORTFOLIO));
      const bankBefore = await indicators(BANK);
      const created = expectOk(await depositChecks(deposit([{ checkId: a!.id, creditedOn: TODAY }, { checkId: b!.id, creditedOn: day(2) }])));
      expect(created.number).toMatch(/^CD-\d{6}$/);
      expect(await statusOf(a!.id)).toBe('DEPOSITED');
      expect(Number(await balanceOf(PORTFOLIO)) - portfolioBefore).toBe(-150);
      const bankAfter = await indicators(BANK);
      expect(Number(bankAfter?.balance ?? 0) - Number(bankBefore?.balance ?? 0)).toBe(100);
      expect(Number(bankAfter?.toCredit ?? 0) - Number(bankBefore?.toCredit ?? 0)).toBe(50);
    });

    it('hora argentina: un depósito de hoy se acepta y el de mañana no', async () => {
      const { depositChecks } = await ops();
      const [a] = await openChecks(['10.00']);
      expect(expectFail(await depositChecks(deposit([{ checkId: a!.id, creditedOn: day(1) }], day(1))))).toBe('La fecha no puede ser futura');
      expectOk(await depositChecks(deposit([{ checkId: a!.id, creditedOn: TODAY }])));
    });

    it('la acreditación no puede ser anterior a la fecha de pago', async () => {
      const { depositChecks } = await ops();
      const [a] = await openChecks(['10.00'], day(3));
      expect(expectFail(await depositChecks(deposit([{ checkId: a!.id, creditedOn: day(1) }])))).toBe(
        `Cheque Nº ${a!.number}: la acreditación no puede ser anterior al ${moment(day(3)).format('DD/MM/YYYY')}`
      );
    });

    it('descuento: CL-, la cartera baja el nominal y el banco sube el neto; neto ≤ 0 no se registra', async () => {
      const { discountChecks } = await ops();
      const [a, b] = await openChecks(['1000.00', '500.00']);
      const portfolioBefore = Number(await balanceOf(PORTFOLIO));
      const bankBefore = Number(await balanceOf(BANK));
      expect(expectFail(await discountChecks({ bankAccountId: BANK, date: TODAY, interest: '1400', fee: '100', reference: '', checkIds: [a!.id, b!.id] }))).toBe(
        'El neto da $ 0,00: los intereses y la comisión no pueden ser iguales o mayores que el nominal'
      );
      const result = expectOk(await discountChecks({ bankAccountId: BANK, date: TODAY, interest: '120.50', fee: '30', reference: 'LIQ-1', checkIds: [a!.id, b!.id] }));
      expect(result).toMatchObject({ net: '1349.50' });
      expect(result.number).toMatch(/^CL-\d{6}$/);
      expect(Number(await balanceOf(PORTFOLIO)) - portfolioBefore).toBe(-1500);
      expect(Number(await balanceOf(BANK)) - bankBefore).toBeCloseTo(1349.5, 2);
      expect(await statusOf(a!.id)).toBe('DISCOUNTED');
    });

    it('rechazo de un depositado: CR-, sale del banco y nace la deuda del cliente', async () => {
      const { depositChecks, rejectCheck } = await ops();
      const [a] = await openChecks(['700.00']);
      expectOk(await depositChecks(deposit([{ checkId: a!.id, creditedOn: TODAY }])));
      const bankBefore = Number(await balanceOf(BANK));
      const rejection = expectOk(await rejectCheck({ checkId: a!.id, date: TODAY, reason: 'Sin fondos', returnedBy: 'BANK' }));
      expect(rejection.number).toMatch(/^CR-\d{6}$/);
      expect(Number(await balanceOf(BANK)) - bankBefore).toBe(-700);
      const { customerCheckDebts } = await import('../lib/rejected-checks');
      expect((await customerCheckDebts(await db(), [a!.id])).get(a!.id)?.pending).toBe('700.00');
    });

    it('rechazo antes de la acreditación: la salida del banco va a la fecha de acreditación', async () => {
      const { depositChecks, rejectCheck } = await ops();
      const [a] = await openChecks(['40.00'], day(5));
      expectOk(await depositChecks(deposit([{ checkId: a!.id, creditedOn: day(5) }])));
      expectOk(await rejectCheck({ checkId: a!.id, date: TODAY, reason: 'Firma', returnedBy: 'BANK' }));
      const prisma = await db();
      const out = await prisma.treasury_movements.findFirstOrThrow({ where: { third_party_check_id: a!.id, account_id: BANK, amount: { lt: 0 } }, select: { date: true } });
      expect(moment.utc(out.date).format('YYYY-MM-DD')).toBe(day(5));
    });

    it('rechazo de un descontado: sale del banco el nominal', async () => {
      const { discountChecks, rejectCheck } = await ops();
      const [a] = await openChecks(['300.00']);
      expectOk(await discountChecks({ bankAccountId: BANK, date: TODAY, interest: '10', fee: '0', reference: '', checkIds: [a!.id] }));
      const bankBefore = Number(await balanceOf(BANK));
      expectOk(await rejectCheck({ checkId: a!.id, date: TODAY, reason: 'Sin fondos', returnedBy: 'BANK' }));
      expect(Number(await balanceOf(BANK)) - bankBefore).toBe(-300);
    });

    it('el rechazo no puede ser anterior al depósito', async () => {
      const { depositChecks, rejectCheck } = await ops();
      const [a] = await openChecks(['20.00'], day(-10));
      expectOk(await depositChecks(deposit([{ checkId: a!.id, creditedOn: TODAY }])));
      const message = expectFail(await rejectCheck({ checkId: a!.id, date: day(-1), reason: 'x', returnedBy: 'BANK' }));
      expect(message).toMatch(new RegExp(`^La fecha del rechazo no puede ser anterior al ${moment(TODAY).format('DD/MM/YYYY')} \\(depósito CD-\\d{6}\\)$`));
    });

    it('anulaciones: el depósito con un rechazado se bloquea; anulando el rechazo y el depósito todo vuelve', async () => {
      const { depositChecks, rejectCheck, cancelCheckOperation } = await ops();
      const [a, b] = await openChecks(['60.00', '40.00']);
      const portfolioBefore = await balanceOf(PORTFOLIO);
      const bankBefore = await balanceOf(BANK);
      const dep = expectOk(await depositChecks(deposit([{ checkId: a!.id, creditedOn: TODAY }, { checkId: b!.id, creditedOn: TODAY }])));
      const rej = expectOk(await rejectCheck({ checkId: a!.id, date: TODAY, reason: 'Sin fondos', returnedBy: 'BANK' }));
      expect(expectFail(await cancelCheckOperation(dep.id, 'x'))).toBe(
        `El cheque Nº ${a!.number} (BANCO GALICIA) está rechazado: anulá primero el rechazo ${rej.number}`
      );
      expectOk(await cancelCheckOperation(rej.id, 'Error de carga'));
      expect(await statusOf(a!.id)).toBe('DEPOSITED');
      expectOk(await cancelCheckOperation(dep.id, 'Error de carga'));
      expect(await statusOf(a!.id)).toBe('IN_PORTFOLIO');
      expect(await statusOf(b!.id)).toBe('IN_PORTFOLIO');
      expect(await balanceOf(PORTFOLIO)).toBe(portfolioBefore);
      expect(await balanceOf(BANK)).toBe(bankBefore);
      expect(expectFail(await cancelCheckOperation(dep.id, 'x'))).toBe('La operación ya está anulada');
    });

    it('un rechazo cuya deuda está en un recibo no se anula', async () => {
      const { depositChecks, rejectCheck, cancelCheckOperation } = await ops();
      const { saveReceiptDraft, confirmReceipt } = await import('./receipts.server');
      const [a] = await openChecks(['90.00']);
      expectOk(await depositChecks(deposit([{ checkId: a!.id, creditedOn: TODAY }])));
      const rej = expectOk(await rejectCheck({ checkId: a!.id, date: TODAY, reason: 'Sin fondos', returnedBy: 'BANK' }));
      const values = {
        customerId: CUSTOMER,
        date: TODAY,
        notes: '',
        rates: [],
        invoices: [],
        advancesApplied: [],
        advance: { amount: '', description: '' },
        withholdings: [],
        payments: [{ method: 'CASH' as const, accountId: CASH, amount: '90', reference: '', checkNumber: '', checkBank: '', checkDueOn: '' }],
        rejectedChecks: [{ checkId: a!.id, amount: '90' }],
      };
      const draft = expectOk(await saveReceiptDraft(null, values));
      expect(expectFail(await cancelCheckOperation(rej.id, 'x'))).toBe('La deuda del cheque está en un recibo en borrador: quitala de ahí primero');
      const confirmed = expectOk(await confirmReceipt(draft.id, values));
      expect(expectFail(await cancelCheckOperation(rej.id, 'x'))).toBe(`La deuda del cheque se cobró en ${confirmed.number}: anulá ese recibo primero`);
      expect(await statusOf(a!.id)).toBe('REJECTED');
    });

    it('depósito y descuento a la vez del mismo cheque: uno solo gana', async () => {
      const { depositChecks, discountChecks } = await ops();
      const [a] = await openChecks(['500.00']);
      const results = await Promise.all([
        depositChecks(deposit([{ checkId: a!.id, creditedOn: TODAY }])),
        discountChecks({ bankAccountId: BANK, date: TODAY, interest: '10', fee: '0', reference: '', checkIds: [a!.id] }),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      const failed = results.find((r) => !r.ok);
      expect(failed && !failed.ok ? failed.error : '').toMatch(/^El cheque Nº \d+ \(BANCO GALICIA\) está (depositado|descontado): no se puede (depositar|descontar)$/);
      const prisma = await db();
      expect(await prisma.treasury_movements.count({ where: { third_party_check_id: a!.id, account_id: PORTFOLIO, amount: { lt: 0 }, cancelled_at: null } })).toBe(1);
    });

    it('dos depósitos a la vez de cheques distintos: números consecutivos', async () => {
      const { depositChecks } = await ops();
      const [a, b] = await openChecks(['1.00', '2.00']);
      const [x, y] = await Promise.all([depositChecks(deposit([{ checkId: a!.id, creditedOn: TODAY }])), depositChecks(deposit([{ checkId: b!.id, creditedOn: TODAY }]))]);
      const numbers = [expectOk(x).number, expectOk(y).number].map((n) => Number(n.slice(3))).sort((m, n) => m - n);
      expect(numbers[1]! - numbers[0]!).toBe(1);
    });

    it('un cheque de otra empresa no existe; sin permiso de anular no se anula', async () => {
      const { depositChecks, cancelCheckOperation } = await ops();
      const foreign = await insertCheck({ companyId: OTHER_COMPANY });
      expect(expectFail(await depositChecks(deposit([{ checkId: foreign.id, creditedOn: TODAY }])))).toBe('El cheque no existe');
      const [a] = await openChecks(['3.00']);
      const dep = expectOk(await depositChecks(deposit([{ checkId: a!.id, creditedOn: TODAY }])));
      state.denied.add('tesoreria:cheques:delete');
      expect(expectFail(await cancelCheckOperation(dep.id, 'x'))).toBe('No tenés permiso para realizar esta acción');
    });

    it('un movimiento de una operación de cheques no se toca desde Movimientos', async () => {
      const { depositChecks } = await ops();
      const { cancelManualMovement } = await import('./movements.server');
      const [a] = await openChecks(['5.00']);
      const dep = expectOk(await depositChecks(deposit([{ checkId: a!.id, creditedOn: TODAY }])));
      const prisma = await db();
      const movement = await prisma.treasury_movements.findFirstOrThrow({ where: { check_operation_id: dep.id }, select: { id: true } });
      expect(expectFail(await cancelManualMovement(movement.id, 'x'))).toBe(
        `Este movimiento es de la operación de cheques ${dep.number}. Para revertirlo, anulá la operación`
      );
    });

    it('una salida no puede ser anterior a la entrada del cheque a la cartera (depósito y descuento)', async () => {
      const { depositChecks, discountChecks } = await ops();
      const [a] = await openChecks(['30.00'], day(-20));
      const entered = moment(TODAY).format('DD/MM/YYYY');
      expect(expectFail(await depositChecks(deposit([{ checkId: a!.id, creditedOn: TODAY }], day(-1))))).toBe(
        `Cheque Nº ${a!.number}: entró a la cartera el ${entered}; la operación no puede ser anterior`
      );
      expect(expectFail(await discountChecks({ bankAccountId: BANK, date: day(-1), interest: '0', fee: '0', reference: '', checkIds: [a!.id] }))).toBe(
        `Cheque Nº ${a!.number}: entró a la cartera el ${entered}; la operación no puede ser anterior`
      );
    });

    it('detalle del cheque: historial con su documento y aviso de vencimiento', async () => {
      const { depositChecks, getCheckDetail } = await ops();
      const [a] = await openChecks(['8.00'], day(-27));
      const pending = await getCheckDetail(a!.id);
      expect(pending?.depositWarning).toBe('DUE_SOON');
      const dep = expectOk(await depositChecks(deposit([{ checkId: a!.id, creditedOn: TODAY }])));
      const detail = await getCheckDetail(a!.id);
      expect(detail?.status).toBe('DEPOSITED');
      expect(detail?.events.map((e) => [e.toStatus, e.document?.label])).toEqual([
        ['IN_PORTFOLIO', 'Carga inicial'],
        ['DEPOSITED', dep.number],
      ]);
      expect(detail?.lastOperation).toMatchObject({ id: dep.id, number: dep.number });
    });
  });

  describe('filtros hostiles de la tabla de cheques', () => {
    const NUL = '\u0000';
    const BIG_DIGITS = '9'.repeat(400);
    const BAD_DATES = ['2026-02-31', '2026-13-01', '0000-01-01', '9999-12-31', '2026-2-1', 'abc', NUL];
    const BAD_UUIDS = ['nope', "' OR 1=1 --", '__null__', NUL, '3f0e2b1c-1111-4222-8333-44445555666z'];
    const BAD_ENUMS = ['NOPE', '__null__', NUL, "'; DROP TABLE x;--", 'constructor'];
    const BAD_AMOUNTS = ['99999999999999999999', '10000000000000.00', BIG_DIGITS, '1e5', 'abc', '-1', '1,2,3', NUL, '0.0000001'];
    const BAD_TEXT = [NUL, `a${NUL}b`, '%', '_', '\\', "'", 'x'.repeat(100_000)];

    /** Cada pareja clave/valor se prueba sola: un valor roto no puede esconderse detras de otro. */
    const cases: Array<[string, string]> = [
      ...['issue_date_from', 'issue_date_to', 'payment_date_from', 'payment_date_to', 'deposit_deadline_from', 'deposit_deadline_to'].flatMap((k) => BAD_DATES.map((v): [string, string] => [k, v])),
      ...['customer', 'portfolio', 'destination'].flatMap((k) => BAD_UUIDS.map((v): [string, string] => [k, v])),
      ...['status', 'kind'].flatMap((k) => BAD_ENUMS.map((v): [string, string] => [k, v])),
      ...['amount'].flatMap((k) => BAD_AMOUNTS.map((v): [string, string] => [k, v])),
      ...['number', 'bank', 'drawer_name', 'drawer_cuit', 'search'].flatMap((k) => BAD_TEXT.map((v): [string, string] => [k, v])),
      ['page', 'abc'], ['page', '1e99'], ['page', '-5'], ['page', '99999999999999999999'],
      ['pageSize', 'abc'], ['pageSize', '0'], ['pageSize', '-1'], ['pageSize', '99999999999999999999'],
      ['sort', 'constructor.asc'], ['sort', '__proto__.desc'], ['sort', 'toString.asc'], ['sort', 'hasOwnProperty.desc'],
    ];

    it('la consulta paginada y el export responden con cualquier valor', async () => {
      const { getChecksPaginated, getAllChecksForExport } = await import('../Checks/ChecksList/actions.server');
      const failures: string[] = [];
      for (const [key, value] of cases) {
        const params = { [key]: value };
        try {
          await getChecksPaginated(params);
          if (key !== 'page' && key !== 'pageSize' && key !== 'sort') await getAllChecksForExport(params);
        } catch {
          failures.push(`${key}=${value.slice(0, 30)}`);
        }
      }
      expect(failures).toEqual([]);
    }, 120_000);

    it('los facets (cross-filter) responden con cualquier valor', async () => {
      const { getCheckSingleFacet } = await import('../Checks/ChecksList/actions.server');
      const failures: string[] = [];
      for (const [key, value] of cases) {
        for (const column of ['status', 'kind', 'customer', 'portfolio', 'destination']) {
          // El facet traga los errores y devuelve null: null en una columna conocida = la consulta fallo
          if ((await getCheckSingleFacet(column, { [key]: value })) === null) failures.push(`${column}: ${key}=${value.slice(0, 30)}`);
        }
      }
      expect(failures).toEqual([]);
    }, 240_000);

    it('un importe mas grande que numeric(15,2) da cero filas y un id invalido se ignora', async () => {
      const { getChecksPaginated } = await import('../Checks/ChecksList/actions.server');
      expect((await getChecksPaginated({ amount: '99999999999999999999' })).total).toBe(0);
      const all = await getChecksPaginated({});
      expect((await getChecksPaginated({ customer: 'no-es-un-uuid' })).total).toBe(all.total);
    });

    it('vence para depositar filtra sobre la fecha de pago desplazada 30 dias', async () => {
      const { getChecksPaginated } = await import('../Checks/ChecksList/actions.server');
      const { depositDeadline } = await import('../lib/checks-dates');
      const a = await insertCheck({ amount: '7.00', paymentDate: day(2) });
      const due = depositDeadline(day(2));
      const hit = await getChecksPaginated({ deposit_deadline_from: due, deposit_deadline_to: due });
      expect(hit.data.map((c) => c.id)).toContain(a.id);
      const miss = await getChecksPaginated({ deposit_deadline_from: day(900), deposit_deadline_to: day(901) });
      expect(miss.data.map((c) => c.id)).not.toContain(a.id);
    });
  });
});
