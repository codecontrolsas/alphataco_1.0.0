import type { getPaymentOrderDetail, getPaymentOrderFormData } from '../actions/payment-queries.server';

export type PaymentOrderFormData = NonNullable<Awaited<ReturnType<typeof getPaymentOrderFormData>>>;
export type PaymentOrderDetail = NonNullable<Awaited<ReturnType<typeof getPaymentOrderDetail>>>;
