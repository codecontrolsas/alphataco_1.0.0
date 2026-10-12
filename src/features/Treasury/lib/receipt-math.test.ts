import { describe, expect, it } from 'vitest';
import { appliedToArs, arsToApplied, closingError, closingGap, fxDifference, receiptTotals } from './receipt-math';

const B = (value: number | string) => BigInt(value);

describe('appliedToArs', () => {
  it('convierte a pesos con la cotización (centavos × millonésimas)', () => {
    // USD 1.000,00 a 1.250,50 = $ 1.250.500,00
    expect(appliedToArs(B(100000), B(1250500000))).toBe(B(125050000));
  });
  it('redondea mitad hacia arriba al centavo', () => {
    expect(appliedToArs(B(1), B(1500000))).toBe(B(2));
    expect(appliedToArs(B(1), B(1499999))).toBe(B(1));
  });
  it('en pesos (cotización 1) no cambia', () => {
    expect(appliedToArs(B(123456), B(1000000))).toBe(B(123456));
  });
});

describe('arsToApplied', () => {
  it('convierte pesos a la moneda del comprobante', () => {
    expect(arsToApplied(B(125050000), B(1250500000))).toBe(B(100000));
  });
  it('redondea mitad hacia arriba al centavo', () => {
    expect(arsToApplied(B(1), B(2000000))).toBe(B(1));
  });
  it('ida y vuelta: los pesos del pendiente completo devuelven el pendiente exacto', () => {
    for (const rate of [B(1050250000), B(1432123456), B(1500000)]) {
      for (const pending of [B(1), B(99999), B(123456789)]) {
        expect(arsToApplied(appliedToArs(pending, rate), rate)).toBe(pending);
      }
    }
  });
});

describe('fxDifference', () => {
  it('es ganancia si la cotización del cobro es mayor que la de la factura', () => {
    expect(fxDifference(B(100000), B(1250000000), B(1000000000))).toBe(B(25000000));
  });
  it('es pérdida si es menor', () => {
    expect(fxDifference(B(100000), B(1000000000), B(1250000000))).toBe(B(-25000000));
  });
  it('es 0 con la misma cotización', () => {
    expect(fxDifference(B(100000), B(1000000), B(1000000))).toBe(B(0));
  });
  it('redondea mitad lejos del cero', () => {
    expect(fxDifference(B(1), B(1000000), B(1500000))).toBe(B(-1));
    expect(fxDifference(B(1), B(1500000), B(1000000))).toBe(B(1));
  });
});

describe('receiptTotals con deudas de cheques rechazados', () => {
  it('la deuda cobrada de un cheque rechazado suma a lo que se cobra', () => {
    const totals = receiptTotals({
      lines: [
        { kind: 'INVOICE', amountArs: B(100000), fxDifference: B(0) },
        { kind: 'REJECTED_CHECK', amountArs: B(30000), fxDifference: B(0) },
      ],
      withholdings: [],
      payments: [B(130000)],
    });
    expect(totals.invoicesTotal).toBe(B(130000));
    expect(closingGap(totals)).toBe(B(0));
  });
});

describe('receiptTotals y closingGap', () => {
  const totals = receiptTotals({
    lines: [
      { kind: 'INVOICE', amountArs: B(100000), fxDifference: B(500) },
      { kind: 'INVOICE', amountArs: B(50000), fxDifference: B(-200) },
      { kind: 'ADVANCE', amountArs: B(20000), fxDifference: B(0) },
      { kind: 'ADVANCE_APPLIED', amountArs: B(30000), fxDifference: B(0) },
    ],
    withholdings: [B(5000), B(2500)],
    payments: [B(100000), B(32500)],
  });

  it('agrupa por tipo de línea', () => {
    expect(totals).toEqual({
      invoicesTotal: B(150000),
      advanceTotal: B(20000),
      advancesAppliedTotal: B(30000),
      withholdingsTotal: B(7500),
      receivedTotal: B(132500),
      fxDifferenceTotal: B(300),
    });
  });
  it('cierra cuando lo imputado iguala lo entregado', () => {
    expect(closingGap(totals)).toBe(B(0));
    expect(closingError(B(0))).toBeNull();
  });
  it('faltan cuando lo imputado supera lo entregado', () => {
    expect(closingGap({ ...totals, receivedTotal: B(7500) })).toBe(B(125000));
    expect(closingError(B(125000))).toBe('El recibo no cierra: faltan $ 1.250,00');
  });
  it('sobran cuando lo entregado supera lo imputado', () => {
    expect(closingError(B(-125000))).toBe('El recibo no cierra: sobran $ 1.250,00');
  });
});
