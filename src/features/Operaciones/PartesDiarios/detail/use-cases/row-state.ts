import type { TenantTx } from '@/shared/lib/tenant-context';
import type { RowWriteResult } from './types';

/**
 * Recalcula el estado de la línea según sus recursos (fórmula única en SQL: `pendiente` si tiene los que su ítem exige,
 * `sin_recursos_asignados` si no; no toca los estados terminales).
 */
export async function reconcileStatus(tx: TenantTx, rowId: string): Promise<void> {
  await tx.$executeRaw`SELECT reconcile_daily_report_rows_status(${[rowId]}::uuid[])`;
}

/** Estado y versión FINALES de la línea, leídos al terminar el comando. */
export async function readRowOutcome(tx: TenantTx, rowId: string): Promise<Pick<RowWriteResult, 'rowId' | 'version' | 'status'>> {
  const rows = await tx.$queryRaw<{ version: number; status: string }[]>`
    SELECT version, status::text AS status FROM dailyreportrows WHERE id = ${rowId}::uuid`;
  const row = rows[0];
  if (!row) throw new Error('La línea desapareció dentro de su propia transacción.');
  return { rowId, version: row.version, status: row.status };
}

/**
 * Las pivotes no tocan la fila; subir `updated_at` dispara el trigger de versión (sin historial: `updated_at` no es un
 * campo auditado) para que quien tenía la versión anterior vea el conflicto.
 */
export async function touchRow(tx: TenantTx, rowId: string): Promise<void> {
  await tx.$executeRaw`UPDATE dailyreportrows SET updated_at = now() WHERE id = ${rowId}::uuid`;
}
