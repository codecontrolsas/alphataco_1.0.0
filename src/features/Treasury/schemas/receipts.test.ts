import { describe, expect, it } from 'vitest';
import { receiptFormSchema, type ReceiptFormValues } from './receipts';

const CUSTOMER = '11111111-1111-4111-8111-111111111111';
const INVOICE = '22222222-2222-4222-8222-222222222222';
const ACCOUNT = '33333333-3333-4333-8333-333333333333';

const base = (over: Partial<ReceiptFormValues> = {}): ReceiptFormValues => ({
  customerId: CUSTOMER,
  date: '2026-10-10',
  notes: '',
  rates: [],
  invoices: [{ invoiceId: INVOICE, amount: '1.000,00' }],
  advancesApplied: [],
  advance: { amount: '', description: '' },
  withholdings: [],
  payments: [{ method: 'TRANSFER', accountId: ACCOUNT, amount: '1000', reference: '', checkNumber: '', checkBank: '', checkDueOn: '' }],
  ...over,
});

const messages = (values: ReceiptFormValues) => {
  const result = receiptFormSchema.safeParse(values);
  return result.success ? [] : result.error.issues.map((i) => i.message);
};

describe('receiptFormSchema', () => {
  it('acepta un recibo completo', () => {
    expect(messages(base())).toEqual([]);
  });

  it('IIBB exige jurisdicción y solo IIBB la admite', () => {
    const w = { id: '', tax: 'IIBB' as const, jurisdiction: '', certificateNumber: '0001', certificateDate: '2026-10-01', amount: '10' };
    expect(messages(base({ withholdings: [w] }))).toContain('Indicá la jurisdicción');
    expect(messages(base({ withholdings: [{ ...w, tax: 'GANANCIAS', jurisdiction: 'Neuquén' }] }))).toContain('Solo IIBB lleva jurisdicción');
  });

  it('un cheque exige número y vencimiento', () => {
    const payment = { method: 'ECHECK' as const, accountId: ACCOUNT, amount: '10', reference: '', checkNumber: '', checkBank: '', checkDueOn: '' };
    const issues = messages(base({ payments: [payment] }));
    expect(issues).toContain('Indicá el número del cheque');
    expect(issues).toContain('Indicá el vencimiento del cheque');
  });

  it('un cheque exige banco, emisión, librador con CUIT válido y fecha de pago no anterior a la emisión', () => {
    const payment = {
      method: 'CHECK' as const,
      accountId: ACCOUNT,
      amount: '10',
      reference: '',
      checkNumber: '123',
      checkBank: '',
      checkDueOn: '2026-10-01',
      checkIssueDate: '2026-10-05',
      drawerName: '',
      drawerCuit: '30712345678',
    };
    const issues = messages(base({ payments: [payment] }));
    expect(issues).toEqual(
      expect.arrayContaining(['Indicá el banco', 'Indicá el librador', 'CUIT inválido', 'La fecha de pago no puede ser anterior a la de emisión'])
    );
    const ok = { ...payment, checkBank: 'Galicia', drawerName: 'Cliente SA', drawerCuit: '30712345671', checkDueOn: '2026-10-20' };
    expect(messages(base({ payments: [ok] }))).toEqual([]);
  });

  it('una transferencia no pide datos de cheque', () => {
    expect(messages(base())).toEqual([]);
  });

  it('las deudas de cheques rechazados llevan importe y no se repiten', () => {
    const CHECK = '44444444-4444-4444-8444-444444444444';
    const issues = messages(
      base({
        rejectedChecks: [
          { checkId: CHECK, amount: '0' },
          { checkId: CHECK, amount: '5' },
        ],
      })
    );
    expect(issues).toEqual(expect.arrayContaining(['Importe inválido', 'El cheque rechazado está repetido']));
  });

  it('importes positivos, cuenta elegida y cotización válida', () => {
    const issues = messages(
      base({
        invoices: [{ invoiceId: INVOICE, amount: '0' }],
        payments: [{ method: 'CASH', accountId: '', amount: 'abc', reference: '', checkNumber: '', checkBank: '', checkDueOn: '' }],
        rates: [{ currency: 'USD', rate: '0' }],
      })
    );
    expect(issues).toEqual(expect.arrayContaining(['Importe inválido', 'Elegí la cuenta o caja', 'Cotización inválida']));
  });

  it('no repite comprobantes ni cotizaciones de la misma moneda', () => {
    const issues = messages(
      base({
        invoices: [
          { invoiceId: INVOICE, amount: '1' },
          { invoiceId: INVOICE, amount: '2' },
        ],
        rates: [
          { currency: 'USD', rate: '1000' },
          { currency: 'USD', rate: '1001' },
        ],
      })
    );
    expect(issues).toEqual(expect.arrayContaining(['El comprobante está repetido', 'La cotización del USD está repetida']));
  });

  it('el cobro a cuenta vacío es "sin cobro a cuenta"; con importe debe ser válido', () => {
    expect(messages(base({ advance: { amount: '', description: '' } }))).toEqual([]);
    expect(messages(base({ advance: { amount: '-5', description: '' } }))).toContain('Importe inválido');
  });
});
