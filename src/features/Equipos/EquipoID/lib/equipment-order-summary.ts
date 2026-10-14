/**
 * Resumen de una orden de mantenimiento para la fila de la tabla (sectores, ítems, OTs y progreso).
 *
 * Se calcula en el servidor a partir de un select mínimo (ítems con sus ids y, aparte, solo el `status` de
 * las reparaciones de la OT), para no mandar al navegador las órdenes de trabajo completas de cada fila.
 * Sin directiva: son funciones puras.
 */

export type SectorProgress = 'completed' | 'in_progress' | 'pending';

export interface SummaryItem {
  id: string;
  is_diagnostico: boolean;
  assigned_sector_id: string | null;
  sector_sequence_order: number | null;
  work_order_id: string | null;
  workshop_sectors: { id: string; name: string } | null;
}

/** Clave de las reparaciones de un ítem dentro de SU orden de trabajo (un ítem puede figurar en varias OTs). */
export function repairsKey(itemId: string, workOrderId: string): string {
  return `${itemId}:${workOrderId}`;
}

function sectorProgress(statuses: readonly string[]): SectorProgress {
  if (statuses.length === 0) return 'pending';
  const completed = statuses.filter((status) => status === 'completed').length;
  if (completed === statuses.length) return 'completed';
  if (completed > 0 || statuses.includes('in_progress')) return 'in_progress';
  return 'pending';
}

/**
 * @param repairStatuses estados de las reparaciones por `repairsKey(ítem, OT del ítem)`.
 *
 * El progreso cuenta solo las reparaciones de cada ítem (no las de todos los ítems de su OT, que repetía las
 * reparaciones de una OT compartida por N ítems), igual que el estado de cada sector.
 */
export function summarizeOrderItems(
  items: readonly SummaryItem[],
  repairStatuses: ReadonlyMap<string, readonly string[]>
) {
  const statusesOf = (item: SummaryItem): readonly string[] =>
    item.work_order_id ? repairStatuses.get(repairsKey(item.id, item.work_order_id)) ?? [] : [];

  const regularItems = items.filter((item) => !item.is_diagnostico);

  let totalRepairs = 0;
  let completedRepairs = 0;
  for (const item of regularItems) {
    const statuses = statusesOf(item);
    totalRepairs += statuses.length;
    completedRepairs += statuses.filter((status) => status === 'completed').length;
  }

  const workOrderIds = new Set<string>();
  for (const item of items) {
    if (item.work_order_id) workOrderIds.add(item.work_order_id);
  }

  const bySector = new Map<string, { name: string; sequence: number; statuses: string[] }>();
  for (const item of items) {
    if (!item.assigned_sector_id) continue;
    const sector = bySector.get(item.assigned_sector_id) ?? {
      name: item.workshop_sectors?.name ?? 'Sin sector',
      sequence: item.sector_sequence_order ?? 999,
      statuses: [],
    };
    sector.statuses.push(...statusesOf(item));
    bySector.set(item.assigned_sector_id, sector);
  }

  const sectors = Array.from(bySector, ([id, sector]) => ({
    id,
    name: sector.name,
    sequence: sector.sequence,
    status: sectorProgress(sector.statuses),
  })).sort((a, b) => a.sequence - b.sequence);

  return {
    itemsCount: regularItems.length,
    workOrdersCount: workOrderIds.size,
    progress: totalRepairs > 0 ? Math.round((completedRepairs / totalRepairs) * 100) : 0,
    sectors,
  };
}
