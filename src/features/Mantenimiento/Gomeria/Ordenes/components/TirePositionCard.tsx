'use client';

import { Button } from '@/components/ui/button';
import { Lock, X } from 'lucide-react';
import { useCallback } from 'react';
import type { EnsuredTirePosition } from '../actions/service-order-queries.server';
import { EmptyPositionAssign } from './EmptyPositionAssign';
import { TireActionsWithTire } from './TireActionsWithTire';
import { TireInfoBadge } from './TireInfoBadge';

// ─── Props ───────────────────────────────────────────────────────────────────

interface TirePositionCardProps {
  position: EnsuredTirePosition;
  serviceOrderId: string;
  vehicleId: string;
  /** "Posición 3 · Eje 2 · izquierda exterior" */
  positionLabel: string;
  /** Vehículo al que pertenece la posición (dominio), para no mezclar tractor y enganche. */
  vehicleLabel?: string;
  /** false cuando el usuario del dashboard no tiene `ordenes_gomeria:update`. */
  canOperate?: boolean;
  /** Recibe el texto de la intervención registrada. */
  onActionComplete: (summary: string) => void;
  onClose: () => void;
}

// ─── Main component ──────────────────────────────────────────────────────────

/**
 * Panel de una posición del diagrama. Va en línea junto al diagrama (no es un modal ni un
 * sheet) para que el asistente siga siendo un único flujo y no apile diálogos.
 */
export function TirePositionCard({
  position,
  serviceOrderId,
  vehicleId,
  positionLabel,
  vehicleLabel,
  canOperate = true,
  onActionComplete,
  onClose,
}: TirePositionCardProps) {
  const hasTire = position.tire_id !== null;

  // Al abrir el panel el foco pasa a su título (el panel se remonta por posición con `key`).
  const focusHeading = useCallback((node: HTMLHeadingElement | null) => {
    node?.focus();
  }, []);

  return (
    <section aria-labelledby="tire-position-panel-title" className="space-y-4 rounded-lg border bg-card p-4">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3
            id="tire-position-panel-title"
            ref={focusHeading}
            tabIndex={-1}
            className="text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {positionLabel}
          </h3>
          {vehicleLabel && <p className="text-xs text-muted-foreground">{vehicleLabel}</p>}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={onClose}
          aria-label="Cerrar el panel de la posición"
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </header>

      {hasTire && position.tire ? (
        <TireInfoBadge tire={position.tire} />
      ) : (
        <div className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
          Posición vacía — primera asignación
        </div>
      )}

      {!canOperate ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground"
        >
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Su rol no permite registrar intervenciones en órdenes de gomería. Requiere permiso de edición.
        </div>
      ) : hasTire ? (
        <TireActionsWithTire
          position={position}
          serviceOrderId={serviceOrderId}
          vehicleId={vehicleId}
          onActionComplete={onActionComplete}
          onClose={onClose}
        />
      ) : (
        <EmptyPositionAssign
          position={position}
          serviceOrderId={serviceOrderId}
          vehicleId={vehicleId}
          onActionComplete={onActionComplete}
          onClose={onClose}
        />
      )}
    </section>
  );
}
