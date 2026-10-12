import { describe, expect, it } from 'vitest';
import { paymentOrderFormSchema, registerPaymentFormSchema } from './payment-orders';

const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';

const issues = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? [] : (result.error?.issues ?? []).map((i) => i.message);

const payment = { method: 'TRANSFER' as const, accountId: ID1, amount: '100', reference: '', checkNumber: '', checkBank: '', checkDueOn: '', thirdPartyCheckId: '' };

describe('registerPaymentFormSchema', () => {
  it('un cheque de tercero pide el cheque, no la cuenta ni el importe', () => {
    const third = { ...payment, method: 'THIRD_PARTY_CHECK' as const, accountId: '', amount: '' };
    expect(issues(registerPaymentFormSchema.safeParse({ paidOn: '2026-10-11', payments: [third] }))).toContain('Elegí el cheque');
    expect(issues(registerPaymentFormSchema.safeParse({ paidOn: '2026-10-11', payments: [{ ...third, thirdPartyCheckId: ID2 }] }))).toEqual([]);
  });
  it('el mismo cheque no va dos veces', () => {
    const third = { ...payment, method: 'THIRD_PARTY_CHECK' as const, accountId: '', amount: '', thirdPartyCheckId: ID2 };
    expect(issues(registerPaymentFormSchema.safeParse({ paidOn: '2026-10-11', payments: [third, third] }))).toContain('El cheque está dos veces');
  });
});

describe('paymentOrderFormSchema', () => {
  const base = {
    supplierId: ID1,
    plannedOn: '2026-10-11',
    notes: '',
    advance: { amount: '', purchaseOrderId: '', description: '' },
    manualWithholdings: [],
  };
  it('una deuda de cheque rechazado lleva el cheque y no se repite', () => {
    const line = { kind: 'REJECTED_CHECK' as const, invoiceId: '', sourceLineId: '', checkId: ID2, amount: '10' };
    expect(issues(paymentOrderFormSchema.safeParse({ ...base, lines: [line] }))).toEqual([]);
    expect(issues(paymentOrderFormSchema.safeParse({ ...base, lines: [{ ...line, checkId: '' }] }))).toContain('Falta el comprobante o el anticipo');
    expect(issues(paymentOrderFormSchema.safeParse({ ...base, lines: [line, line] }))).toContain('El mismo comprobante o anticipo está dos veces');
  });
});
