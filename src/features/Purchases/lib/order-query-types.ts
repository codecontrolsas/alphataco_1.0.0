import type { getPurchaseOrderDetail, searchOrderableRequestLines } from '../actions/order-queries.server';

export type OrderableRequestLineOption = Awaited<ReturnType<typeof searchOrderableRequestLines>>['items'][number];
export type PurchaseOrderDetail = NonNullable<Awaited<ReturnType<typeof getPurchaseOrderDetail>>>;
