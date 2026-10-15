import type { WorkshopSector } from '../../actions/queries.server';
import type { SectorOrderEntry } from './Step3ExecutionOrder';
import type { LocalItem } from './types';

/**
 * Paso inicial del wizard según cuánto ya está resuelto en los datos del pedido, y el orden de
 * sectores precalculado cuando ya hay sectores asignados.
 */
export function computeInitialWizardState(
  mapped: LocalItem[],
  sectors: WorkshopSector[]
): { step: 1 | 2 | 3 | 4; sectorOrder: SectorOrderEntry[] } {
  const eligible = mapped.filter((i) => !i.is_diagnostico && !i.work_order_id && !i._rejected);

  if (eligible.length === 0) return { step: 1, sectorOrder: [] };

  // Paso 1 completo? Todos los ítems tienen al menos 1 tipo de reparación
  const allHaveRepairTypes = eligible.every((item) => {
    const pivotTypes = item.maintenance_order_item_repair_types || [];
    return pivotTypes.length > 0 || !!item.types_of_repairs;
  });
  if (!allHaveRepairTypes) return { step: 1, sectorOrder: [] };

  // Paso 2 completo? Todos tienen sector asignado
  if (!eligible.every((item) => !!item.assigned_sector_id)) return { step: 2, sectorOrder: [] };

  // Pasos 3+: se arma el orden de sectores con los datos existentes, continuando después de las OT ya generadas
  const maxExistingSeq = mapped
    .filter((i) => !i.is_diagnostico && i.work_order_id && i.sector_sequence_order !== null)
    .reduce((max, i) => Math.max(max, i.sector_sequence_order!), 0);

  const sectorIds = new Set<string>();
  for (const item of eligible) {
    if (item.assigned_sector_id) sectorIds.add(item.assigned_sector_id);
  }
  const prebuiltOrder: SectorOrderEntry[] = Array.from(sectorIds).map((sectorId, index) => {
    const sector = sectors.find((s) => s.id === sectorId);
    const itemWithSeq = eligible.find((i) => i.assigned_sector_id === sectorId && i.sector_sequence_order !== null);
    return {
      sectorId,
      sectorName: sector?.name || 'Desconocido',
      sequenceOrder: itemWithSeq?.sector_sequence_order ?? maxExistingSeq + index + 1,
      itemCount: 0,
    };
  });
  prebuiltOrder.sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  prebuiltOrder.forEach((entry, idx) => {
    entry.sequenceOrder = maxExistingSeq + idx + 1;
  });

  const allHaveSequence = eligible.every((item) => item.sector_sequence_order !== null);
  return { step: allHaveSequence ? 4 : 3, sectorOrder: prebuiltOrder };
}
