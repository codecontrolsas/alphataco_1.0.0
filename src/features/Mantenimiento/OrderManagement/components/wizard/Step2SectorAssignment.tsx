'use client';

import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { RepairGroupBadge } from '@/features/Mantenimiento/shared/components/RepairGroupBadge';
import { RepairItemPhotos } from '@/features/Mantenimiento/shared/components/RepairItemPhotos';
import { SearchableSelect } from '@/features/Mantenimiento/shared/components/SearchableSelect';
import { getRepairItemGroupName, getRepairItemImages } from '@/features/Mantenimiento/shared/repair-item-label';
import { Logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';
import { getSectorCandidatesForRepairTypes, type WorkshopSector } from '../../actions/queries.server';
import type { LocalItem } from '../ManageOrderWizard';
import { RejectedItemsList } from './RejectedItemsList';
import { getItemLabel, getItemRepairTypeIds as getRepairTypeIds } from './helpers';

const logger = new Logger('Step2SectorAssignment');

interface Step2SectorAssignmentProps {
  localItems: LocalItem[];
  sectors: WorkshopSector[];
  sectorAssignments: Map<string, string>; // itemId → sectorId
  onAssignmentChange: (itemId: string, sectorId: string) => void;
  onBatchAssignment: (assignments: Map<string, string>) => void;
  repairTypes: Array<{ id: string; name: string }>;
}

interface ItemAssignmentInfo {
  item: LocalItem;
  repairTypeIds: string[];
  repairTypeNames: string[];
  candidateSectorIds: string[];
  assignedSectorId: string | null;
  status: 'auto' | 'ambiguous' | 'manual' | 'already_assigned';
}

export function Step2SectorAssignment({
  localItems,
  sectors,
  sectorAssignments,
  onAssignmentChange,
  onBatchAssignment,
  repairTypes,
}: Step2SectorAssignmentProps) {
  const regularItems = useMemo(
    () => localItems.filter((item) => !item.is_diagnostico && !item._deleted && !item.work_order_id && !item._rejected),
    [localItems]
  );

  // Collect all unique repair type IDs from all items
  const allRepairTypeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of regularItems) {
      const itemRtIds = getRepairTypeIds(item);
      itemRtIds.forEach((id) => ids.add(id));
    }
    return Array.from(ids);
  }, [regularItems]);

  // Query sector_repair_types mapping
  const { data: sectorCandidates, isLoading } = useQuery({
    queryKey: ['sector-candidates', allRepairTypeIds],
    queryFn: () => getSectorCandidatesForRepairTypes(allRepairTypeIds),
    enabled: allRepairTypeIds.length > 0,
    staleTime: 0,
  });

  // Build mapping: repairTypeId → sectorIds[]
  const repairTypeToSectors = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!sectorCandidates) return map;

    for (const candidate of sectorCandidates) {
      const rtId = candidate.repair_type_id;
      const sectorId = candidate.workshop_sector_id;
      if (!map.has(rtId)) {
        map.set(rtId, []);
      }
      map.get(rtId)!.push(sectorId);
    }
    return map;
  }, [sectorCandidates]);

  // Compute assignment info for each item
  const itemAssignments: ItemAssignmentInfo[] = useMemo(() => {
    return regularItems.map((item) => {
      const repairTypeIds = getRepairTypeIds(item);
      const repairTypeNames = repairTypeIds
        .map((id) => repairTypes.find((rt) => rt.id === id)?.name)
        .filter((n): n is string => !!n);

      // If item already has sector assigned from DB
      if (item.assigned_sector_id && !item._isTemp) {
        return {
          item,
          repairTypeIds,
          repairTypeNames,
          candidateSectorIds: [item.assigned_sector_id],
          assignedSectorId: sectorAssignments.get(item.id) || item.assigned_sector_id,
          status: 'already_assigned' as const,
        };
      }

      // Find candidate sectors via intersection
      const candidateSectorIds = findCandidateSectors(repairTypeIds, repairTypeToSectors);

      const assignedSectorId = sectorAssignments.get(item.id) || null;

      let status: ItemAssignmentInfo['status'];
      if (candidateSectorIds.length === 1) {
        status = 'auto';
      } else if (candidateSectorIds.length > 1) {
        status = 'ambiguous';
      } else {
        status = 'manual';
      }

      return {
        item,
        repairTypeIds,
        repairTypeNames,
        candidateSectorIds,
        assignedSectorId,
        status,
      };
    });
  }, [regularItems, repairTypeToSectors, sectorAssignments, repairTypes]);

  // Auto-assign items that have exactly 1 candidate sector (on first render only)
  const performAutoAssignment = useCallback(() => {
    const newAssignments = new Map(sectorAssignments);
    let changed = false;

    for (const info of itemAssignments) {
      if (info.status === 'auto' && !sectorAssignments.has(info.item.id)) {
        newAssignments.set(info.item.id, info.candidateSectorIds[0]);
        changed = true;
      }
    }

    if (changed) {
      onBatchAssignment(newAssignments);
    }
  }, [itemAssignments, sectorAssignments, onBatchAssignment]);

  // Run auto-assignment when candidates data loads
  useEffect(() => {
    if (sectorCandidates && !isLoading) {
      performAutoAssignment();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectorCandidates, isLoading]);

  // Group items by status for display
  const autoAssigned = itemAssignments.filter((i) => i.status === 'auto' || i.status === 'already_assigned');
  const needsManualSelection = itemAssignments.filter((i) => i.status === 'ambiguous' || i.status === 'manual');

  // Count unassigned
  const unassignedCount = itemAssignments.filter((i) => !i.assignedSectorId && i.status !== 'already_assigned').length;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h4 className="text-sm font-medium">Asignación de Sectores</h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          Los desvíos se asignan automáticamente según los tipos de reparación configurados en cada sector.
        </p>
      </div>

      {/* Warning for unassigned items */}
      {unassignedCount > 0 && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-warn-subtle border border-warn/30 text-warn-subtle-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-xs">{unassignedCount} desvío(s) necesitan asignación manual de sector.</span>
        </div>
      )}

      {/* Auto-assigned section */}
      {autoAssigned.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-ok" />
            <span className="text-sm font-medium">Auto-asignados ({autoAssigned.length})</span>
          </div>
          <div className="space-y-1.5">
            {autoAssigned.map((info) => {
              const sectorId = info.assignedSectorId;
              const sectorName = sectorId ? sectors.find((s) => s.id === sectorId)?.name || 'Desconocido' : '—';
              const label = getItemLabel(info.item);
              const images = getRepairItemImages(info.item);

              return (
                <div
                  key={info.item.id}
                  className="flex items-start justify-between p-2.5 border rounded-lg bg-muted/30 border-border"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {info.repairTypeNames.map((name, idx) => (
                        <Badge key={idx} variant="default" className="text-xs px-2 py-0.5">
                          {name}
                        </Badge>
                      ))}
                      <RepairGroupBadge groupName={getRepairItemGroupName(info.item)} />
                    </div>
                    {label && <p className="text-xs text-muted-foreground mt-1 truncate">{label}</p>}
                    {/* La foto es lo que dice si el desvio es soldadura, gomeria o
                        mecanica: sin verla no se puede validar la auto-asignacion */}
                    {images.length > 0 && (
                      <RepairItemPhotos images={images} label={label} size="sm" className="mt-1.5" />
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className="ml-2 shrink-0 bg-ok-subtle border-ok/30 text-ok-subtle-foreground"
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {sectorName}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {autoAssigned.length > 0 && needsManualSelection.length > 0 && <Separator />}

      {/* Manual selection section */}
      {needsManualSelection.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-warn" />
            <span className="text-sm font-medium">Requieren selección manual ({needsManualSelection.length})</span>
          </div>
          <div className="space-y-2">
            {needsManualSelection.map((info) => {
              const availableSectors =
                info.candidateSectorIds.length > 0
                  ? sectors.filter((s) => info.candidateSectorIds.includes(s.id))
                  : sectors;
              const label = getItemLabel(info.item);
              const images = getRepairItemImages(info.item);

              return (
                <div
                  key={info.item.id}
                  className={cn(
                    'p-3 border rounded-lg',
                    info.assignedSectorId
                      ? 'border-border bg-muted/20'
                      : 'border-warn/30 bg-warn-subtle/30'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {info.repairTypeNames.length > 0 ? (
                          info.repairTypeNames.map((name, idx) => (
                            <Badge key={idx} variant="default" className="text-xs px-2 py-0.5">
                              {name}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="secondary" className="text-xs px-2 py-0.5">
                            Sin tipo
                          </Badge>
                        )}
                        <RepairGroupBadge groupName={getRepairItemGroupName(info.item)} />
                      </div>
                      {label && <p className="text-xs text-muted-foreground mt-1 truncate">{label}</p>}
                      {/* Estos son los desvios que el jefe de taller tiene que rutear a
                          mano: la foto es el unico dato que le dice a que sector van */}
                      {images.length > 0 && (
                        <RepairItemPhotos images={images} label={label} size="sm" className="mt-1.5" />
                      )}
                    </div>
                    <div className="shrink-0 w-44">
                      <Label className="text-xs text-muted-foreground">Sector</Label>
                      {/* Combobox con buscador: la lista de sectores es larga y
                          escribir es mas rapido que recorrerla a mano. */}
                      <SearchableSelect
                        value={info.assignedSectorId || ''}
                        onValueChange={(value) => onAssignmentChange(info.item.id, value)}
                        options={availableSectors.map((sector) => ({ value: sector.id, label: sector.name }))}
                        placeholder="Seleccionar..."
                        searchPlaceholder="Buscar sector..."
                        emptyMessage="No se encontro el sector"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All assigned message */}
      {regularItems.length > 0 && unassignedCount === 0 && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-ok-subtle border border-ok/30 text-ok-subtle-foreground">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="text-xs font-medium">Todos los desvíos tienen sector asignado.</span>
        </div>
      )}

      {/* Rejected items (informational only) */}
      <RejectedItemsList
        localItems={localItems}
        repairTypes={repairTypes}
        contextNote="no se asignarán a ningún sector"
      />
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────

// getItemRepairTypeIds imported from ./helpers as getRepairTypeIds

/**
 * Finds candidate sectors for an item by intersecting sectors that handle
 * ALL of the item's repair types.
 */
function findCandidateSectors(repairTypeIds: string[], repairTypeToSectors: Map<string, string[]>): string[] {
  if (repairTypeIds.length === 0) return [];

  // Get sector sets for each repair type
  const sectorSets = repairTypeIds
    .map((rtId) => repairTypeToSectors.get(rtId))
    .filter((set): set is string[] => !!set && set.length > 0);

  if (sectorSets.length === 0) return [];

  // If not all repair types have mappings, no guaranteed intersection
  if (sectorSets.length < repairTypeIds.length) return [];

  // Intersect all sets
  let intersection = new Set(sectorSets[0]);
  for (let i = 1; i < sectorSets.length; i++) {
    const currentSet = new Set(sectorSets[i]);
    intersection = new Set([...intersection].filter((id) => currentSet.has(id)));
  }

  return Array.from(intersection);
}
