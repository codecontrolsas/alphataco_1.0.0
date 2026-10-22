'use client';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { RepairGroupBadge } from '@/features/Mantenimiento/shared/components/RepairGroupBadge';
import { RepairItemPhotos } from '@/features/Mantenimiento/shared/components/RepairItemPhotos';
import { getRepairItemGroupName, getRepairItemImages } from '@/features/Mantenimiento/shared/repair-item-label';
import { ClipboardList, Info } from 'lucide-react';
import { useMemo } from 'react';
import type { LocalItem } from '../ManageOrderWizard';
import { RejectedItemsList } from './RejectedItemsList';
import type { SectorOrderEntry } from './Step3ExecutionOrder';
import { getItemLabel, getItemRepairTypeNames } from './helpers';

interface Step4ConfirmProps {
  localItems: LocalItem[];
  sectorAssignments: Map<string, string>;
  sectorOrder: SectorOrderEntry[];
  repairTypes: Array<{ id: string; name: string }>;
  plannedStartDate: string;
  plannedEndDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
}

interface SectorPreview {
  sectorId: string;
  sectorName: string;
  sequenceOrder: number;
  items: LocalItem[];
  repairTypeNames: string[];
  totalRepairTypeCount: number;
}

export function Step4Confirm({
  localItems,
  sectorAssignments,
  sectorOrder,
  repairTypes,
  plannedStartDate,
  plannedEndDate,
  onStartDateChange,
  onEndDateChange,
}: Step4ConfirmProps) {
  const regularItems = useMemo(
    () => localItems.filter((item) => !item.is_diagnostico && !item._deleted && !item.work_order_id && !item._rejected),
    [localItems]
  );

  // Build sector previews (grouped items)
  const sectorPreviews: SectorPreview[] = useMemo(() => {
    const sortedSectors = [...sectorOrder].sort((a, b) => a.sequenceOrder - b.sequenceOrder);

    return sortedSectors.map((entry) => {
      const sectorItems = regularItems.filter((item) => {
        const assignedSector = sectorAssignments.get(item.id) || item.assigned_sector_id;
        return assignedSector === entry.sectorId;
      });

      // Collect all repair type names for this sector
      const repairTypeNameSet = new Set<string>();
      let totalRepairTypeCount = 0;
      for (const item of sectorItems) {
        const rtNames = getItemRepairTypeNames(item, repairTypes);
        rtNames.forEach((name) => repairTypeNameSet.add(name));
        totalRepairTypeCount += rtNames.length;
      }

      return {
        sectorId: entry.sectorId,
        sectorName: entry.sectorName,
        sequenceOrder: entry.sequenceOrder,
        items: sectorItems,
        repairTypeNames: Array.from(repairTypeNameSet),
        totalRepairTypeCount,
      };
    });
  }, [regularItems, sectorAssignments, sectorOrder, repairTypes]);

  const totalOTs = sectorPreviews.length;
  // Fechas `YYYY-MM-DD`: la comparación de texto es la cronológica y no depende de la zona horaria.
  const dateError = plannedEndDate < plannedStartDate;

  return (
    <div className="space-y-5">
      <div>
        <h4 className="text-sm font-medium">Confirmar Generación</h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          Se generarán {totalOTs} órdenes de trabajo, una por cada sector asignado.
        </p>
      </div>

      {/* OT previews */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Órdenes a generar ({totalOTs})</span>
        </div>

        {/* Diagnostic note */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span className="text-xs">Cada OT incluye diagnóstico automático del sector.</span>
        </div>

        {sectorPreviews.map((preview, index) => (
          <div key={preview.sectorId} className="p-3 border rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
                  {index + 1}
                </div>
                <Badge variant="default">{preview.sectorName}</Badge>
              </div>
              <span className="text-xs text-muted-foreground">
                {preview.items.length} {preview.items.length === 1 ? 'solicitud' : 'solicitudes'} ·{' '}
                {preview.totalRepairTypeCount + 1} {preview.totalRepairTypeCount + 1 === 1 ? 'tarea' : 'tareas'}
              </span>
            </div>

            {/* Desvíos in this OT */}
            <div className="pl-8 space-y-1.5">
              {preview.items.map((item) => {
                const label = getItemLabel(item);
                const images = getRepairItemImages(item);
                return (
                  <div key={item.id} className="space-y-1 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      {getItemRepairTypeNames(item, repairTypes).map((name, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs px-2 py-0.5">
                          {name}
                        </Badge>
                      ))}
                      <RepairGroupBadge groupName={getRepairItemGroupName(item)} />
                      {label && <span className="text-muted-foreground truncate">{label}</span>}
                    </div>
                    {/* Ultimo control antes de generar las OTs: que la foto siga
                        acompañando al desvio que se va a mandar al sector */}
                    {images.length > 0 && <RepairItemPhotos images={images} label={label} size="sm" />}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <Separator />

      {/* Planned dates */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium">Fechas planificadas</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">Fecha inicio</Label>
            <Input type="date" value={plannedStartDate} onChange={(e) => onStartDateChange(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Fecha fin</Label>
            <Input type="date" value={plannedEndDate} onChange={(e) => onEndDateChange(e.target.value)} />
          </div>
        </div>
        {dateError && <p className="text-xs text-destructive">La fecha de fin debe ser posterior a la de inicio.</p>}
      </div>

      {/* Rejected items (informational only) */}
      <RejectedItemsList
        localItems={localItems}
        repairTypes={repairTypes}
        contextNote="no se incluirán en ninguna OT"
      />
    </div>
  );
}

// getItemRepairTypeNames and getItemLabel imported from ./helpers
