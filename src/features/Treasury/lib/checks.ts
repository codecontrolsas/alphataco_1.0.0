import 'server-only';

import { AMOUNT_SCALE, formatScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';
import { normalizeCuit } from '@/features/Empresa/General/lib/company-form';
import { Prisma } from '@/generated/prisma/client';
import { normalizeBank } from './check-number-format';
import { nextCheckStatus, transitionError, type CheckAction, type CheckStatus } from './check-transitions';
import { dateOnly } from './movements';
import { TreasuryError } from './treasury-errors';

/**
 * Cheques de terceros (spec Tesorería etapa 3a §3): ÚNICA escritura de `third_party_checks.status`
 * y de su historial (`third_party_check_events`). Las operaciones (recibo, carga inicial,
 * depósito, endoso, descuento, rechazo y sus anulaciones) bloquean los cheques con `lockChecks`,
 * validan la transición y la aplican con `moveCheck`, siempre dentro de su transacción.
 */

type ChecksTx = Pick<Prisma.TransactionClient, '$queryRaw' | 'third_party_checks' | 'third_party_check_events'>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALIVE_KEY = 'third_party_checks_alive_key';

export type LockedCheck = {
  id: string;
  companyId: string;
  number: string;
  bank: string;
  amount: string;
  status: CheckStatus;
  portfolioId: string;
  customerId: string;
  supplierId: string | null;
  bankAccountId: string | null;
  creditedOn: string | null;
  paymentDate: string;
  rejectedFrom: CheckStatus | null;
  drawerName: string;
  receiptPaymentId: string | null;
  openingOperationId: string | null;
  /** Día en que entró a la cartera (recibo o carga inicial): ninguna salida puede ser anterior. */
  enteredOn: string;
};

type LockedRow = {
  id: string;
  company_id: string;
  number: string;
  bank: string;
  amount: string;
  status: CheckStatus;
  portfolio_id: string;
  customer_id: string;
  supplier_id: string | null;
  bank_account_id: string | null;
  credited_on: string | null;
  payment_date: string;
  rejected_from: CheckStatus | null;
  drawer_name: string;
  receipt_payment_id: string | null;
  opening_operation_id: string | null;
  entered_on: string;
};

/** Toma las filas de los cheques con `FOR UPDATE`, en orden de id. Si falta alguno: "El cheque no existe". */
export async function lockChecks(tx: Pick<Prisma.TransactionClient, '$queryRaw'>, companyId: string, ids: readonly string[]): Promise<Map<string, LockedCheck>> {
  const unique = [...new Set(ids)];
  const result = new Map<string, LockedCheck>();
  if (unique.length === 0) return result;
  if (unique.some((id) => !UUID_RE.test(id))) throw new TreasuryError('El cheque no existe');
  const rows = await tx.$queryRaw<LockedRow[]>`
    SELECT id, company_id, number, bank, amount::text AS amount, status::text AS status, portfolio_id, customer_id, supplier_id,
           bank_account_id, credited_on::text AS credited_on, payment_date::text AS payment_date, rejected_from::text AS rejected_from,
           drawer_name, receipt_payment_id, opening_operation_id,
           (SELECT MIN(e.date) FROM third_party_check_events e WHERE e.check_id = c.id AND e.from_status IS NULL)::text AS entered_on
    FROM third_party_checks c
    WHERE id = ANY(${unique}::uuid[]) AND company_id = ${companyId}::uuid
    ORDER BY id
    FOR UPDATE OF c
  `;
  if (rows.length !== unique.length) throw new TreasuryError('El cheque no existe');
  for (const r of rows) {
    result.set(r.id, {
      id: r.id,
      companyId: r.company_id,
      number: r.number,
      bank: r.bank,
      amount: r.amount,
      status: r.status,
      portfolioId: r.portfolio_id,
      customerId: r.customer_id,
      supplierId: r.supplier_id,
      bankAccountId: r.bank_account_id,
      creditedOn: r.credited_on,
      paymentDate: r.payment_date,
      rejectedFrom: r.rejected_from,
      drawerName: r.drawer_name,
      receiptPaymentId: r.receipt_payment_id,
      openingOperationId: r.opening_operation_id,
      enteredOn: r.entered_on,
    });
  }
  return result;
}

/** Una salida de la cartera (depósito, descuento, endoso) no puede ser anterior al día en que el cheque entró. */
export function assertNotBeforeEntry(check: LockedCheck, date: string): void {
  if (date < check.enteredOn) {
    const [y, m, d] = check.enteredOn.split('-');
    throw new TreasuryError(`Cheque Nº ${check.number}: entró a la cartera el ${d}/${m}/${y}; la operación no puede ser anterior`);
  }
}

/** Valida la transición; si no está permitida, el mensaje nombra el cheque y su estado. */
export function assertTransition(check: LockedCheck, action: CheckAction): CheckStatus {
  const next = nextCheckStatus(check.status, action, check.rejectedFrom);
  if (!next) throw new TreasuryError(transitionError(check, action));
  return next;
}

export type CheckEventOrigin = { operationId: string } | { receiptId: string } | { paymentOrderId: string };

/**
 * Cambia el estado del cheque (con las columnas que exige el estado nuevo) y escribe el evento.
 * `set` lleva lo que depende de la operación: acreditación y banco del depósito, banco del
 * descuento, proveedor del endoso.
 */
export async function moveCheck(
  tx: ChecksTx,
  input: {
    check: LockedCheck;
    action: CheckAction;
    date: string;
    userId: string;
    origin: CheckEventOrigin;
    set?: { creditedOn?: string | null; bankAccountId?: string | null; supplierId?: string | null };
  }
): Promise<CheckStatus> {
  const { check, action } = input;
  const next = assertTransition(check, action);
  let data: Prisma.third_party_checksUncheckedUpdateInput;
  switch (action) {
    case 'DEPOSIT':
      if (!input.set?.creditedOn || !input.set.bankAccountId) throw new Error('El depósito necesita acreditación y banco');
      data = { status: next, credited_on: dateOnly(input.set.creditedOn), bank_account_id: input.set.bankAccountId };
      break;
    case 'DISCOUNT':
      if (!input.set?.bankAccountId) throw new Error('El descuento necesita banco');
      data = { status: next, bank_account_id: input.set.bankAccountId };
      break;
    case 'ENDORSE':
      if (!input.set?.supplierId) throw new Error('El endoso necesita proveedor');
      data = { status: next, supplier_id: input.set.supplierId };
      break;
    case 'REJECT':
      // Conserva banco y proveedor: dicen de dónde volvió y a quién se le debe.
      data = { status: next, rejected_from: check.status };
      break;
    case 'UNDO_REJECTION':
      data = { status: next, rejected_from: null };
      break;
    case 'UNDO_EXIT':
    case 'CANCEL_ORIGIN':
      data = { status: next, credited_on: null, bank_account_id: null, supplier_id: null, rejected_from: null };
      break;
  }
  await tx.third_party_checks.update({ where: { id: check.id }, data });
  await tx.third_party_check_events.create({
    data: {
      check_id: check.id,
      from_status: check.status,
      to_status: next,
      date: dateOnly(input.date),
      user_id: input.userId,
      ...originColumns(input.origin),
    },
  });
  return next;
}

function originColumns(origin: CheckEventOrigin) {
  if ('operationId' in origin) return { operation_id: origin.operationId };
  if ('receiptId' in origin) return { receipt_id: origin.receiptId };
  return { payment_order_id: origin.paymentOrderId };
}

export type NewCheckData = {
  kind: 'PHYSICAL' | 'ECHECK';
  number: string;
  bank: string;
  drawerName: string;
  drawerCuit: string;
  issueDate: string;
  paymentDate: string;
  amountCents: bigint;
};

/** El 23505 del índice de cheques vigentes (Prisma lo informa como P2002). */
function isAliveKeyViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const text = `${error.message} ${JSON.stringify(error.meta ?? {})}`;
  return text.includes(ALIVE_KEY) || text.includes('drawer_cuit');
}

/**
 * Alta de un cheque EN CARTERA (desde un recibo o una carga inicial) con su primer evento. El
 * banco se guarda normalizado: es parte de la clave de cheques repetidos.
 */
export async function createCheck(
  tx: ChecksTx,
  input: {
    companyId: string;
    portfolioId: string;
    customerId: string;
    userId: string;
    date: string;
    data: NewCheckData;
    origin: { receiptPaymentId: string; receiptId: string } | { openingOperationId: string };
  }
): Promise<{ id: string }> {
  const bank = normalizeBank(input.data.bank);
  const number = input.data.number.trim();
  let created: { id: string };
  try {
    created = await tx.third_party_checks.create({
      data: {
        company_id: input.companyId,
        kind: input.data.kind,
        number,
        bank,
        drawer_name: input.data.drawerName.trim(),
        drawer_cuit: normalizeCuit(input.data.drawerCuit),
        issue_date: dateOnly(input.data.issueDate),
        payment_date: dateOnly(input.data.paymentDate),
        amount: new Prisma.Decimal(formatScaled(input.data.amountCents, AMOUNT_SCALE)),
        customer_id: input.customerId,
        portfolio_id: input.portfolioId,
        receipt_payment_id: 'receiptPaymentId' in input.origin ? input.origin.receiptPaymentId : null,
        opening_operation_id: 'openingOperationId' in input.origin ? input.origin.openingOperationId : null,
        created_by: input.userId,
      },
      select: { id: true },
    });
  } catch (error) {
    if (isAliveKeyViolation(error)) throw new TreasuryError(`El cheque Nº ${number} del banco ${bank} ya está en la cartera`);
    throw error;
  }
  await tx.third_party_check_events.create({
    data: {
      check_id: created.id,
      from_status: null,
      to_status: 'IN_PORTFOLIO',
      date: dateOnly(input.date),
      user_id: input.userId,
      ...('receiptId' in input.origin ? { receipt_id: input.origin.receiptId } : { operation_id: input.origin.openingOperationId }),
    },
  });
  return created;
}

/** Cheques vigentes iguales (banco normalizado, número y CUIT): el aviso de repetidos del recibo. */
export async function findAliveDuplicates(
  db: Pick<Prisma.TransactionClient, 'third_party_checks'>,
  companyId: string,
  keys: { bank: string; number: string; drawerCuit: string }[]
): Promise<{ id: string; number: string; bank: string; status: CheckStatus }[]> {
  const valid = keys.filter((k) => k.bank.trim() && k.number.trim() && k.drawerCuit.trim());
  if (valid.length === 0) return [];
  const rows = await db.third_party_checks.findMany({
    where: {
      company_id: companyId,
      status: { not: 'CANCELLED' },
      OR: valid.map((k) => ({ bank: normalizeBank(k.bank), number: k.number.trim(), drawer_cuit: normalizeCuit(k.drawerCuit) })),
    },
    select: { id: true, number: true, bank: true, status: true },
    orderBy: { number: 'asc' },
  });
  return rows;
}
