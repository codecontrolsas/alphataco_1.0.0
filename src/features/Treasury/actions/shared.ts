import 'server-only';

import { revalidatePath } from 'next/cache';
import { treasuryToday } from '../lib/today';

/** Constantes y helpers de las actions de Tesorería (server-only, sin directiva). */

export const TREASURY_PATH = '/dashboard/treasury';
export const PURCHASES_PATH = '/dashboard/purchases';
export const SESSION_EXPIRED = 'Tu sesión expiró. Volvé a ingresar.';
export const TRANSACTION_OPTIONS = { timeout: 20_000, maxWait: 5_000 };

/** Hoy en hora argentina (ver `lib/today.ts`): el proceso puede estar en UTC. */
export const localToday = () => treasuryToday();

/** Tesorería y Compras (el selector de cuentas del pago muestra saldos). */
export function revalidateTreasury() {
  revalidatePath(TREASURY_PATH, 'layout');
  revalidatePath(PURCHASES_PATH, 'layout');
}
