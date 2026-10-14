'use client';

import { Skeleton } from '@/components/ui/skeleton';
import {
  TireDiagramRenderer,
  type DiagramAxle,
  type DiagramPosition,
} from '@/features/Mantenimiento/Gomeria/shared/TireDiagramRenderer';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ensureVehicleTirePositions, type EnsuredTirePosition } from '../actions/service-order-queries.server';
import { TirePositionCard } from './TirePositionCard';

// ─── Props ───────────────────────────────────────────────────────────────────

interface TireDiagramProps {
  vehicleId: string;
  serviceOrderId: string;
  label?: string;
  onInterventionDone?: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TireDiagram({ vehicleId, serviceOrderId, label, onInterventionDone }: TireDiagramProps) {
  const [selectedPosition, setSelectedPosition] = useState<EnsuredTirePosition | null>(null);
  const [highlightedPositions, setHighlightedPositions] = useState<number[]>([]);

  const {
    data: positions,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['vehicle-tire-positions', vehicleId],
    queryFn: () => ensureVehicleTirePositions(vehicleId),
    staleTime: 30 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-28 w-full max-w-xs" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        {error instanceof Error ? error.message : 'Error al cargar posiciones de cubiertas.'}
      </p>
    );
  }

  if (!positions || positions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No hay posiciones de cubiertas configuradas para este vehículo.</p>
    );
  }

  // Build DiagramAxle[] from the positions' template_axle data (unique by axle_number)
  const axleMap = new Map<string, DiagramAxle>();
  for (const pos of positions) {
    if (!pos.template_axle) continue;
    const key = pos.template_axle.id;
    if (!axleMap.has(key)) {
      axleMap.set(key, {
        id: pos.template_axle.id,
        axle_number: pos.template_axle.axle_number,
        tires_per_side: pos.template_axle.tires_per_side,
        tire_size: pos.template_axle.tire_size,
        is_drive_axle: pos.template_axle.is_drive_axle,
        is_spare: pos.template_axle.is_spare,
      });
    }
  }
  const axles: DiagramAxle[] = Array.from(axleMap.values());

  // Build DiagramPosition[]
  const diagramPositions: DiagramPosition[] = positions.map((p) => ({
    position_number: p.position_number,
    axle_number: p.axle_number,
    side: p.side as 'LEFT' | 'RIGHT' | 'SPARE',
    tire_id: p.tire_id,
    tire_serial: p.tire?.serial_number,
    tire_brand: p.tire?.brand?.name,
    tire_size: p.effective_tire_size ?? p.tire?.tire_type?.size ?? undefined,
  }));

  function handlePositionClick(positionNumber: number) {
    const pos = positions?.find((p) => p.position_number === positionNumber);
    if (pos) setSelectedPosition(pos);
  }

  function handleInterventionDone() {
    if (selectedPosition) {
      setHighlightedPositions((prev) =>
        prev.includes(selectedPosition.position_number) ? prev : [...prev, selectedPosition.position_number]
      );
    }
    onInterventionDone?.();
  }

  return (
    <>
      <TireDiagramRenderer
        axles={axles}
        positions={diagramPositions}
        interactive
        onPositionClick={handlePositionClick}
        highlightedPositions={highlightedPositions}
        label={label}
      />

      {selectedPosition && (
        <TirePositionCard
          position={selectedPosition}
          serviceOrderId={serviceOrderId}
          vehicleId={vehicleId}
          open={selectedPosition !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedPosition(null);
          }}
          onActionComplete={handleInterventionDone}
        />
      )}
    </>
  );
}
