import { describe, expect, it } from 'vitest';
import { buildReceiptPdfData, type ReceiptPdfSource } from './receipt-pdf-data';

const source = (over: Partial<ReceiptPdfSource> = {}): ReceiptPdfSource => ({
  number: 'RE-000003',
  date: '2026-10-10',
  status: 'CONFIRMED',
  company: { name: 'Empresa SA', cuit: '30712345678', address: 'Calle 1', city: 'Neuquén', province: 'Neuquén' },
  customer: { name: 'Cliente SA', cuit: '30711111118', vatConditionId: 1, street: 'Ruta 7', city: 'Añelo' },
  lines: [
    { kind: 'INVOICE', label: 'Factura A 00002-00000010', currency: 'USD', applied: '1000.00', rate: '1250.000000', ars: '1250000.00', fxDifference: '250000.00' },
    { kind: 'INVOICE', label: 'Factura A 00002-00000011', currency: 'ARS', applied: '500.00', rate: '1.000000', ars: '500.00', fxDifference: '0.00' },
    { kind: 'ADVANCE_APPLIED', label: 'RE-000001', currency: 'ARS', applied: '100.00', rate: '1.000000', ars: '100.00', fxDifference: '0.00' },
    { kind: 'ADVANCE', label: 'Excedente', currency: 'ARS', applied: '50.00', rate: '1.000000', ars: '50.00', fxDifference: '0.00' },
  ],
  withholdings: [{ tax: 'IIBB', jurisdiction: 'Neuquén', certificateNumber: 'C-1', certificateDate: '2026-10-09', amount: '20.00' }],
  payments: [{ method: 'ECHECK', account: 'Galicia', amount: '1250430.00', reference: null, checkNumber: '123', checkBank: 'Galicia', checkDueOn: '2026-11-09' }],
  totals: { invoices: '1250500.00', advance: '50.00', advancesApplied: '100.00', withholdings: '20.00', received: '1250430.00', fxDifference: '250000.00' },
  notes: null,
  ...over,
});

describe('buildReceiptPdfData', () => {
  const data = buildReceiptPdfData(source());

  it('cabecera, cliente y sin marca de agua si está confirmado', () => {
    expect(data).toMatchObject({ title: 'RECIBO', number: 'RE-000003', date: '10/10/2026', watermark: null });
    expect(data.customer).toMatchObject({ name: 'Cliente SA', cuit: '30-71111111-8', address: 'Ruta 7, Añelo' });
  });

  it('en moneda extranjera muestra el importe de origen y la cotización', () => {
    expect(data.lines[0]).toEqual({ concept: 'Factura A 00002-00000010', detail: 'USD 1.000,00 a $ 1.250,00', amount: '$ 1.250.000,00' });
    expect(data.lines[1]).toEqual({ concept: 'Factura A 00002-00000011', detail: null, amount: '$ 500,00' });
  });

  it('nombra los anticipos y los cobros a cuenta', () => {
    expect(data.lines[2]?.concept).toBe('Anticipo aplicado · RE-000001');
    expect(data.lines[3]?.concept).toBe('Cobro a cuenta · Excedente');
  });

  it('retenciones con jurisdicción y certificado; medios con los datos del cheque', () => {
    expect(data.withholdings[0]).toEqual({ tax: 'IIBB Neuquén', certificate: 'C-1 · 09/10/2026', amount: '$ 20,00' });
    expect(data.payments[0]).toEqual({ method: 'E-cheq', detail: 'Galicia · N° 123 · Galicia · vence 09/11/2026', amount: '$ 1.250.430,00' });
  });

  it('diferencia de cambio informativa con su signo', () => {
    expect(data.fxNote).toBe('Diferencia de cambio (informativa): ganancia de $ 250.000,00 contra la cotización de los comprobantes');
    expect(buildReceiptPdfData(source({ totals: { ...source().totals, fxDifference: '-10.00' } })).fxNote).toBe(
      'Diferencia de cambio (informativa): pérdida de $ 10,00 contra la cotización de los comprobantes'
    );
    expect(buildReceiptPdfData(source({ totals: { ...source().totals, fxDifference: '0.00' } })).fxNote).toBeNull();
  });

  it('marca de agua en anulados y borradores', () => {
    expect(buildReceiptPdfData(source({ status: 'CANCELLED' })).watermark).toBe('ANULADO');
    expect(buildReceiptPdfData(source({ status: 'DRAFT', number: null }))).toMatchObject({ watermark: 'BORRADOR — NO VÁLIDO', number: 'Borrador' });
  });
});
