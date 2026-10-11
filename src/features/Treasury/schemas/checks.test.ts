import { describe, expect, it } from 'vitest';
import { checkDataSchema, depositSchema, discountSchema, rejectionSchema } from './checks';

const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';

const issues = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? [] : (result.error?.issues ?? []).map((i) => i.message);

const check = {
  kind: 'PHYSICAL' as const,
  number: '123',
  bank: 'Galicia',
  drawerName: 'Cliente SA',
  drawerCuit: '30712345671',
  issueDate: '2026-10-01',
  paymentDate: '2026-10-15',
  amount: '1.000,00',
};

describe('checkDataSchema', () => {
  it('acepta un cheque completo', () => {
    expect(issues(checkDataSchema.safeParse(check))).toEqual([]);
  });
  it('rechaza un CUIT con el dígito verificador mal', () => {
    expect(issues(checkDataSchema.safeParse({ ...check, drawerCuit: '30712345678' }))).toContain('CUIT inválido');
  });
  it('rechaza una fecha de pago anterior a la emisión', () => {
    expect(issues(checkDataSchema.safeParse({ ...check, paymentDate: '2026-09-30' }))).toContain(
      'La fecha de pago no puede ser anterior a la de emisión'
    );
  });
});

describe('depositSchema', () => {
  it('no repite cheques', () => {
    const values = { bankAccountId: ID1, date: '2026-10-11', slipNumber: '', items: [{ checkId: ID2, creditedOn: '2026-10-11' }, { checkId: ID2, creditedOn: '2026-10-12' }] };
    expect(issues(depositSchema.safeParse(values))).toContain('El cheque está dos veces');
  });
  it('pide al menos un cheque', () => {
    expect(issues(depositSchema.safeParse({ bankAccountId: ID1, date: '2026-10-11', slipNumber: '', items: [] }))).toContain('Elegí al menos un cheque');
  });
});

describe('discountSchema', () => {
  it('intereses y comisión no pueden ser negativos', () => {
    const values = { bankAccountId: ID1, date: '2026-10-11', interest: '-1', fee: '0', reference: '', checkIds: [ID2] };
    expect(issues(discountSchema.safeParse(values))).toContain('Importe inválido');
  });
  it('acepta intereses y comisión en 0', () => {
    const values = { bankAccountId: ID1, date: '2026-10-11', interest: '0', fee: '0', reference: '', checkIds: [ID2] };
    expect(issues(discountSchema.safeParse(values))).toEqual([]);
  });
});

describe('rejectionSchema', () => {
  it('pide el motivo', () => {
    expect(issues(rejectionSchema.safeParse({ checkId: ID1, date: '2026-10-11', reason: ' ', returnedBy: 'BANK' }))).toContain('Indicá el motivo');
  });
});
