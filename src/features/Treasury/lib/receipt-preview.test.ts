import { describe, expect, it } from 'vitest';
import type { ReceiptFormValues } from '../schemas/receipts';
import { previewReceipt } from './receipt-preview';

const values = (over: Partial<ReceiptFormValues> = {}): ReceiptFormValues => ({
  customerId: 'c',
  date: '2026-10-10',
  notes: '',
  rates: [{ currency: 'USD', rate: '1250' }],
  invoices: [
    { invoiceId: 'ars', amount: '1.000,00' },
    { invoiceId: 'usd', amount: '100' },
  ],
  advancesApplied: [{ sourceLineId: 'adv', amount: '50' }],
  advance: { amount: '25', description: '' },
  withholdings: [{ id: '', tax: 'GANANCIAS', jurisdiction: '', certificateNumber: '1', certificateDate: '2026-10-10', amount: '10' }],
  payments: [{ method: 'TRANSFER', accountId: 'a', amount: '125965', reference: '', checkNumber: '', checkBank: '', checkDueOn: '' }],
  ...over,
});

const invoices = { ars: { currency: 'ARS', exchangeRate: '1.000000' }, usd: { currency: 'USD', exchangeRate: '1000.000000' } };

describe('previewReceipt', () => {
  it('convierte cada comprobante con la cotización de su moneda y calcula el cierre', () => {
    const preview = previewReceipt(values(), invoices);
    expect(preview.lines).toEqual({ ars: { ars: '1000.00', fx: '0.00' }, usd: { ars: '125000.00', fx: '25000.00' } });
    expect(preview.totals).toMatchObject({ invoices: '126000.00', advance: '25.00', advancesApplied: '50.00', withholdings: '10.00', received: '125965.00', fxDifference: '25000.00' });
    expect([preview.charged, preview.delivered, preview.gap]).toEqual(['126025.00', '126025.00', '0.00']);
    expect(preview.closing).toBe('Cierra');
  });

  it('sin cotización la línea en moneda extranjera no suma y se avisa', () => {
    const preview = previewReceipt(values({ rates: [] }), invoices);
    expect(preview.lines.usd).toBeUndefined();
    expect(preview.missingRates).toEqual(['USD']);
  });

  it('informa lo que falta o sobra', () => {
    expect(previewReceipt(values({ payments: [] }), invoices).closing).toBe('Faltan $ 125.965,00');
    expect(previewReceipt(values({ advance: { amount: '', description: '' }, payments: [] , invoices: [], withholdings: [] }), invoices).closing).toBe('Sobran $ 50,00');
  });

  it('ignora importes que todavía no son números', () => {
    const preview = previewReceipt(values({ invoices: [{ invoiceId: 'ars', amount: 'abc' }] }), invoices);
    expect(preview.totals.invoices).toBe('0.00');
  });
});
