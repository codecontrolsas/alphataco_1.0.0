import moment from 'moment';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { treasuryToday } from '../lib/today';

/**
 * Tesorería etapa 4 (conciliación bancaria) contra el Postgres del compose: `npm run test:treasury`.
 * Se simulan la sesión, la empresa activa y los permisos.
 */

const COMPANY = 'e9400000-0000-4000-8000-000000000001';
const OTHER_COMPANY = 'e9400000-0000-4000-8000-000000000002';
const USER = 'e9400000-0000-4000-8000-000000000003';
const SUPPLIER = 'e9400000-0000-4000-8000-000000000015';
const BANK = 'e9400000-0000-4000-8000-000000000021';
const CASH = 'e9400000-0000-4000-8000-000000000022';
const FOREIGN_BANK = 'e9400000-0000-4000-8000-000000000023';
const FEES = 'e9400000-0000-4000-8000-000000000030';
const INCOME = 'e9400000-0000-4000-8000-000000000031';

const state = vi.hoisted(() => ({ denied: new Set<string>() }));

vi.mock('@/shared/lib/tenant', () => ({ getActiveCompanyId: async () => 'e9400000-0000-4000-8000-000000000001' }));
vi.mock('@/features/Permissions/actions/permissions.server', () => ({
  checkPermissionServer: async (module: string, tab: string, action: string) => !state.denied.has(`${module}:${tab}:${action}`),
}));
vi.mock('@/shared/actions/auth.actions', () => {
  const current = () => ({ id: 'e9400000-0000-4000-8000-000000000003', credentialId: 'e9400000-0000-4000-8000-000000000003', fullname: null, email: null });
  return { getServerAuthProfile: async () => current(), requireServerAuthProfile: async () => current() };
});
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

const RUN = Boolean(process.env.DATABASE_URL);

const TODAY = treasuryToday();
const day = (offset: number) => moment(TODAY).add(offset, 'days').format('YYYY-MM-DD');
const dmy = (iso: string) => moment(iso).format('DD/MM/YYYY');

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
    await tx.$executeRaw`DELETE FROM bank_statement_lines WHERE company_id = ANY(${companies}::uuid[])`;
    await tx.$executeRaw`DELETE FROM bank_statements WHERE company_id = ANY(${companies}::uuid[])`;
    await tx.$executeRaw`DELETE FROM bank_statement_profiles WHERE company_id = ANY(${companies}::uuid[])`;
    await tx.$executeRaw`DELETE FROM treasury_movements WHERE company_id = ANY(${companies}::uuid[])`;
    await tx.$executeRaw`DELETE FROM own_check_events e USING own_checks c WHERE c.id = e.check_id AND c.company_id = ANY(${companies}::uuid[])`;
    await tx.$executeRaw`DELETE FROM own_checks WHERE company_id = ANY(${companies}::uuid[])`;
    await tx.$executeRaw`DELETE FROM payment_orders WHERE company_id = ANY(${companies}::uuid[])`;
    await tx.$executeRaw`DELETE FROM payment_order_payments p WHERE NOT EXISTS (SELECT 1 FROM payment_orders o WHERE o.id = p.payment_order_id)`;
    await tx.$executeRaw`DELETE FROM payment_order_lines l WHERE NOT EXISTS (SELECT 1 FROM payment_orders o WHERE o.id = l.payment_order_id)`;
    await tx.$executeRaw`DELETE FROM treasury_transfers WHERE company_id = ANY(${companies}::uuid[])`;
    await tx.$executeRaw`DELETE FROM treasury_concepts WHERE company_id = ANY(${companies}::uuid[])`;
    await tx.$executeRaw`DELETE FROM treasury_accounts WHERE company_id = ANY(${companies}::uuid[])`;
    await tx.$executeRaw`DELETE FROM suppliers WHERE company_id = ANY(${companies}::uuid[])`;
    await tx.$executeRaw`DELETE FROM profile WHERE id = ${USER}::uuid`;
    await tx.$executeRaw`DELETE FROM company WHERE id = ANY(${companies}::uuid[])`;
  });
}

type Profile = import('../schemas/reconciliation').StatementProfileValues;
const PROFILE: Profile = {
  headerRow: 1,
  dateColumn: 'A',
  descriptionColumn: 'B',
  referenceColumn: 'C',
  amountMode: 'SINGLE',
  amountColumn: 'D',
  debitColumn: '',
  creditColumn: '',
  dateFormat: 'DD/MM/YYYY',
  decimalSeparator: ',',
};
const header = ['Fecha', 'Concepto', 'Referencia', 'Importe'];
const row = (offset: number, description: string, amount: string, reference = '') => [dmy(day(offset)), description, reference, amount];

async function importRows(rows: string[][], fileName = 'extracto.csv') {
  const actions = await import('./reconciliation.server');
  return actions.importStatement({ accountId: BANK, fileName, profile: PROFILE, rows: [header, ...rows] });
}

/** Movimiento manual vigente del banco, creado con la action real. */
async function manual(offset: number, direction: 'IN' | 'OUT', amount: string, description = '') {
  const movements = await import('./movements.server');
  return expectOk(
    await movements.createManualMovement({ accountId: BANK, date: day(offset), direction, amount, conceptId: direction === 'IN' ? INCOME : FEES, description })
  ).id;
}

async function lineByDescription(description: string) {
  const prisma = await db();
  return prisma.bank_statement_lines.findFirstOrThrow({ where: { company_id: COMPANY, description }, select: { id: true, status: true, movement_id: true } });
}

describe.skipIf(!RUN)('conciliación bancaria (integracion)', () => {
  beforeAll(async () => {
    await cleanup();
    const prisma = await db();
    const city = await prisma.cities.findFirstOrThrow({ select: { id: true } });
    for (const [id, cuit] of [
      [COMPANY, '30999999950'],
      [OTHER_COMPANY, '30999999951'],
    ] as const) {
      await prisma.company.create({
        data: { id, company_name: `Conciliación test ${cuit}`, description: 'x', contact_email: 'conc@alphataco.local', contact_phone: '+542991234567', address: 'C', city: city.id, country: 'argentina', industry: 'Petroleo', company_cuit: cuit },
      });
    }
    await prisma.profile.create({ data: { id: USER, credential_id: USER, email: 'conc@alphataco.local' } });
    await prisma.suppliers.create({ data: { id: SUPPLIER, company_id: COMPANY, name: 'Proveedor SA', cuit: BigInt(30744444442), vat_condition_id: 1 } });
    await prisma.treasury_accounts.createMany({
      data: [
        { id: BANK, company_id: COMPANY, kind: 'BANK', name: 'Banco conc', bank_name: 'Banco Galicia' },
        { id: CASH, company_id: COMPANY, kind: 'CASH', name: 'Caja conc' },
        { id: FOREIGN_BANK, company_id: OTHER_COMPANY, kind: 'BANK', name: 'Banco ajeno' },
      ],
    });
    await prisma.treasury_concepts.createMany({
      data: [
        { id: FEES, company_id: COMPANY, name: 'Gastos bancarios', direction: 'OUT' },
        { id: INCOME, company_id: COMPANY, name: 'Otros ingresos', direction: 'IN' },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    await cleanup();
  }, 60_000);

  beforeEach(() => {
    state.denied.clear();
  });

  it('importar: guarda el perfil, crea las líneas y concilia sola la única coincidencia; reimportar saltea las repetidas', async () => {
    const prisma = await db();
    const movement = await manual(-10, 'IN', '5000', 'Cobro');
    const result = expectOk(await importRows([row(-9, 'Transferencia recibida', '5.000,00', 'T1'), row(-8, 'Comisión mantenimiento', '-1.200,00'), ['', '', '', '']]));
    expect(result).toMatchObject({ imported: 2, skipped: 0, matched: 1 });
    expect(await lineByDescription('Transferencia recibida')).toMatchObject({ status: 'MATCHED', movement_id: movement });
    expect(await prisma.bank_statement_profiles.count({ where: { account_id: BANK } })).toBe(1);

    const again = expectOk(await importRows([row(-9, 'Transferencia recibida', '5.000,00', 'T1'), row(-8, 'Comisión mantenimiento', '-1.200,00'), row(-7, 'Nueva', '-10,00')]));
    expect(again).toMatchObject({ imported: 1, skipped: 2 });
  });

  it('un archivo con una fila inválida no importa nada y dice cuál', async () => {
    const prisma = await db();
    const before = await prisma.bank_statement_lines.count({ where: { company_id: COMPANY } });
    const error = expectFail(await importRows([row(-1, 'Ok', '10,00'), ['31/02/2026', 'Mala', '', '10,00']]));
    expect(error).toBe('Fila 3: fecha inválida («31/02/2026»)');
    expect(await prisma.bank_statement_lines.count({ where: { company_id: COMPANY } })).toBe(before);
  });

  it('solo cuentas bancarias de la empresa', async () => {
    const actions = await import('./reconciliation.server');
    expect(expectFail(await actions.importStatement({ accountId: CASH, fileName: 'x.csv', profile: PROFILE, rows: [header, row(0, 'X', '1')] }))).toBe('Elegí una cuenta bancaria');
    expect(expectFail(await actions.importStatement({ accountId: FOREIGN_BANK, fileName: 'x.csv', profile: PROFILE, rows: [header, row(0, 'X', '1')] }))).toBe('La cuenta no existe');
  });

  it('dos movimientos candidatos no se concilian solos; a mano sí', async () => {
    const actions = await import('./reconciliation.server');
    const a = await manual(-6, 'OUT', '777');
    await manual(-5, 'OUT', '777');
    expectOk(await importRows([row(-5, 'Débito ambiguo', '-777,00')]));
    const line = await lineByDescription('Débito ambiguo');
    expect(line.status).toBe('PENDING');
    const data = (await actions.getReconciliationData(BANK))!;
    expect(data.suggestions[line.id]?.movements).toHaveLength(2);
    expectOk(await actions.matchLine({ lineId: line.id, movementId: a }));
    expect(await lineByDescription('Débito ambiguo')).toMatchObject({ status: 'MATCHED', movement_id: a });
  });

  it('a mano: el importe tiene que ser el mismo y el movimiento no puede estar conciliado', async () => {
    const actions = await import('./reconciliation.server');
    const other = await manual(-4, 'OUT', '55');
    expectOk(await importRows([row(-4, 'Importe distinto', '-56,00')]));
    const wrong = await lineByDescription('Importe distinto');
    expect(expectFail(await actions.matchLine({ lineId: wrong.id, movementId: other }))).toBe('El movimiento no tiene el importe de la línea');
    expectOk(await importRows([row(-4, 'Otra línea', '-55,00')]));
    const second = await lineByDescription('Otra línea');
    // Se concilió sola al importar (único candidato).
    expect(second).toMatchObject({ status: 'MATCHED', movement_id: other });
    expect(expectFail(await actions.matchLine({ lineId: wrong.id, movementId: other }))).toBe('El movimiento ya está conciliado con otra línea');
  });

  it('registrar: crea el movimiento manual con concepto en la fecha de la línea, ya conciliado', async () => {
    const actions = await import('./reconciliation.server');
    const prisma = await db();
    const line = await lineByDescription('Comisión mantenimiento');
    expect(expectFail(await actions.registerLine({ lineId: line.id, conceptId: INCOME, description: '' }))).toBe('El concepto «Otros ingresos» es solo de ingresos');
    expectOk(await actions.registerLine({ lineId: line.id, conceptId: FEES, description: '' }));
    const after = await lineByDescription('Comisión mantenimiento');
    expect(after.status).toBe('CREATED');
    const movement = await prisma.treasury_movements.findUniqueOrThrow({ where: { id: after.movement_id! }, select: { kind: true, amount: true, date: true, concept_id: true, description: true } });
    expect(movement).toMatchObject({ kind: 'MANUAL', concept_id: FEES, description: 'Comisión mantenimiento' });
    expect(movement.amount.toString()).toBe('-1200');
    expect(movement.date.toISOString().slice(0, 10)).toBe(day(-8));
  });

  it('un movimiento conciliado no se anula ni se edita; desconciliado sí', async () => {
    const actions = await import('./reconciliation.server');
    const movements = await import('./movements.server');
    const line = await lineByDescription('Transferencia recibida');
    const movementId = line.movement_id!;
    expect(expectFail(await movements.cancelManualMovement(movementId, 'x'))).toBe(`El movimiento del ${dmy(day(-10)).slice(0, 5)} por $ 5.000,00 está conciliado con el extracto: desconcilialo primero`);
    expect(
      expectFail(await movements.updateManualMovement(movementId, { accountId: BANK, date: day(-10), direction: 'IN', amount: '5001', conceptId: INCOME, description: '' }))
    ).toMatch(/está conciliado con el extracto/);
    expectOk(await actions.unmatchLine(line.id, 'Me equivoqué'));
    expect((await lineByDescription('Transferencia recibida')).status).toBe('PENDING');
    expectOk(await movements.cancelManualMovement(movementId, 'Ahora sí'));
  });

  it('desconciliar una registrada anula el movimiento creado', async () => {
    const actions = await import('./reconciliation.server');
    const prisma = await db();
    const line = await lineByDescription('Comisión mantenimiento');
    expectOk(await actions.unmatchLine(line.id, 'Duplicada'));
    const movement = await prisma.treasury_movements.findUniqueOrThrow({ where: { id: line.movement_id! }, select: { cancelled_at: true, cancel_reason: true } });
    expect(movement.cancelled_at).not.toBeNull();
    expect(movement.cancel_reason).toBe('Desconciliado del extracto: Duplicada');
    expect((await lineByDescription('Comisión mantenimiento')).status).toBe('PENDING');
  });

  it('ignorar y volver a pendiente', async () => {
    const actions = await import('./reconciliation.server');
    const line = await lineByDescription('Nueva');
    expectOk(await actions.ignoreLine({ lineId: line.id, reason: 'No es nuestra' }));
    expect((await lineByDescription('Nueva')).status).toBe('IGNORED');
    expectOk(await actions.unmatchLine(line.id, 'Sí era'));
    expect((await lineByDescription('Nueva')).status).toBe('PENDING');
  });

  it('débito de un cheque propio desde su línea: confirma el débito con la fecha de la línea y concilia', async () => {
    const actions = await import('./reconciliation.server');
    const prisma = await db();
    // Cheque propio emitido (como lo deja registerPayment): orden pagada + medio + cheque.
    const order = await prisma.payment_orders.create({
      data: {
        company_id: COMPANY, number: 'OP-C00001', supplier_id: SUPPLIER, status: 'PAID', planned_on: new Date(`${day(-12)}T00:00:00.000Z`), paid_on: new Date(`${day(-12)}T00:00:00.000Z`), paid_by: USER,
        invoices_total: 0, credits_total: 0, advance_total: 4321, withholdings_total: 0, net_total: 4321, created_by: USER,
        payments: { create: [{ method: 'CHECK', treasury_account_id: BANK, amount: 4321, check_number: '9001', check_due_on: new Date(`${day(-3)}T00:00:00.000Z`) }] },
      },
      select: { id: true, payments: { select: { id: true } } },
    });
    const check = await prisma.own_checks.create({
      data: {
        company_id: COMPANY, kind: 'ECHECK', account_id: BANK, number: '9001', amount: 4321, issue_date: new Date(`${day(-12)}T00:00:00.000Z`), payment_date: new Date(`${day(-3)}T00:00:00.000Z`),
        supplier_id: SUPPLIER, payment_order_payment_id: order.payments[0]!.id, created_by: USER,
      },
      select: { id: true },
    });
    expectOk(await importRows([row(-4, 'Cheque 9001 anticipado', '-4.321,00'), row(-2, 'Cheque 9001', '-4.321,00')]));
    const early = await lineByDescription('Cheque 9001 anticipado');
    const data = (await actions.getReconciliationData(BANK))!;
    expect(data.suggestions[early.id]?.checks.map((c) => c.id)).toEqual([check.id]);
    expect(expectFail(await actions.debitCheckFromLine({ lineId: early.id, checkId: check.id }))).toBe(
      `Cheque Nº 9001: su fecha de pago es el ${dmy(day(-3))}; el débito no puede ser anterior`
    );
    const line = await lineByDescription('Cheque 9001');
    expectOk(await actions.debitCheckFromLine({ lineId: line.id, checkId: check.id }));
    const own = await prisma.own_checks.findUniqueOrThrow({ where: { id: check.id }, select: { status: true, debited_on: true } });
    expect(own.status).toBe('DEBITED');
    expect(own.debited_on?.toISOString().slice(0, 10)).toBe(day(-2));
    const matched = await lineByDescription('Cheque 9001');
    const movement = await prisma.treasury_movements.findUniqueOrThrow({ where: { id: matched.movement_id! }, select: { kind: true, own_check_id: true } });
    expect(movement).toEqual({ kind: 'OWN_CHECK', own_check_id: check.id });
    // Conciliado: deshacer el débito desde el cheque queda trabado.
    const own2 = await import('./own-checks.server');
    expect(expectFail(await own2.undoOwnCheckDebit(check.id, 'x'))).toMatch(/está conciliado con el extracto/);
  });

  it('dos conciliaciones simultáneas del mismo movimiento: gana una sola', async () => {
    const actions = await import('./reconciliation.server');
    const target = await manual(-1, 'OUT', '31,41');
    await manual(-1, 'OUT', '31,41');
    expectOk(await importRows([row(-1, 'Carrera A', '-31,41'), row(-1, 'Carrera B', '-31,41')]));
    const a = await lineByDescription('Carrera A');
    const b = await lineByDescription('Carrera B');
    const results = await Promise.all([actions.matchLine({ lineId: a.id, movementId: target }), actions.matchLine({ lineId: b.id, movementId: target })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it('borrar una importación: solo sin líneas conciliadas', async () => {
    const actions = await import('./reconciliation.server');
    const prisma = await db();
    const free = expectOk(await importRows([row(-3, 'Suelta para borrar', '-1,00')], 'borrable.csv'));
    expectOk(await actions.deleteStatement(free.statementId!));
    expect(await prisma.bank_statement_lines.count({ where: { description: 'Suelta para borrar' } })).toBe(0);
    const used = await prisma.bank_statement_lines.findFirstOrThrow({ where: { company_id: COMPANY, status: 'MATCHED' }, select: { statement_id: true } });
    expect(expectFail(await actions.deleteStatement(used.statement_id))).toMatch(/^La importación tiene \d+ líneas? conciliadas?: desconcilialas primero$/);
  });

  it('una transferencia conciliada no se anula hasta desconciliar', async () => {
    const actions = await import('./reconciliation.server');
    const transfers = await import('./transfers.server');
    const transfer = expectOk(await transfers.createTransfer({ fromAccountId: BANK, toAccountId: CASH, date: day(-1), amount: '2718', notes: '' }));
    expectOk(await importRows([row(-1, 'Extracción caja', '-2.718,00')]));
    const line = await lineByDescription('Extracción caja');
    expect(line.status).toBe('MATCHED');
    expect(expectFail(await transfers.cancelTransfer(transfer.id, 'x'))).toMatch(/está conciliado con el extracto: desconcilialo primero$/);
    expectOk(await actions.unmatchLine(line.id, 'Revisión'));
    expectOk(await transfers.cancelTransfer(transfer.id, 'Ahora sí'));
  });

  it('conciliar y anular a la vez: nunca queda una línea conciliada con un movimiento anulado', async () => {
    const actions = await import('./reconciliation.server');
    const movements = await import('./movements.server');
    const prisma = await db();
    for (let i = 0; i < 5; i += 1) {
      const amount = `${600 + i},${10 + i}`;
      const target = await manual(-2, 'OUT', amount.replace(',', '.'));
      await manual(-2, 'OUT', amount.replace(',', '.'));
      expectOk(await importRows([row(-2, `Carrera anular ${i}`, `-${amount}`)]));
      const line = await lineByDescription(`Carrera anular ${i}`);
      await Promise.all([actions.matchLine({ lineId: line.id, movementId: target }), movements.cancelManualMovement(target, 'carrera')]);
      const after = await prisma.bank_statement_lines.findUniqueOrThrow({ where: { id: line.id }, select: { status: true, movement: { select: { cancelled_at: true } } } });
      expect(after.status === 'MATCHED' && after.movement?.cancelled_at !== null).toBe(false);
    }
  });

  it('conciliar y editar a la vez: el importe del movimiento conciliado sigue siendo el de la línea', async () => {
    const actions = await import('./reconciliation.server');
    const movements = await import('./movements.server');
    const prisma = await db();
    for (let i = 0; i < 5; i += 1) {
      const amount = `${700 + i}`;
      const target = await manual(-2, 'OUT', amount);
      await manual(-2, 'OUT', amount);
      expectOk(await importRows([row(-2, `Carrera editar ${i}`, `-${amount},00`)]));
      const line = await lineByDescription(`Carrera editar ${i}`);
      await Promise.all([
        actions.matchLine({ lineId: line.id, movementId: target }),
        movements.updateManualMovement(target, { accountId: BANK, date: day(-2), direction: 'OUT', amount: `${amount}.5`, conceptId: FEES, description: '' }),
      ]);
      const after = await prisma.bank_statement_lines.findUniqueOrThrow({ where: { id: line.id }, select: { status: true, amount: true, movement: { select: { amount: true } } } });
      if (after.status === 'MATCHED') expect(after.movement?.amount.toString()).toBe(after.amount.toString());
    }
  });

  it('una cuenta con extractos importados no se borra (se desactiva)', async () => {
    const prisma = await db();
    const accounts = await import('./accounts.server');
    const actions = await import('./reconciliation.server');
    const fresh = expectOk(await accounts.createTreasuryAccount({ kind: 'BANK', name: 'Banco con extracto', bankName: '', accountNumber: '', cbu: '', openingDate: '', openingAmount: '' })).id;
    expectOk(await actions.importStatement({ accountId: fresh, fileName: 'x.csv', profile: PROFILE, rows: [header, row(0, 'Algo', '1,00')] }));
    expect(expectFail(await accounts.deleteTreasuryAccount(fresh))).toBe('La cuenta tiene movimientos: desactivala');
    expect(await prisma.treasury_accounts.count({ where: { id: fresh } })).toBe(1);
  });

  it('el resumen suma todas las pendientes aunque la lista se recorte, y "Ver todas" empieza por las más nuevas', async () => {
    const actions = await import('./reconciliation.server');
    const prisma = await db();
    const pending = await prisma.bank_statement_lines.aggregate({ where: { account_id: BANK, status: 'PENDING', amount: { lt: 0 } }, _sum: { amount: true } });
    const data = (await actions.getReconciliationData(BANK))!;
    expect(data.summary.pendingDebits).toBe(pending._sum.amount!.toFixed(2));
    expect(data.totalLines).toBeGreaterThanOrEqual(data.lines.length);
    const all = (await actions.getReconciliationData(BANK, { showAll: true }))!;
    expect(all.lines[0]!.date >= all.lines[all.lines.length - 1]!.date).toBe(true);
  });

  it('el filtro "Conciliado" de Movimientos trae solo los vigentes conciliados (y uno hostil se ignora)', async () => {
    const movements = await import('../Movements/MovementsList/actions.server');
    const prisma = await db();
    const reconciled = await prisma.treasury_movements.count({ where: { company_id: COMPANY, cancelled_at: null, statement_line: { isNot: null } } });
    expect(reconciled).toBeGreaterThan(0);
    expect((await movements.getTreasuryMovementsPaginated({ state: 'RECONCILED', pageSize: '100' })).total).toBe(reconciled);
    const all = (await movements.getTreasuryMovementsPaginated({ pageSize: '100' })).total;
    expect((await movements.getTreasuryMovementsPaginated({ state: '__proto__', pageSize: '100' })).total).toBe(all);
  });

  it('sin permiso de update no se concilia', async () => {
    const actions = await import('./reconciliation.server');
    state.denied.add('tesoreria:conciliacion:update');
    const line = await lineByDescription('Nueva');
    expect(expectFail(await actions.ignoreLine({ lineId: line.id, reason: 'x' }))).toBe('No tenés permiso para realizar esta acción');
  });
});
