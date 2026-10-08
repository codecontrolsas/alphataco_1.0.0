import { describe, expect, it } from 'vitest';
import { classifyBatch, dateColumnToYmd } from './batch-expiry';

describe('classifyBatch', () => {
  const today = '2026-10-06';

  it('sin vencimiento siempre esta vigente', () => {
    expect(classifyBatch(null, today)).toBe('OK');
  });

  it('vencido desde ayer', () => {
    expect(classifyBatch('2026-10-05', today)).toBe('EXPIRED');
  });

  it('el que vence hoy todavia no esta vencido', () => {
    expect(classifyBatch('2026-10-06', today)).toBe('EXPIRING');
  });

  it('por vencer hasta el dia 30 inclusive', () => {
    expect(classifyBatch('2026-11-05', today)).toBe('EXPIRING');
    expect(classifyBatch('2026-11-06', today)).toBe('OK');
  });

  it('cruza el cambio de año sin corrimientos', () => {
    expect(classifyBatch('2027-01-01', '2026-12-31')).toBe('EXPIRING');
    expect(classifyBatch('2026-12-31', '2027-01-01')).toBe('EXPIRED');
  });
});

describe('dateColumnToYmd', () => {
  it('toma el dia de la medianoche UTC que entrega Prisma', () => {
    expect(dateColumnToYmd(new Date('2026-12-31T00:00:00.000Z'))).toBe('2026-12-31');
  });
});
