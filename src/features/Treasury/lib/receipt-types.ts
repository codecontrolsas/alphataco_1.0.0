import type { getReceiptDetail, getReceiptFormData } from '../actions/receipt-reads.server';

export type ReceiptFormData = NonNullable<Awaited<ReturnType<typeof getReceiptFormData>>>;
export type ReceiptDetail = NonNullable<Awaited<ReturnType<typeof getReceiptDetail>>>;
