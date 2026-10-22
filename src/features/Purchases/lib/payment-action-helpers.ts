import 'server-only';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { revalidatePath } from 'next/cache';

const PURCHASES_PATH = '/dashboard/purchases';
export const SESSION_EXPIRED = 'Tu sesión expiró. Volvé a ingresar.';
export const NOT_FOUND = 'La orden de pago no existe';
export const TRANSACTION_OPTIONS = { timeout: 20_000, maxWait: 5_000 };

export function revalidate() {
  revalidatePath(PURCHASES_PATH, 'layout');
}

export const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
export const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export async function canEditOrders() {
  const [create, update] = await Promise.all([
    checkPermissionServer('compras', 'pagos', 'create'),
    checkPermissionServer('compras', 'pagos', 'update'),
  ]);
  return create || update;
}
