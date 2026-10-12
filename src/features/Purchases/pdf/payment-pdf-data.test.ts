import { describe, expect, it } from 'vitest';
import { buildPaymentPdfData, type PaymentPdfSource } from './payment-pdf-data';

const source = (over: Partial<PaymentPdfSource> = {}): PaymentPdfSource => ({
  number: 'OP-000012',
  date: '2026-10-15',
  status: 'PAID',
  company: { name: 'Empresa SA', cuit: '30999999940', address: 'Calle 1', city: 'Neuquén', province: null, grossIncomeNumber: '901-1' },
  supplier: { name: 'Repuestos del Sur', cuit: '30712345678', vatConditionId: 1, street: null, city: null, province: null },
  lines: [
    { kind: 'INVOICE', label: 'Factura A 00007-00005001', amount: '1210.00' },
    { kind: 'CREDIT_NOTE', label: 'Nota de Crédito A 00007-00005002', amount: '121.00' },
  ],
  withholdings: [
    { tax: 'GANANCIAS', regimeCode: '078', regimeDescription: 'Bienes', base: '900.00', rate: '2', amount: '18.00', certificateNumber: 'GAN-000001', cancelled: false },
    { tax: 'IIBB', regimeCode: '001', regimeDescription: 'IIBB', base: '900.00', rate: '1.5', amount: '13.50', certificateNumber: null, cancelled: false },
  ],
  payments: [{ method: 'TRANSFER', account: 'Banco', amount: '1057.50', reference: 'TRF', checkNumber: null, checkBank: null, checkDueOn: null }],
  totals: { invoicesTotal: '1210.00', creditsTotal: '121.00', advanceTotal: '0.00', withholdingsTotal: '31.50', netTotal: '1057.50' },
  notes: null,
  ...over,
});

describe('PDF de la orden de pago', () => {
  it('pagada: sin marca de agua; las NC restan', () => {
    const data = buildPaymentPdfData(source());
    expect(data.watermark).toBeNull();
    expect(data.lines.map((l) => l.amount)).toEqual(['$ 1.210,00', '-$ 121,00']);
    expect(data.totals.net).toBe('$ 1.057,50');
  });

  it('cheque de tercero endosado con número, banco, librador y fecha de pago; deuda de cheque rechazado suma', () => {
    const data = buildPaymentPdfData(
      source({
        lines: [{ kind: 'REJECTED_CHECK', label: 'Cheque rechazado Nº 77 — BANCO GALICIA', amount: '500.00' }],
        payments: [
          { method: 'THIRD_PARTY_CHECK', account: 'Cartera', amount: '500.00', reference: null, checkNumber: '77', checkBank: 'BANCO GALICIA', checkDueOn: '2026-10-20', drawerName: 'Cliente SA' },
        ],
      })
    );
    expect(data.lines).toEqual([{ concept: 'Cheque rechazado Nº 77 — BANCO GALICIA', amount: '$ 500,00' }]);
    expect(data.payments[0]).toEqual({ method: 'Cheque de tercero', detail: 'Cartera · N° 77 · BANCO GALICIA · librador Cliente SA · pago 20/10/2026', amount: '$ 500,00' });
  });

  it('borrador y anulada llevan marca de agua', () => {
    expect(buildPaymentPdfData(source({ status: 'APPROVED' })).watermark).toBe('BORRADOR — NO VÁLIDA');
    expect(buildPaymentPdfData(source({ status: 'CANCELLED' })).watermark).toBe('ANULADA');
  });

  it('un certificado por retencion numerada', () => {
    const data = buildPaymentPdfData(source());
    expect(data.certificates).toHaveLength(1);
    expect(data.certificates[0]).toMatchObject({
      number: 'GAN-000001',
      tax: 'Ganancias',
      regime: '078 · Bienes',
      base: '$ 900,00',
      rate: '2 %',
      amount: '$ 18,00',
      cancelled: false,
    });
    expect(data.certificates[0]!.agent.grossIncomeNumber).toBe('901-1');
  });
});
