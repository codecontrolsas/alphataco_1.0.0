import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { createHash } from 'node:crypto';

/**
 * Tipo de reparación DIAGNÓSTICO: lo usa la tarea de diagnóstico que el sistema agrega a cada OT.
 *
 * Antes era UNA fila global (`00000000-0000-0000-0000-d1a900571c00`, `company_id NULL`) que sembraba la migración de
 * Supabase. Con el catálogo por empresa (`types_of_repairs.company_id NOT NULL`, 20260923150000) esa fila no existe en
 * ninguna base nueva y generar una OT fallaba con P2003 en `work_order_item_repairs_repair_type_id_fkey` (ticket 800).
 *
 * Ahora hay una por empresa, con id determinístico (UUID v5 del id de la empresa): se crea sola la primera vez que se
 * genera una OT, sobrevive a cualquier reseteo de datos y se puede excluir de los catálogos sin consultarla.
 */

/** Namespace propio del UUID v5 del tipo DIAGNÓSTICO (fijo: cambiarlo crearía un tipo nuevo por empresa). */
const DIAGNOSTIC_REPAIR_TYPE_NAMESPACE = '8c9496ec-7901-40a3-8dde-11384f314ac8';

/** UUID v5 (RFC 4122) con sha1, igual que `scripts/lib/uuid-v5.ts`. */
function uuidV5(name: string, namespace: string): string {
  const hash = createHash('sha1')
    .update(Buffer.concat([Buffer.from(namespace.replace(/-/g, ''), 'hex'), Buffer.from(name, 'utf8')]))
    .digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Id del tipo DIAGNÓSTICO de la empresa (exista o no la fila todavía). */
export function getDiagnosticRepairTypeId(companyId: string): string {
  return uuidV5(companyId, DIAGNOSTIC_REPAIR_TYPE_NAMESPACE);
}

/**
 * Devuelve el id del tipo DIAGNÓSTICO de la empresa y lo crea si falta. Va dentro de la transacción que genera la OT:
 * si la generación falla, el alta del tipo también se revierte.
 */
export async function ensureDiagnosticRepairType(
  tx: Pick<Prisma.TransactionClient, 'types_of_repairs'>,
  companyId: string
): Promise<string> {
  const id = getDiagnosticRepairTypeId(companyId);
  await tx.types_of_repairs.upsert({
    where: { id },
    update: {},
    create: {
      id,
      company_id: companyId,
      name: 'Diagnóstico',
      description: 'Tipo de reparación reservado para items de diagnóstico generados automáticamente por el sistema',
      is_active: true,
    },
    select: { id: true },
  });
  return id;
}
