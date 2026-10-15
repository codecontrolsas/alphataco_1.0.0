import 'server-only';

import type { Prisma } from '@/generated/prisma/client';

type Tx = Pick<Prisma.TransactionClient, 'company'>;

/**
 * Deja en `by_defect = false` a las demás empresas del mismo dueño. Reemplaza al trigger
 * `update_company_by_defect_trigger`. El índice único parcial `company_one_default_per_owner`
 * (una sola empresa por defecto por owner) obliga a llamarla ANTES de guardar la empresa que
 * pasa a ser la default, dentro de la misma transacción.
 *
 * `keepId` es la empresa que se conserva (null en el alta: todavía no existe y se limpian todas).
 * Si la empresa no tiene owner no hay con qué compararla (igual que `owner_id = NULL` en SQL).
 */
export async function clearOtherDefaultCompanies(
  tx: Tx,
  ownerId: string | null,
  keepId: string | null
): Promise<number> {
  if (!ownerId) return 0;
  const result = await tx.company.updateMany({
    where: { owner_id: ownerId, by_defect: true, ...(keepId ? { id: { not: keepId } } : {}) },
    data: { by_defect: false },
  });
  return result.count;
}
