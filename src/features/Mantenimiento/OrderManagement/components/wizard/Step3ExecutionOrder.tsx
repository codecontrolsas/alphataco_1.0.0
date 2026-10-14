'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { useMemo } from 'react';
import type { LocalItem } from '../ManageOrderWizard';
import { RejectedItemsList } from './RejectedItemsList';

interface SectorOrderEntry {
  sectorId: string;
  sectorName: string;
  sequenceOrder: number;
  itemCount: number;
}

interface Step3ExecutionOrderProps {
  localItems: LocalItem[];
  sectorAssignments: Map<string, string>; // itemId → sectorId
  sectorOrder: SectorOrderEntry[];
  onReorder: (sectorId: string, direction: 'up' | 'down') => void;
  onDragReorder: (reordered: SectorOrderEntry[]) => void;
  repairTypes: Array<{ id: string; name: string }>;
}

// ─── Sortable Sector Card ──────────────────────────────────

interface SectorCounts {
  items: number;
  repairTypes: number;
}

interface SortableSectorCardProps {
  entry: SectorOrderEntry;
  index: number;
  totalCount: number;
  sectorCounts: SectorCounts;
  onReorder: (sectorId: string, direction: 'up' | 'down') => void;
}

function SortableSectorCard({ entry, index, totalCount, sectorCounts, onReorder }: SortableSectorCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.sectorId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 border rounded-lg bg-card transition-colors ${
        isDragging ? 'opacity-50 shadow-lg ring-2 ring-primary/30 z-10' : 'hover:bg-muted/30'
      }`}
    >
      {/* Drag handle + order number */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing touch-none p-0.5 rounded hover:bg-muted"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm border border-primary/20">
          {entry.sequenceOrder}
        </div>
      </div>

      {/* Sector info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{entry.sectorName}</p>
        <p className="text-xs text-muted-foreground">
          {sectorCounts.items} {sectorCounts.items === 1 ? 'solicitud' : 'solicitudes'} + Diagnóstico
        </p>
      </div>

      {/* Task count badge (repair types + diagnostic) */}
      <Badge variant="outline" className="shrink-0">
        {sectorCounts.repairTypes + 1} {sectorCounts.repairTypes + 1 === 1 ? 'tarea' : 'tareas'}
      </Badge>

      {/* Reorder buttons (keyboard/accessibility alternative) */}
      <div className="flex flex-col gap-0.5 shrink-0">
        <Button type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={index === 0}
          aria-label="Subir sector en el orden de ejecución"
          onClick={() => onReorder(entry.sectorId, 'up')}
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={index === totalCount - 1}
          aria-label="Bajar sector en el orden de ejecución"
          onClick={() => onReorder(entry.sectorId, 'down')}
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────

export function Step3ExecutionOrder({
  localItems,
  sectorAssignments,
  sectorOrder,
  onReorder,
  onDragReorder,
  repairTypes,
}: Step3ExecutionOrderProps) {
  const sorted = useMemo(() => [...sectorOrder].sort((a, b) => a.sequenceOrder - b.sequenceOrder), [sectorOrder]);

  const sectorIds = useMemo(() => sorted.map((s) => s.sectorId), [sorted]);

  // Count items and repair types per sector
  const countsBySector = useMemo(() => {
    const counts = new Map<string, SectorCounts>();
    const eligibleItems = localItems.filter(
      (i) => !i.is_diagnostico && !i._deleted && !i.work_order_id && !i._rejected
    );

    for (const item of eligibleItems) {
      const sectorId = sectorAssignments.get(item.id) || item.assigned_sector_id;
      if (sectorId) {
        const current = counts.get(sectorId) || { items: 0, repairTypes: 0 };
        current.items += 1;

        // Count repair types for this item
        if (item._isTemp && item._tempRepairTypeIds) {
          current.repairTypes += item._tempRepairTypeIds.length;
        } else {
          const pivotTypes = item.maintenance_order_item_repair_types || [];
          current.repairTypes += pivotTypes.length > 0 ? pivotTypes.length : item.types_of_repairs ? 1 : 0;
        }

        counts.set(sectorId, current);
      }
    }
    return counts;
  }, [localItems, sectorAssignments]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sorted.findIndex((s) => s.sectorId === active.id);
    const newIndex = sorted.findIndex((s) => s.sectorId === String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(sorted, oldIndex, newIndex).map((entry, idx) => ({
      ...entry,
      sequenceOrder: idx + 1,
    }));

    onDragReorder(reordered);
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium">Orden de Ejecución</h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          Defina el orden en que el vehículo pasará por cada sector. Arrastre para reordenar o use las flechas.
        </p>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No hay sectores asignados</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sectorIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {sorted.map((entry, index) => (
                <SortableSectorCard
                  key={entry.sectorId}
                  entry={entry}
                  index={index}
                  totalCount={sorted.length}
                  sectorCounts={countsBySector.get(entry.sectorId) || { items: 0, repairTypes: 0 }}
                  onReorder={onReorder}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Visual timeline preview */}
      {sorted.length > 1 && (
        <div className="mt-4 pt-4 border-t">
          <p className="text-xs text-muted-foreground mb-3">Flujo del vehiculo:</p>
          <div className="flex items-center gap-0 overflow-x-auto py-1">
            {sorted.map((entry, index) => (
              <div key={entry.sectorId} className="flex items-center">
                <div className="flex flex-col items-center min-w-[80px]">
                  <div className="w-9 h-9 rounded-full border-2 border-primary bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                    {entry.sequenceOrder}
                  </div>
                  <span className="text-[10px] mt-1 text-center truncate max-w-[80px] font-medium">
                    {entry.sectorName}
                  </span>
                </div>
                {index < sorted.length - 1 && <div className="h-0.5 w-8 mx-1 bg-primary/30" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rejected items (informational only) */}
      <RejectedItemsList
        localItems={localItems}
        repairTypes={repairTypes}
        contextNote="no se incluirán en ninguna OT"
      />
    </div>
  );
}

export type { SectorOrderEntry };
