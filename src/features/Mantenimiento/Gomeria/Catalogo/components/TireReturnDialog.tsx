'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TireReturnWarehouseSelect } from '@/features/Mantenimiento/Gomeria/shared/TireReturnWarehouseSelect';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getTireWarehousesForSelect } from '../actions/actions.server';

interface TireReturnDialogProps {
  /** Número de serie de la cubierta que vuelve al stock. */
  serialNumber: string;
  isPending: boolean;
  onConfirm: (warehouseId: string) => void;
  onCancel: () => void;
}

/**
 * "Marcar como reparada / encontrada" de una cubierta que está afuera del stock (Almacenes
 * etapa 6): pide el depósito al que vuelve. Si hay uno solo, viene elegido.
 */
export function TireReturnDialog({ serialNumber, isPending, onConfirm, onCancel }: TireReturnDialogProps) {
  const [selected, setSelected] = useState('');
  const { data: warehouses = [], isLoading } = useQuery({
    queryKey: ['tire-warehouses-for-select'],
    queryFn: () => getTireWarehousesForSelect(),
    staleTime: 5 * 60 * 1000,
  });

  const warehouseId = selected || (warehouses.length === 1 ? warehouses[0].id : '');

  return (
    <Dialog open onOpenChange={(open) => !open && !isPending && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Devolver la cubierta al depósito</DialogTitle>
          <DialogDescription>
            La cubierta <strong>{serialNumber}</strong> está afuera del stock. Al marcarla como disponible vuelve al
            depósito que elijas.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando depósitos...</p>
        ) : warehouses.length === 0 ? (
          <p className="text-sm text-destructive">No hay depósitos activos para devolver la cubierta.</p>
        ) : (
          <TireReturnWarehouseSelect
            label="Depósito al que vuelve"
            warehouses={warehouses}
            value={warehouseId}
            onChange={setSelected}
          />
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => onConfirm(warehouseId)} disabled={!warehouseId || isPending}>
            {isPending ? 'Guardando...' : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
