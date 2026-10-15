import { callScalar, type SqlClient } from '@/shared/lib/sql';
import { z } from 'zod';

const updatedCountSchema = z.coerce.number().int().nonnegative();

/**
 * Fórmula ÚNICA del estado de una línea de parte diario según sus recursos.
 *
 * Llama a `reconcile_daily_report_rows_status`: deja la línea en `pendiente` si tiene los recursos
 * que su ítem exige (`needs_personnel` / `needs_equipment`) y en `sin_recursos_asignados` si no (sube
 * y baja). No toca los estados terminales (ejecutado, cancelado, reprogramado, en_certificacion) y
 * solo escribe si el valor cambia.
 *
 * Hay que llamarla SIEMPRE después de escribir las relaciones (empleados, equipos, equipos de cliente)
 * y en la MISMA transacción que las escribió, con el `tx` de esa transacción.
 *
 * @returns cantidad de líneas cuyo estado cambió (0 si no hay ids).
 */
export async function reconcileRowResourceStatus(tx: SqlClient, rowIds: string[]): Promise<number> {
  if (rowIds.length === 0) return 0;
  return callScalar('reconcile_daily_report_rows_status', [{ uuidArray: rowIds }], updatedCountSchema, tx);
}
