import 'server-only';

import { prisma } from '@/shared/lib/prisma';
import { profileDisplayName } from '@/shared/lib/table-list-query';

/**
 * Opciones de faceta que se resuelven con una consulta de lookup por ids. Devuelven `[]` sin consultar
 * cuando no hay ids, y se ordenan por nombre.
 */

/** Perfiles (creador, aprobador, solicitante...) como opciones `{ id, name }`. */
export async function profileFacetOptions(ids: string[]): Promise<Array<{ id: string; name: string }>> {
  if (ids.length === 0) return [];
  const profiles = await prisma.profile.findMany({
    where: { id: { in: ids } },
    select: { id: true, fullname: true, email: true },
    orderBy: { fullname: 'asc' },
  });
  return profiles.map((p) => ({ id: p.id, name: profileDisplayName(p) }));
}
