import { describe, expect, it } from 'vitest';
import { checkbookSchema, debitOwnChecksSchema, ownCheckReasonSchema, rejectOwnCheckSchema, voidCheckNumberSchema } from './own-checks';

const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';

const issues = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? [] : (result.error?.issues ?? []).map((i) => i.message);

describe('checkbookSchema', () => {
  it('acepta un rango válido', () => {
    expect(issues(checkbookSchema.safeParse({ accountId: ID1, firstNumber: '00012001', lastNumber: '12050' }))).toEqual([]);
  });
  it('rechaza un hasta menor que el desde', () => {
    expect(issues(checkbookSchema.safeParse({ accountId: ID1, firstNumber: '20', lastNumber: '10' }))).toContain('El hasta no puede ser menor que el desde');
  });
  it('rechaza más de 500 números', () => {
    expect(issues(checkbookSchema.safeParse({ accountId: ID1, firstNumber: '1', lastNumber: '501' }))).toContain('Una chequera tiene hasta 500 números');
  });
  it('rechaza números que no son enteros', () => {
    expect(issues(checkbookSchema.safeParse({ accountId: ID1, firstNumber: 'abc', lastNumber: '10' }))).toContain('Número inválido');
  });
  it('pide la cuenta', () => {
    expect(issues(checkbookSchema.safeParse({ accountId: '', firstNumber: '1', lastNumber: '10' }))).toContain('Elegí la cuenta bancaria');
  });
});

describe('voidCheckNumberSchema', () => {
  it('pide número y motivo', () => {
    const result = issues(voidCheckNumberSchema.safeParse({ checkbookId: ID1, number: '', reason: '' }));
    expect(result).toContain('Número inválido');
    expect(result).toContain('Indicá el motivo');
  });
});

describe('debitOwnChecksSchema', () => {
  it('acepta varios cheques con una fecha', () => {
    expect(issues(debitOwnChecksSchema.safeParse({ checkIds: [ID1, ID2], date: '2026-10-11' }))).toEqual([]);
  });
  it('rechaza un cheque repetido', () => {
    expect(issues(debitOwnChecksSchema.safeParse({ checkIds: [ID1, ID1], date: '2026-10-11' }))).toContain('El cheque está dos veces');
  });
  it('pide al menos un cheque', () => {
    expect(issues(debitOwnChecksSchema.safeParse({ checkIds: [], date: '2026-10-11' }))).toContain('Elegí al menos un cheque');
  });
});

describe('rejectOwnCheckSchema y motivo', () => {
  it('el rechazo pide fecha y motivo', () => {
    const result = issues(rejectOwnCheckSchema.safeParse({ date: 'x', reason: ' ' }));
    expect(result).toContain('Fecha inválida');
    expect(result).toContain('Indicá el motivo');
  });
  it('el motivo tiene hasta 300 caracteres', () => {
    expect(issues(ownCheckReasonSchema.safeParse('a'.repeat(301)))).toContain('Máximo 300 caracteres');
  });
});
