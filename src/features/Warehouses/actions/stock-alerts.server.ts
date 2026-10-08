'use server';

import { Prisma } from '@/generated/prisma/client';
import { checkPermissionServer } from '@/features/Permissions';
import { argentinaDate } from '@/features/Jobs/lib/dates';
import { prisma } from '@/shared/lib/prisma';
import { findExpiringBatches } from '../lib/expiring-batches';
import { getActiveCompanyId } from '@/shared/lib/tenant';

/**
 * Materiales activos cuyo stock total (todos los depositos) esta por debajo de su minimo,
 * INCLUIDOS los que no tienen ningun saldo. La tabla de Stock lista saldos existentes, asi que
 * un material agotado no aparece en ella: justo el caso mas urgente.
 */
export async function getMaterialsBelowMinimum() {
  if (!(await checkPermissionServer('almacenes', 'stock', 'view'))) return [];
  const companyId = await getActiveCompanyId();

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
}

/** Lotes con saldo vencidos o por vencer, para el aviso de Stock (ver `lib/expiring-batches.ts`). */
export async function getExpiringBatches() {
  if (!(await checkPermissionServer('almacenes', 'stock', 'view'))) return [];
  return findExpiringBatches(await getActiveCompanyId(), argentinaDate());
}
