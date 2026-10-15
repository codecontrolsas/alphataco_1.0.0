/**
 * Labels, colores e iconos de los estados de OM y OT que usa la Vista Taller.
 *
 * Vive en un módulo propio (sin directiva) porque lo consumen tanto las columnas
 * de la tabla como el modal de tareas: tenerlo en `columns.tsx` obligaba a un
 * import circular entre los dos.
 *
 * Los valores derivan de `lib/status-presentation.ts` (fuente única). El PDF de la orden usa
 * `getMoStatusConfig` / `getWoStatusConfig`: con el mapa completo ya no muestra estados en crudo.
 */

import {
  ORDER_STATUS_UI,
  TONE_TO_BADGE,
  WORK_ORDER_STATUS_UI,
  getStatusUi,
  type BadgeVariant,
  type StatusUi,
} from '@/features/Mantenimiento/lib/status-presentation';
import type { LucideIcon } from 'lucide-react';

export type StatusConfig = {
  label: string;
  variant: BadgeVariant;
  icon: LucideIcon;
};

function toConfig(ui: StatusUi): StatusConfig {
  return { label: ui.label, variant: TONE_TO_BADGE[ui.tone], icon: ui.icon };
}

/** Estados de maintenance_orders (String, no enum). */
export const MO_STATUS_CONFIG: Record<string, StatusConfig> = Object.fromEntries(
  Object.entries(ORDER_STATUS_UI).map(([status, ui]) => [status, toConfig(ui)])
);

/** Estados de work_orders (enum work_order_status). */
export const WO_STATUS_CONFIG: Record<string, StatusConfig> = Object.fromEntries(
  Object.entries(WORK_ORDER_STATUS_UI)
    // `blocked` es presentación del panel del operario, no un valor de la columna.
    .filter(([status]) => status !== 'blocked')
    .map(([status, ui]) => [status, toConfig(ui)])
);

export function getMoStatusConfig(status: string | null | undefined): StatusConfig {
  return toConfig(getStatusUi('order', status));
}

export function getWoStatusConfig(status: string | null | undefined): StatusConfig {
  return toConfig(getStatusUi('workOrder', status));
}

