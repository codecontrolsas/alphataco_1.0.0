import type { getPurchaseRequestDetail } from '../actions/request-queries.server';

export type PurchaseRequestDetail = NonNullable<Awaited<ReturnType<typeof getPurchaseRequestDetail>>>;
