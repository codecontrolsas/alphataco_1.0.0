import { describe, expect, it } from 'vitest';
import { ignoreLineSchema, importStatementSchema, statementProfileSchema } from './reconciliation';

const issues = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? [] : (result.error?.issues ?? []).map((i) => i.message);

const profile = {
  headerRow: 1,
  dateColumn: 'a',
  descriptionColumn: 'B',
  referenceColumn: '',
  amountMode: 'SINGLE' as const,
  amountColumn: 'D',
  debitColumn: '',
  creditColumn: '',
  dateFormat: 'DD/MM/YYYY' as const,
  decimalSeparator: ',' as const,
};

describe('statementProfileSchema', () => {
  it('acepta columnas en minúscula y las pasa a mayúscula', () => {
    const parsed = statementProfileSchema.parse(profile);
    expect(parsed.dateColumn).toBe('A');
  });
  it('con una columna de importe la pide', () => {
    expect(issues(statementProfileSchema.safeParse({ ...profile, amountColumn: '' }))).toContain('Indicá la columna del importe');
  });
  it('con débito y crédito separados pide las dos', () => {
    const result = issues(statementProfileSchema.safeParse({ ...profile, amountMode: 'SPLIT', amountColumn: '' }));
    expect(result).toContain('Indicá la columna de débitos');
    expect(result).toContain('Indicá la columna de créditos');
  });
  it('rechaza una columna que no es una letra', () => {
    expect(issues(statementProfileSchema.safeParse({ ...profile, dateColumn: '1' }))).toContain('Columna inválida (A, B, C…)');
  });
});

describe('importStatementSchema', () => {
  it('pide al menos una fila y una cuenta', () => {
    const result = issues(importStatementSchema.safeParse({ accountId: 'x', fileName: 'a.csv', profile, rows: [] }));
    expect(result).toContain('Elegí la cuenta bancaria');
    expect(result).toContain('El archivo no tiene filas');
  });
});

describe('ignoreLineSchema', () => {
  it('pide motivo', () => {
    expect(issues(ignoreLineSchema.safeParse({ lineId: '11111111-1111-4111-8111-111111111111', reason: ' ' }))).toContain('Indicá el motivo');
  });
});
