import 'server-only';
import { PURCHASES_PATH } from './action-errors';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { revalidatePath } from 'next/cache';

export const NOT_FOUND = 'La orden de pago no existe';

export function revalidate() {
  revalidatePath(PURCHASES_PATH, 'layout');
}

export const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

export async function canEditOrders() {
  const [create, update] = await Promise.all([
    checkPermissionServer('compras', 'pagos', 'create'),
    checkPermissionServer('compras', 'pagos', 'update'),
  ]);
  return create || update;
}
