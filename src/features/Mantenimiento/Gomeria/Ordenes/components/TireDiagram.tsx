'use client';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { TireDiagramHitch } from '@/features/Mantenimiento/Gomeria/shared/TireDiagramRenderer';
import { toDiagramPosition } from '@/features/Mantenimiento/Gomeria/shared/iso/diagram-position';
import {
  describePositionNumber,
  type DiagramAxle,
  type DiagramPosition,
} from '@/features/Mantenimiento/Gomeria/shared/tire-diagram-utils';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import dynamic from 'next/dynamic';
import { ensureVehicleTirePositions, type EnsuredTirePosition } from '../actions/service-order-queries.server';

// El diagrama isométrico no es lo primero de la pantalla: se carga bajo demanda y solo en el cliente.
const TireDiagramIso = dynamic(
  () => import('@/features/Mantenimiento/Gomeria/shared/iso/TireDiagramIso').then((m) => m.TireDiagramIso),
  { ssr: false, loading: () => <DiagramLoading /> }
);

function DiagramLoading() {
  return (
    <div className="space-y-2" role="status" aria-label="Cargando el diagrama de cubiertas">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-44 w-full" />
    </div>
  );
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface TireDiagramProps {
  vehicleId: string;
  label?: string;
  /** Texto de la cabina (solo el vehículo principal). */
  cabinLabel?: string;
  /** Extremo de enganche con el otro vehículo de la orden. */
  hitch?: TireDiagramHitch;
  /** Posición abierta en el panel (controlada por el asistente: un solo panel por orden). */
  selectedPositionNumber?: number | null;
  /** Posiciones ya intervenidas en esta orden para este vehículo. */
  highlightedPositions?: number[];
  onSelectPosition: (position: EnsuredTirePosition, positionLabel: string) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

/** Diagrama interactivo de un vehículo: cada posición es un botón, el detalle lo muestra el asistente. */
export function TireDiagram({
  vehicleId,
  label,
  cabinLabel,
  hitch,
  selectedPositionNumber = null,
  highlightedPositions = [],
  onSelectPosition,
}: TireDiagramProps) {
  const {
    data: positions,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['vehicle-tire-positions', vehicleId],
    queryFn: () => ensureVehicleTirePositions(vehicleId),
    staleTime: 30 * 1000,
  });

  if (isLoading) {
    return <DiagramLoading />;
  }

  if (error) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"
      >
        <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-destructive">
          {error instanceof Error ? error.message : 'Error al cargar posiciones de cubiertas.'}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (!positions || positions.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        No hay posiciones de cubiertas configuradas para este vehículo. Se definen asignándole una plantilla de
        cubiertas.
      </p>
    );
  }

  // Build DiagramAxle[] from the positions' template_axle data (unique by axle id)
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

  const diagramPositions: DiagramPosition[] = positions.map(toDiagramPosition);

  function handlePositionClick(positionNumber: number) {
    const pos = positions?.find((p) => p.position_number === positionNumber);
    if (pos) onSelectPosition(pos, describePositionNumber(positionNumber, axles));
  }

  return (
    <TireDiagramIso
      axles={axles}
      positions={diagramPositions}
      interactive
      onPositionClick={handlePositionClick}
      highlightedPositions={highlightedPositions}
      selectedPosition={selectedPositionNumber}
      label={label}
      cabinLabel={cabinLabel}
      hitch={hitch}
    />
  );
}
