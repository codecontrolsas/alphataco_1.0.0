import 'server-only';

import { prisma } from '@/shared/lib/prisma';
import { classifyBatch, dateColumnToYmd, EXPIRING_WINDOW_DAYS } from './batch-expiry';

/**
 * Lotes con saldo de una empresa, vencidos o que vencen dentro de la ventana, ordenados por
 * vencimiento. Fuente unica del aviso de Stock (con sesion) y del mail semanal (por empresa,
 * sin sesion): los dos tienen que mostrar exactamente lo mismo.
 */
export async function findExpiringBatches(companyId: string, today: string) {
  const limit = new Date(`${today}T00:00:00.000Z`);
  limit.setUTCDate(limit.getUTCDate() + EXPIRING_WINDOW_DAYS);

  const balances = await prisma.stock_balances.findMany({
    where: { company_id: companyId, quantity: { gt: 0 }, batch: { expires_at: { not: null, lte: limit } } },
    select: {
      quantity: true,
      warehouse: { select: { name: true } },
      material: { select: { id: true, code: true, name: true, unit: { select: { abbreviation: true } } } },
      batch: { select: { batch_number: true, expires_at: true } },
    },
  });

  return balances
    .map((b) => {
      const expiresOn = dateColumnToYmd(b.batch!.expires_at!);
      return {
        materialId: b.material.id,
        materialCode: b.material.code,
        material: b.material.name,
        unit: b.material.unit.abbreviation,
        warehouse: b.warehouse.name,
        batch: b.batch!.batch_number,
        expiresOn,
        quantity: b.quantity.toString(),
        status: classifyBatch(expiresOn, today) as 'EXPIRED' | 'EXPIRING',
      };
    })
    .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn) || a.warehouse.localeCompare(b.warehouse));
}

export type ExpiringBatch = Awaited<ReturnType<typeof findExpiringBatches>>[number];
