import type { DailyReportDetailRow } from '../types';

// ============================================================================
// HELPERS — Employee label
// ============================================================================

export function buildEmployeeLabel(emp: {
  file?: string | null;
  lastname?: string | null;
  firstname?: string | null;
}): string {
  return `[${emp.file ?? '?'}] ${emp.lastname ?? ''} ${emp.firstname ?? ''}`.trim();
}

/** Contexto de la fila, para que el modal de recursos indique de qué línea se trata. */
export function buildRowDescription(row: DailyReportDetailRow): string {
  const parts = [row.customers?.name, row.customer_services?.service_name, row.service_items?.item_name].filter(
    (part): part is string => Boolean(part)
  );
  return parts.length > 0 ? parts.join(' · ') : 'Recursos asignados a esta fila del parte diario.';
}

/** Hora de una columna `Time` (Prisma la entrega como Date en UTC) como `HH:mm`; `null` si no hay. */
export function formatRowTime(value: unknown): string | null {
  if (!value) return null;
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
