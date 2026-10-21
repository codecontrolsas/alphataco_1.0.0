import 'server-only';

import type { Prisma } from '@/generated/prisma/client';

type LockTx = Pick<Prisma.TransactionClient, '$executeRaw'>;

/**
 * Serializa lo que toca una cuenta (alta de chequera, emisión de cheques, activar o desactivar) con un candado
 * consultivo de la transacción, en vez de bloquear la fila de `treasury_accounts`: un `FOR UPDATE` o `FOR SHARE`
 * exige también la política de UPDATE de la tabla, y quien emite cheques no tiene el permiso de configuración.
 */
export async function lockTreasuryAccount(tx: LockTx, accountId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'treasury_account:' + accountId}, 0))`;
}
