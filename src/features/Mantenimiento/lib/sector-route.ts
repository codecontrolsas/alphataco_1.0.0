/**
 * Recorrido de una orden por los sectores del taller, en orden de ejecución.
 *
 * Misma regla de orden que `MaintenanceOrders/utils/currentSector.ts` (primer `sector_sequence_order`
 * visto por sector). Reemplaza a `getSectorStatus` de `workshopTrackingColumns.tsx`.
 */

export type SectorRouteState = 'done' | 'running' | 'stuck' | 'pending' | 'rejected';

export interface SectorRouteStep {
  id: string;
  name: string;
  state: SectorRouteState;
}

interface RepairLike {
  status: string;
}

interface WorkOrderItemLike {
  maintenance_order_item_id?: string | null;
  work_order_item_repairs?: RepairLike[] | null;
}

/** Ítem de la orden reducido a lo que decide el recorrido (compatible con los selects de las listas). */
export interface SectorRouteItemLike {
  id?: string;
  assigned_sector_id: string | null;
  sector_sequence_order: number | null;
  is_rejected?: boolean | null;
  workshop_sectors?: { id: string; name: string | null } | null;
  /** Tareas del ítem, cuando el select las trae directo. */
  work_order_items?: WorkOrderItemLike[] | null;
  /** Tareas vía la OT del ítem (forma de Seguimiento). */
  work_orders?: { work_order_items?: WorkOrderItemLike[] | null } | null;
}

/** Tareas del ítem. Una tarea cancelada o rechazada no es trabajo activo. */
function repairsOf(item: SectorRouteItemLike): RepairLike[] {
  const direct = item.work_order_items ?? [];
  const viaOrder = (item.work_orders?.work_order_items ?? []).filter(
    (woi) => !item.id || !woi.maintenance_order_item_id || woi.maintenance_order_item_id === item.id
  );
  return [...direct, ...viaOrder].flatMap((woi) => woi.work_order_item_repairs ?? []);
}

const STUCK_REPAIR_STATUSES = ['pending_approval', 'reassignment_requested'];
const INACTIVE_REPAIR_STATUSES = ['cancelled', 'rejected'];

function resolveSectorState(sectorItems: SectorRouteItemLike[]): SectorRouteState {
  const repairs = sectorItems.filter((item) => !item.is_rejected).flatMap(repairsOf);
  const active = repairs.filter((repair) => !INACTIVE_REPAIR_STATUSES.includes(repair.status));

  if (repairs.some((repair) => STUCK_REPAIR_STATUSES.includes(repair.status))) return 'stuck';
  if (active.length > 0 && active.every((repair) => repair.status === 'completed')) return 'done';
  if (active.some((repair) => repair.status === 'in_progress' || repair.status === 'completed')) return 'running';
  if (sectorItems.length > 0 && sectorItems.every((item) => item.is_rejected)) return 'rejected';
  return 'pending';
}

/**
 * Agrupa los ítems por sector asignado y los ordena por secuencia de ejecución.
 * `[]` cuando ningún ítem tiene sector (la orden todavía no tiene recorrido definido).
 */
export function buildSectorRoute(items: readonly SectorRouteItemLike[] | null | undefined): SectorRouteStep[] {
  const bySector = new Map<string, { name: string; order: number; items: SectorRouteItemLike[] }>();

  for (const item of items ?? []) {
    const sectorId = item.assigned_sector_id;
    if (!sectorId) continue;
    const entry = bySector.get(sectorId);
    if (entry) {
      entry.items.push(item);
      continue;
    }
    bySector.set(sectorId, {
      name: item.workshop_sectors?.name ?? 'Sin nombre',
      order: item.sector_sequence_order ?? 999,
      items: [item],
    });
  }

  return Array.from(bySector.entries())
    .sort((a, b) => a[1].order - b[1].order)
    .map(([id, sector]) => ({ id, name: sector.name, state: resolveSectorState(sector.items) }));
}
