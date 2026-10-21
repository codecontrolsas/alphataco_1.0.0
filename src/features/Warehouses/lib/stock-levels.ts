import 'server-only';

import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/lib/prisma';
import { cache } from 'react';

/**
 * UNA sola regla de "bajo mínimo": material activo con `min_stock` definido cuyo saldo total (suma de
 * todos los depósitos) es menor al mínimo, INCLUIDOS los que no tienen ningún saldo (agotados). La
 * comparación es en `Decimal`, nunca en float. Con `React.cache` el aviso de Stock y el contador de la
 * sub-navegación comparten una sola consulta por request.
 */
export const getBelowMinimumMaterials = cache(async (companyId: string) => {
  const materials = await prisma.materials.findMany({
    where: { company_id: companyId, is_active: true, min_stock: { not: null } },
    select: { id: true, code: true, name: true, min_stock: true, unit: { select: { abbreviation: true } } },
  });
  if (materials.length === 0) return [];

  const totals = await prisma.stock_balances.groupBy({
    by: ['material_id'],
    where: { company_id: companyId, material_id: { in: materials.map((m) => m.id) } },
    _sum: { quantity: true },
  });
  const totalById = new Map(totals.map((t) => [t.material_id, t._sum.quantity ?? new Prisma.Decimal(0)]));

  return materials
    .map((m) => ({ m, total: totalById.get(m.id) ?? new Prisma.Decimal(0) }))
    .filter(({ m, total }) => total.lt(m.min_stock!))
    .sort((a, b) => a.total.dividedBy(a.m.min_stock!).comparedTo(b.total.dividedBy(b.m.min_stock!)))
    .map(({ m, total }) => ({
      id: m.id,
      code: m.code,
      name: m.name,
      unit: m.unit.abbreviation,
      total: total.toString(),
      minStock: m.min_stock!.toString(),
    }));
});

/** Cantidad de materiales bajo su mínimo (misma regla que `getBelowMinimumMaterials`). */
export async function countBelowMinimum(companyId: string): Promise<number> {
  return (await getBelowMinimumMaterials(companyId)).length;
}
