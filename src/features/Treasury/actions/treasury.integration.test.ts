import moment from 'moment';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { treasuryToday } from '../lib/today';

/**
 * Tesorería (etapa 1) contra el Postgres del compose: `npm run test:treasury`. Se simulan la
 * sesión, la empresa activa y los permisos.
 */

const COMPANY = 'e8000000-0000-4000-8000-000000000001';
const OTHER_COMPANY = 'e8000000-0000-4000-8000-000000000002';
const USER = 'e8000000-0000-4000-8000-000000000003';
const FOREIGN_ACCOUNT = 'e8000000-0000-4000-8000-000000000040';
const FOREIGN_CONCEPT = 'e8000000-0000-4000-8000-000000000041';

const state = vi.hoisted(() => ({ denied: new Set<string>() }));

vi.mock('@/shared/lib/tenant', () => ({ getActiveCompanyId: async () => 'e8000000-0000-4000-8000-000000000001' }));
vi.mock('@/features/Permissions', () => ({
  checkPermissionServer: async (module: string, tab: string, action: string) =>
    !state.denied.has(`${module}:${tab}:${action}`),
}));
vi.mock('@/shared/actions/auth.actions', () => {
  const current = () => ({
    id: 'e8000000-0000-4000-8000-000000000003',
    credentialId: 'e8000000-0000-4000-8000-000000000003',
    fullname: null,
    email: null,
  });
  return { getServerAuthProfile: async () => current(), requireServerAuthProfile: async () => current() };
});
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

const RUN = Boolean(process.env.DATABASE_URL);

async function db() {
  return (await import('@/shared/lib/prisma')).prisma;
}

async function cleanup() {
  const prisma = await db();
  const company_id = { in: [COMPANY, OTHER_COMPANY] };
  await prisma.treasury_movements.deleteMany({ where: { company_id } });
  await prisma.treasury_transfers.deleteMany({ where: { company_id } });
  await prisma.treasury_concepts.deleteMany({ where: { company_id } });
  await prisma.treasury_accounts.deleteMany({ where: { company_id } });
  await prisma.profile.deleteMany({ where: { id: USER } });
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

// Hoy en hora argentina, como el servidor (lib/today.ts): a la noche UTC ya es "mañana" y un
// movimiento de hoy no debe quedar como futuro.
const TODAY = treasuryToday();
const TOMORROW = moment(TODAY).add(1, 'day').format('YYYY-MM-DD');
const MONTH_START = moment(TODAY).startOf('month').format('YYYY-MM-DD');
const LAST_MONTH = moment(TODAY).subtract(1, 'month').startOf('month').format('YYYY-MM-DD');

const accountForm = (name: string, over: Record<string, string> = {}) => ({
  kind: 'BANK' as const,
  name,
  bankName: '',
  accountNumber: '',
  cbu: '',
  openingDate: '',
  openingAmount: '',
  ...over,
});

let bankId = '';
let cashId = '';
let feesId = '';
let incomeId = '';
let adjustId = '';

async function indicatorsOf(accountId: string) {
  const accounts = await import('./accounts.server');
  const rows = await accounts.getTreasuryAccounts();
  const row = rows.find((r) => r.id === accountId);
  if (!row) throw new Error('cuenta no encontrada');
  return { balance: row.balance, toDebit: row.toDebit, toCredit: row.toCredit, projected: row.projected };
}

describe.skipIf(!RUN)('tesoreria (integracion)', () => {
  beforeAll(async () => {
    await cleanup();
    const prisma = await db();
    const city = await prisma.cities.findFirstOrThrow({ select: { id: true } });
    for (const [id, cuit] of [
      [COMPANY, '30999999980'],
      [OTHER_COMPANY, '30999999962'],
    ] as const) {
      await prisma.company.create({
        data: {
          id,
          company_name: `Tesoreria test ${cuit}`,
          description: 'empresa de prueba',
          contact_email: 'tesoreria-test@alphataco.local',
          contact_phone: '+542991234567',
          address: 'Calle 123',
          city: city.id,
          country: 'argentina',
          industry: 'Petroleo',
          company_cuit: cuit,
        },
      });
    }
    await prisma.profile.create({ data: { id: USER, credential_id: USER, email: 'tesoreria@alphataco.local' } });
    await prisma.treasury_accounts.create({
      data: { id: FOREIGN_ACCOUNT, company_id: OTHER_COMPANY, kind: 'BANK', name: 'Ajena' },
    });
    await prisma.treasury_concepts.create({
      data: { id: FOREIGN_CONCEPT, company_id: OTHER_COMPANY, name: 'Ajeno', direction: 'BOTH' },
    });
  }, 60_000);

  afterAll(async () => {
    await cleanup();
  }, 60_000);

  beforeEach(() => {
    state.denied.clear();
  });

  describe('cuentas y cajas', () => {
    it('alta con saldo inicial, duplicado, CBU, editar, perímetro y permisos', async () => {
      const actions = await import('./accounts.server');
      bankId = expectOk(
        await actions.createTreasuryAccount(
          accountForm('Banco Galicia', { openingDate: LAST_MONTH, openingAmount: '100000' })
        )
      ).id;
      cashId = expectOk(await actions.createTreasuryAccount(accountForm('Caja chica', { kind: 'CASH' }))).id;
      expect(expectFail(await actions.createTreasuryAccount(accountForm('banco galicia')))).toBe(
        'Ya existe la cuenta «Banco Galicia»'
      );
      expect(expectFail(await actions.createTreasuryAccount(accountForm('Otra', { cbu: '123' })))).toBe(
        'El CBU tiene 22 dígitos'
      );
      expect(expectFail(await actions.createTreasuryAccount(accountForm('Otra', { openingAmount: '10' })))).toBe(
        'Indicá la fecha del saldo inicial'
      );
      expectOk(await actions.updateTreasuryAccount(bankId, accountForm('Galicia CC', { bankName: 'Galicia' })));
      expect(await indicatorsOf(bankId)).toEqual({
        balance: '100000.00',
        toDebit: '0.00',
        toCredit: '0.00',
        projected: '100000.00',
      });
      expect(expectFail(await actions.setTreasuryAccountActive(FOREIGN_ACCOUNT, false))).toBe('La cuenta no existe');
      state.denied.add('tesoreria:config-tesoreria:create');
      expect(expectFail(await actions.createTreasuryAccount(accountForm('X')))).toBe(
        'No tenés permiso para realizar esta acción'
      );
    });

    it('una cuenta con movimientos no se borra; una sin uso sí', async () => {
      const actions = await import('./accounts.server');
      expect(expectFail(await actions.deleteTreasuryAccount(bankId))).toBe('La cuenta tiene movimientos: desactivala');
      const unused = expectOk(await actions.createTreasuryAccount(accountForm('Sin uso'))).id;
      expectOk(await actions.deleteTreasuryAccount(unused));
      expect((await actions.getTreasuryAccounts()).some((r) => r.id === unused)).toBe(false);
    });
  });

  describe('conceptos', () => {
    it('alta, duplicado y listado', async () => {
      const actions = await import('./concepts.server');
      feesId = expectOk(await actions.createTreasuryConcept({ name: 'Gastos bancarios', direction: 'OUT' })).id;
      incomeId = expectOk(await actions.createTreasuryConcept({ name: 'Aporte de socios', direction: 'IN' })).id;
      adjustId = expectOk(await actions.createTreasuryConcept({ name: 'Ajuste', direction: 'BOTH' })).id;
      expect(expectFail(await actions.createTreasuryConcept({ name: 'gastos bancarios', direction: 'BOTH' }))).toBe(
        'Ya existe el concepto «Gastos bancarios»'
      );
      expect((await actions.getTreasuryConcepts()).map((c) => c.name)).toEqual([
        'Ajuste',
        'Aporte de socios',
        'Gastos bancarios',
      ]);
    });
  });

  describe('saldo inicial', () => {
    it('se edita el vigente y un segundo se rechaza nombrando la fecha', async () => {
      const actions = await import('./movements.server');
      expect(expectFail(await actions.createOpeningBalance({ accountId: bankId, date: TODAY, amount: '5' }))).toBe(
        `La cuenta ya tiene saldo inicial al ${moment(LAST_MONTH).format('DD/MM/YYYY')}: editalo`
      );
      const prisma = await db();
      const opening = await prisma.treasury_movements.findFirstOrThrow({
        where: { account_id: bankId, kind: 'OPENING' },
      });
      expectOk(
        await actions.updateOpeningBalance(opening.id, { accountId: bankId, date: LAST_MONTH, amount: '200000' })
      );
      expect((await indicatorsOf(bankId)).balance).toBe('200000.00');
      // Una caja puede arrancar en negativo (descubierto)? Se permite: el saldo inicial lleva signo.
      expectOk(await actions.createOpeningBalance({ accountId: cashId, date: LAST_MONTH, amount: '-500' }));
      expect((await indicatorsOf(cashId)).balance).toBe('-500.00');
    });
  });

  describe('movimientos manuales', () => {
    it('alta de egreso de hoy: entra al saldo (fecha local)', async () => {
      const actions = await import('./movements.server');
      expectOk(
        await actions.createManualMovement({
          accountId: bankId,
          date: TODAY,
          direction: 'OUT',
          amount: '1500,50',
          conceptId: feesId,
          description: 'Comisión',
        })
      );
      expect(await indicatorsOf(bankId)).toEqual({
        balance: '198499.50',
        toDebit: '0.00',
        toCredit: '0.00',
        projected: '198499.50',
      });
    });

    it('futuros: a debitar y a acreditar, fuera del saldo', async () => {
      const actions = await import('./movements.server');
      expectOk(
        await actions.createManualMovement({
          accountId: bankId,
          date: TOMORROW,
          direction: 'OUT',
          amount: '1000',
          conceptId: feesId,
          description: '',
        })
      );
      expectOk(
        await actions.createManualMovement({
          accountId: bankId,
          date: TOMORROW,
          direction: 'IN',
          amount: '300',
          conceptId: incomeId,
          description: '',
        })
      );
      expect(await indicatorsOf(bankId)).toEqual({
        balance: '198499.50',
        toDebit: '-1000.00',
        toCredit: '300.00',
        projected: '197799.50',
      });
    });

    it('concepto con el sentido equivocado, inactivo o ajeno', async () => {
      const actions = await import('./movements.server');
      const concepts = await import('./concepts.server');
      const base = { accountId: bankId, date: TODAY, amount: '10', description: '' };
      expect(expectFail(await actions.createManualMovement({ ...base, direction: 'IN', conceptId: feesId }))).toBe(
        'El concepto «Gastos bancarios» es solo de egresos'
      );
      expect(expectFail(await actions.createManualMovement({ ...base, direction: 'OUT', conceptId: incomeId }))).toBe(
        'El concepto «Aporte de socios» es solo de ingresos'
      );
      expect(
        expectFail(await actions.createManualMovement({ ...base, direction: 'IN', conceptId: FOREIGN_CONCEPT }))
      ).toBe('El concepto no existe');
      expectOk(await concepts.setTreasuryConceptActive(adjustId, false));
      expect(expectFail(await actions.createManualMovement({ ...base, direction: 'IN', conceptId: adjustId }))).toBe(
        'El concepto «Ajuste» está inactivo'
      );
      expectOk(await concepts.setTreasuryConceptActive(adjustId, true));
    });

    it('editar cambiando Ingreso → Egreso con un concepto solo de ingresos se rechaza y no cambia nada', async () => {
      const actions = await import('./movements.server');
      const created = expectOk(
        await actions.createManualMovement({
          accountId: cashId,
          date: TODAY,
          direction: 'IN',
          amount: '800',
          conceptId: incomeId,
          description: 'Aporte',
        })
      );
      expect(
        expectFail(
          await actions.updateManualMovement(created.id, {
            accountId: cashId,
            date: TODAY,
            direction: 'OUT',
            amount: '800',
            conceptId: incomeId,
            description: 'Aporte',
          })
        )
      ).toBe('El concepto «Aporte de socios» es solo de ingresos');
      const prisma = await db();
      const row = await prisma.treasury_movements.findUniqueOrThrow({ where: { id: created.id } });
      expect(row.amount.toString()).toBe('800');
      expectOk(
        await actions.updateManualMovement(created.id, {
          accountId: cashId,
          date: TODAY,
          direction: 'OUT',
          amount: '50',
          conceptId: adjustId,
          description: 'Ajuste',
        })
      );
      expect((await indicatorsOf(cashId)).balance).toBe('-550.00');
    });

    it('anular con motivo; la segunda anulación falla', async () => {
      const actions = await import('./movements.server');
      const created = expectOk(
        await actions.createManualMovement({
          accountId: bankId,
          date: TODAY,
          direction: 'OUT',
          amount: '99',
          conceptId: feesId,
          description: '',
        })
      );
      expect((await indicatorsOf(bankId)).balance).toBe('198400.50');
      expect(expectFail(await actions.cancelManualMovement(created.id, ''))).toBe('Indicá el motivo');
      expectOk(await actions.cancelManualMovement(created.id, 'Cargado dos veces'));
      expect((await indicatorsOf(bankId)).balance).toBe('198499.50');
      expect(expectFail(await actions.cancelManualMovement(created.id, 'Otra vez'))).toBe(
        'El movimiento ya estaba anulado'
      );
      expect(
        expectFail(
          await actions.updateManualMovement(created.id, {
            accountId: bankId,
            date: TODAY,
            direction: 'OUT',
            amount: '1',
            conceptId: feesId,
            description: '',
          })
        )
      ).toBe('El movimiento está anulado');
    });

    it('cuenta inactiva o ajena', async () => {
      const actions = await import('./movements.server');
      const accounts = await import('./accounts.server');
      const base = { date: TODAY, direction: 'OUT' as const, amount: '10', conceptId: feesId, description: '' };
      expectOk(await accounts.setTreasuryAccountActive(cashId, false));
      expect(expectFail(await actions.createManualMovement({ ...base, accountId: cashId }))).toBe(
        'La cuenta «Caja chica» está inactiva'
      );
      expectOk(await accounts.setTreasuryAccountActive(cashId, true));
      expect(expectFail(await actions.createManualMovement({ ...base, accountId: FOREIGN_ACCOUNT }))).toBe(
        'La cuenta no existe'
      );
    });

    it('editar un manual conservando su concepto o su cuenta ya desactivados se permite; pasarlo a otra inactiva no', async () => {
      const actions = await import('./movements.server');
      const concepts = await import('./concepts.server');
      const accounts = await import('./accounts.server');
      const created = expectOk(
        await actions.createManualMovement({
          accountId: cashId,
          date: TODAY,
          direction: 'IN',
          amount: '70',
          conceptId: adjustId,
          description: '',
        })
      );
      expectOk(await concepts.setTreasuryConceptActive(adjustId, false));
      expectOk(await accounts.setTreasuryAccountActive(cashId, false));
      const values = {
        accountId: cashId,
        date: TODAY,
        direction: 'IN' as const,
        amount: '75',
        conceptId: adjustId,
        description: 'Corregido',
      };
      expectOk(await actions.updateManualMovement(created.id, values));
      expectOk(await accounts.setTreasuryAccountActive(cashId, true));
      expectOk(await accounts.setTreasuryAccountActive(bankId, false));
      expect(expectFail(await actions.updateManualMovement(created.id, { ...values, accountId: bankId }))).toBe(
        'La cuenta «Galicia CC» está inactiva'
      );
      expectOk(await accounts.setTreasuryAccountActive(bankId, true));
      expectOk(await concepts.setTreasuryConceptActive(adjustId, true));
      expectOk(await actions.cancelManualMovement(created.id, 'Prueba de edición'));
    });

    it('permisos', async () => {
      const actions = await import('./movements.server');
      state.denied.add('tesoreria:movimientos:create');
      expect(
        expectFail(
          await actions.createManualMovement({
            accountId: bankId,
            date: TODAY,
            direction: 'OUT',
            amount: '1',
            conceptId: feesId,
            description: '',
          })
        )
      ).toBe('No tenés permiso para realizar esta acción');
    });
  });

  describe('transferencias', () => {
    let transferId = '';

    it('crea dos movimientos con la misma fecha y numera TR-', async () => {
      const actions = await import('./transfers.server');
      const created = expectOk(
        await actions.createTransfer({
          fromAccountId: bankId,
          toAccountId: cashId,
          date: TODAY,
          amount: '10000',
          notes: 'Fondo de caja',
        })
      );
      transferId = created.id;
      expect(created.number).toBe('TR-000001');
      const second = expectOk(
        await actions.createTransfer({
          fromAccountId: cashId,
          toAccountId: bankId,
          date: TODAY,
          amount: '1',
          notes: '',
        })
      );
      expect(second.number).toBe('TR-000002');
      const prisma = await db();
      const movements = await prisma.treasury_movements.findMany({
        where: { transfer_id: transferId },
        orderBy: { amount: 'asc' },
      });
      expect(movements.map((m) => [m.account_id, m.amount.toString(), m.date.toISOString().slice(0, 10)])).toEqual([
        [bankId, '-10000', TODAY],
        [cashId, '10000', TODAY],
      ]);
      expect((await indicatorsOf(cashId)).balance).toBe('9449.00');
    });

    it('misma cuenta, cuenta inactiva o ajena', async () => {
      const actions = await import('./transfers.server');
      const accounts = await import('./accounts.server');
      const base = { date: TODAY, amount: '1', notes: '' };
      expect(expectFail(await actions.createTransfer({ ...base, fromAccountId: bankId, toAccountId: bankId }))).toBe(
        'Elegí cuentas distintas'
      );
      expect(
        expectFail(await actions.createTransfer({ ...base, fromAccountId: bankId, toAccountId: FOREIGN_ACCOUNT }))
      ).toBe('La cuenta no existe');
      expectOk(await accounts.setTreasuryAccountActive(cashId, false));
      expect(expectFail(await actions.createTransfer({ ...base, fromAccountId: bankId, toAccountId: cashId }))).toBe(
        'La cuenta «Caja chica» está inactiva'
      );
      expectOk(await accounts.setTreasuryAccountActive(cashId, true));
    });

    it('dos anulaciones simultáneas: una anula los dos movimientos, la otra falla y no pisa el motivo', async () => {
      const actions = await import('./transfers.server');
      const results = await Promise.all([
        actions.cancelTransfer(transferId, 'Primera'),
        actions.cancelTransfer(transferId, 'Segunda'),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: 'La TR-000001 ya estaba anulada' });
      const prisma = await db();
      const transfer = await prisma.treasury_transfers.findUniqueOrThrow({ where: { id: transferId } });
      const movements = await prisma.treasury_movements.findMany({ where: { transfer_id: transferId } });
      const reason = transfer.cancel_reason;
      expect(movements.every((m) => m.cancelled_at !== null && m.cancel_reason === reason)).toBe(true);
      expect((await indicatorsOf(cashId)).balance).toBe('-551.00');
    });

    it('un movimiento de transferencia no se edita ni se anula desde Movimientos', async () => {
      const movements = await import('./movements.server');
      const prisma = await db();
      const second = await prisma.treasury_transfers.findFirstOrThrow({
        where: { company_id: COMPANY, number: 'TR-000002' },
      });
      const row = await prisma.treasury_movements.findFirstOrThrow({ where: { transfer_id: second.id } });
      expect(expectFail(await movements.cancelManualMovement(row.id, 'x'))).toBe(
        'Este movimiento es de la transferencia TR-000002. Para revertirlo, anulá la transferencia'
      );
    });
  });

  describe('extracto', () => {
    it('saldo anterior, acumulado, anulados que no suman y futuros marcados', async () => {
      const actions = await import('./statement.server');
      const data = await actions.getAccountStatementData(cashId, MONTH_START, TOMORROW);
      if (!data) throw new Error('sin extracto');
      expect(data.previous).toBe(moment(LAST_MONTH).isBefore(MONTH_START) ? '-500.00' : '0.00');
      const last = data.rows[data.rows.length - 1];
      expect(data.closing).toBe(last?.balance ?? data.previous);
      expect(data.closing).toBe('-551.00');
      expect(data.rows.some((r) => r.cancelled && r.cancelReason)).toBe(true);
      expect(await actions.getAccountStatementData(FOREIGN_ACCOUNT, MONTH_START, TOMORROW)).toBeNull();
    });

    it('saldo a una fecha: cuenta los futuros hasta esa fecha y excluye el que se edita', async () => {
      const actions = await import('./statement.server');
      const prisma = await db();
      expect(await actions.getAccountBalanceOn(bankId, TODAY)).toBe((await indicatorsOf(bankId)).balance);
      const expected = (Number((await indicatorsOf(bankId)).balance) - 1000 + 300).toFixed(2);
      expect(await actions.getAccountBalanceOn(bankId, TOMORROW)).toBe(expected);
      const future = await prisma.treasury_movements.findFirstOrThrow({
        where: { account_id: bankId, date: new Date(`${TOMORROW}T00:00:00.000Z`), amount: -1000 },
      });
      expect(await actions.getAccountBalanceOn(bankId, TOMORROW, future.id)).toBe((Number(expected) + 1000).toFixed(2));
      expect(await actions.getAccountBalanceOn(FOREIGN_ACCOUNT, TODAY)).toBeNull();
    });
  });
});
