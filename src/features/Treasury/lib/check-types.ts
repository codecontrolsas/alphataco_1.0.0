import type { getCheckDetail, getCheckOperationFormData } from '../actions/check-reads.server';

export type CheckDetail = NonNullable<Awaited<ReturnType<typeof getCheckDetail>>>;
export type CheckOperationFormData = NonNullable<Awaited<ReturnType<typeof getCheckOperationFormData>>>;
