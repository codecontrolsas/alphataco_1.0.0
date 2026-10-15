import type {
  getPaymentOrderDetail,
  getPaymentOrderFormData,
  getPortfolioChecksForPayment,
} from '../actions/payment-queries.server';

export type PaymentOrderFormData = NonNullable<Awaited<ReturnType<typeof getPaymentOrderFormData>>>;
export type PortfolioCheckOption = Awaited<ReturnType<typeof getPortfolioChecksForPayment>>[number];
export type PaymentOrderDetail = NonNullable<Awaited<ReturnType<typeof getPaymentOrderDetail>>>;
