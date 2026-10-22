import 'server-only';

import { arToday, daysUntil, parseValidity } from '@/features/Documentacion/shared/compliance/dates';
import { EXPIRING_SOON_DAYS } from '@/features/Documentacion/shared/lib/document-expiry';

/**
 * Reportes de "próximos vencimientos" del dashboard: parten de las MISMAS filas que las listas de
 * documentos (motor de cumplimiento: aplicabilidad, estado derivado, tipos privados según permiso)
 * y se quedan con los documentos permanentes CON archivo y vencimiento cargado que ya vencieron o
 * vencen dentro de `EXPIRING_SOON_DAYS` (hora argentina). Las filas faltantes no vencen: no entran.
 */
export function selectExpiringRows<Row extends { isMissing: boolean; validity: Date | null }>(
  rows: readonly Row[],
  now: Date = new Date()
): Row[] {
  const today = arToday(now);
  return rows.filter((row) => {
    if (row.isMissing) return false;
    const day = parseValidity(row.validity);
    return day !== null && daysUntil(day, today) <= EXPIRING_SOON_DAYS;
  });
}
