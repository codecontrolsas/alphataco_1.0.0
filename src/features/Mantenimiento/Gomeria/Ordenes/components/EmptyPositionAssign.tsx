'use client';

import { Button } from '@/components/ui/button';
import { unwrapAction } from '@/features/Warehouses/lib/unwrap-action';
import { Logger } from '@/lib/logger';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { performReplace } from '../actions/service-order-operations.server';
import type { AvailableTire, EnsuredTirePosition } from '../actions/service-order-queries.server';
import { TireReplacePicker } from './TireReplacePicker';

const logger = new Logger('features/Mantenimiento/Gomeria/Ordenes/EmptyPositionAssign');

interface EmptyPositionAssignProps {
  position: EnsuredTirePosition;
  serviceOrderId: string;
  vehicleId: string;
  onActionComplete: () => void;
  onClose: () => void;
}

/** Primera asignación de una cubierta a una posición vacía. */
export function EmptyPositionAssign({
  position,
  serviceOrderId,
  vehicleId,
  onActionComplete,
  onClose,
}: EmptyPositionAssignProps) {
  const queryClient = useQueryClient();
  const [selectedTire, setSelectedTire] = useState<AvailableTire | null>(null);

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTire) throw new Error('Seleccione una cubierta');
      return unwrapAction(
        await performReplace({
          serviceOrderId,
          positionNumber: position.position_number,
          vehicleId,
          tireId: null,
          newTireId: selectedTire.id,
        })
      );
    },
    onSuccess: () => {
      toast.success('Cubierta asignada a la posición');
      void queryClient.invalidateQueries({ queryKey: ['vehicle-tire-positions', vehicleId] });
      void queryClient.invalidateQueries({ queryKey: ['available-tires', vehicleId] });
      onActionComplete();
      onClose();
    },
    onError: (error) => {
      logger.error('Error assigning tire', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'Error al asignar cubierta');
    },
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Seleccione la cubierta a instalar en esta posición:
      </p>
      <TireReplacePicker vehicleId={vehicleId} selectedTireId={selectedTire?.id} onSelect={setSelectedTire} />
      <Button
        className="w-full"
        onClick={() => assignMutation.mutate()}
        disabled={!selectedTire || assignMutation.isPending}
      >
        {assignMutation.isPending ? 'Asignando...' : 'Asignar cubierta'}
      </Button>
    </div>
  );
}
