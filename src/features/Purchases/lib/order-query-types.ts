import type {
  getPurchaseOrderDetail,
  getSupplierPurchaseContext,
  searchOrderableRequestLines,
} from '../actions/order-queries.server';

export type OrderableRequestLineOption = Awaited<ReturnType<typeof searchOrderableRequestLines>>['items'][number];
export type SupplierPurchaseContext = NonNullable<Awaited<ReturnType<typeof getSupplierPurchaseContext>>>;
export type PurchaseOrderDetail = NonNullable<Awaited<ReturnType<typeof getPurchaseOrderDetail>>>;
