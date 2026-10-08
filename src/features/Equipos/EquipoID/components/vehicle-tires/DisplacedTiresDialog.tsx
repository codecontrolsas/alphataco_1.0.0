'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTireReturnWarehouse } from '@/features/Mantenimiento/Gomeria/shared/hooks/useTireReturnWarehouse';
import { TireReturnWarehouseSelect } from '@/features/Mantenimiento/Gomeria/shared/TireReturnWarehouseSelect';
import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import type { DisplacedTireAction } from './actions.server';

export interface DisplacedTireInfo {
  tireId: string;
  serial: string;
  brand: string | null;
  positionNumber: number;
  /** Tiene stock en Almacenes: si vuelve a disponible, vuelve a un depósito. */
  hasStock: boolean;
}

interface DisplacedTiresDialogProps {
  vehicleId: string;
  open: boolean;
  tires: DisplacedTireInfo[];
  onConfirm: (actions: DisplacedTireAction[]) => void;
  onCancel: () => void;
}

type Destination = 'AVAILABLE' | 'REPAIR' | 'DISCARD';

const DESTINATION_LABELS: Record<Destination, string> = {
  AVAILABLE: 'Disponible',
  REPAIR: 'Reparación',
  DISCARD: 'Descarte',
};

export function DisplacedTiresDialog({ vehicleId, open, tires, onConfirm, onCancel }: DisplacedTiresDialogProps) {
  const [destinations, setDestinations] = useState<Record<string, Destination>>({});
  const returning = tires.some((t) => t.hasStock && destinations[t.tireId] === 'AVAILABLE');
  const returnWarehouse = useTireReturnWarehouse(vehicleId, open && tires.some((t) => t.hasStock));

  const allSelected = tires.every((t) => destinations[t.tireId]) && (!returning || !!returnWarehouse.warehouseId);

  function handleDestinationChange(tireId: string, destination: Destination) {
    setDestinations((prev) => ({ ...prev, [tireId]: destination }));
  }

  function handleConfirm() {
    const actions: DisplacedTireAction[] = tires.map((t) => ({
      tireId: t.tireId,
      destination: destinations[t.tireId],
      warehouseId: destinations[t.tireId] === 'AVAILABLE' ? returnWarehouse.warehouseId || null : null,
    }));
    onConfirm(actions);
  }

  const tireList = (
    <div className="flex flex-col gap-3">
      {tires.map((tire) => (
        <div key={tire.tireId} className="rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="font-mono font-medium">{tire.serial}</span>
              {tire.brand && <span className="text-xs text-muted-foreground">{tire.brand}</span>}
            </div>
            <Badge variant="secondary">Posición {tire.positionNumber}</Badge>
          </div>
          <RadioGroup
            className="flex flex-row gap-4"
            value={destinations[tire.tireId] ?? ''}
            onValueChange={(value) => handleDestinationChange(tire.tireId, value as Destination)}
          >
            {(Object.entries(DESTINATION_LABELS) as [Destination, string][]).map(([value, label]) => (
              <div key={value} className="flex items-center gap-2">
                <RadioGroupItem value={value} id={`${tire.tireId}-${value}`} />
                <Label htmlFor={`${tire.tireId}-${value}`} className="cursor-pointer">
                  {label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>
      ))}
    </div>
  );

  return (
    <AlertDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onCancel();
      }}
    >
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Neumáticos desplazados
          </AlertDialogTitle>
          <AlertDialogDescription>
            Los siguientes neumáticos quedarán sin posición al aplicar los cambios. Indicá qué hacer con cada uno.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-2">
          {tires.length > 3 ? <ScrollArea className="h-[300px] pr-3">{tireList}</ScrollArea> : tireList}
        </div>

        {returning && returnWarehouse.needsChoice && (
          <TireReturnWarehouseSelect
            label="Depósito al que vuelven las disponibles"
            warehouses={returnWarehouse.warehouses}
            value={returnWarehouse.warehouseId}
            onChange={returnWarehouse.setWarehouseId}
          />
        )}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={!allSelected}>
            Confirmar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
