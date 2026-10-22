import 'server-only';

import { prisma } from '@/shared/lib/prisma';

/** Proveedores como opciones de faceta `{ id, name }`, ordenados por nombre. `[]` sin consultar si no hay ids. */
export async function supplierFacetOptions(ids: string[]): Promise<Array<{ id: string; name: string }>> {
  if (ids.length === 0) return [];
  return prisma.suppliers.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}
