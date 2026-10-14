import { useCallback, useMemo, useState } from 'react';
import type { WorkshopSector } from '../../actions/queries.server';
import type { SectorOrderEntry } from './Step3ExecutionOrder';
import type { LocalItem } from './types';

/**
 * Estado de los pasos 2 y 3 del wizard: asignación de sectores y orden de ejecución.
 */
export function useWizardSectors(
  initialSectorOrder: SectorOrderEntry[],
  localItems: LocalItem[],
  eligibleItems: LocalItem[],
  sectors: WorkshopSector[]
) {
  // itemId -> sectorId elegido en el paso 2 (los ya asignados en la base van por `assigned_sector_id`)
  const [sectorAssignments, setSectorAssignments] = useState<Map<string, string>>(new Map());
  const [sectorOrder, setSectorOrder] = useState<SectorOrderEntry[]>(initialSectorOrder);

  const handleAssignmentChange = useCallback((itemId: string, sectorId: string) => {
    setSectorAssignments((prev) => {
      const next = new Map(prev);
      next.set(itemId, sectorId);
      return next;
    });
  }, []);

  const handleBatchAssignment = useCallback((assignments: Map<string, string>) => {
    setSectorAssignments(assignments);
  }, []);

  // Max sequence order de los ítems que ya tienen OT generada
  const maxExistingSequenceOrder = useMemo(() => {
    return localItems
      .filter(
        (item) => !item.is_diagnostico && !item._deleted && item.work_order_id && item.sector_sequence_order !== null
      )
      .reduce((max, item) => Math.max(max, item.sector_sequence_order!), 0);
  }, [localItems]);

  // Al entrar al paso 3 se calcula el orden de sectores a partir de las asignaciones del paso 2
  const buildSectorOrder = useCallback(() => {
    const sectorIds = new Set<string>();

    for (const item of eligibleItems) {
      const assignedSector = sectorAssignments.get(item.id) || item.assigned_sector_id;
      if (assignedSector) sectorIds.add(assignedSector);
    }

    const newOrder: SectorOrderEntry[] = Array.from(sectorIds).map((sectorId, index) => {
      const sector = sectors.find((s) => s.id === sectorId);
      const existing = sectorOrder.find((so) => so.sectorId === sectorId);
      // Fallback: sector_sequence_order de cualquier ítem ya asignado a este sector en la base
      const itemWithSequence = eligibleItems.find(
        (item) =>
          (sectorAssignments.get(item.id) || item.assigned_sector_id) === sectorId && item.sector_sequence_order !== null
      );
      return {
        sectorId,
        sectorName: sector?.name || 'Desconocido',
        sequenceOrder:
          existing?.sequenceOrder ?? itemWithSequence?.sector_sequence_order ?? maxExistingSequenceOrder + index + 1,
        itemCount: 0, // Se calcula al mostrar
      };
    });

    newOrder.sort((a, b) => a.sequenceOrder - b.sequenceOrder);
    // Se re-normaliza continuando desde el último orden de OT existente
    newOrder.forEach((entry, idx) => {
      entry.sequenceOrder = maxExistingSequenceOrder + idx + 1;
    });

    setSectorOrder(newOrder);
  }, [eligibleItems, sectorAssignments, sectors, sectorOrder, maxExistingSequenceOrder]);

  const handleReorder = useCallback((sectorId: string, direction: 'up' | 'down') => {
    setSectorOrder((prev) => {
      const sorted = [...prev].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
      const index = sorted.findIndex((s) => s.sectorId === sectorId);
      if (index < 0) return prev;

      const swapIndex = direction === 'up' ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= sorted.length) return prev;

      const tempSeq = sorted[index].sequenceOrder;
      sorted[index] = { ...sorted[index], sequenceOrder: sorted[swapIndex].sequenceOrder };
      sorted[swapIndex] = { ...sorted[swapIndex], sequenceOrder: tempSeq };

      return sorted;
    });
  }, []);

  const handleDragReorder = useCallback((reordered: SectorOrderEntry[]) => {
    setSectorOrder(reordered);
  }, []);

  // Todos los ítems elegibles deben tener un sector asignado
  const canAdvanceFromStep2 = useMemo(
    () => eligibleItems.every((item) => sectorAssignments.has(item.id) || !!item.assigned_sector_id),
    [eligibleItems, sectorAssignments]
  );

  return {
    sectorAssignments,
    sectorOrder,
    canAdvanceFromStep2,
    handleAssignmentChange,
    handleBatchAssignment,
    buildSectorOrder,
    handleReorder,
    handleDragReorder,
  };
}
