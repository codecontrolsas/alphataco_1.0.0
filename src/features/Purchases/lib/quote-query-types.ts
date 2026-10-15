import type { getPurchaseQuoteDetail, getRequestQuoteComparison } from '../actions/quote-queries.server';

export type PurchaseQuoteDetail = NonNullable<Awaited<ReturnType<typeof getPurchaseQuoteDetail>>>;
export type RequestQuoteComparison = NonNullable<Awaited<ReturnType<typeof getRequestQuoteComparison>>>;
