import type {
  getPurchaseRequestDetail,
  searchPurchaseMaterialOptions,
} from '../actions/request-queries.server';

export type PurchaseRequestDetail = NonNullable<Awaited<ReturnType<typeof getPurchaseRequestDetail>>>;
export type PurchaseMaterialOption = Awaited<ReturnType<typeof searchPurchaseMaterialOptions>>['items'][number];
