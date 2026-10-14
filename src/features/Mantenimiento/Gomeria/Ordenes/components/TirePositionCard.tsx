'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { EnsuredTirePosition } from '../actions/service-order-queries.server';
import { EmptyPositionAssign } from './EmptyPositionAssign';
import { TireActionsWithTire } from './TireActionsWithTire';
import { TireInfoBadge } from './TireInfoBadge';

// ─── Props ───────────────────────────────────────────────────────────────────

interface TirePositionCardProps {
  position: EnsuredTirePosition;
  serviceOrderId: string;
  vehicleId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onActionComplete: () => void;
}

// ─── Main component ──────────────────────────────────────────────────────────

export function TirePositionCard({
  position,
  serviceOrderId,
  vehicleId,
  open,
  onOpenChange,
  onActionComplete,
}: TirePositionCardProps) {
  const hasTire = position.tire_id !== null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Posición {position.position_number}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Tire info header */}
          {hasTire && position.tire ? (
            <TireInfoBadge tire={position.tire} />
          ) : (
            <div className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
              Posición vacía — primera asignación
            </div>
          )}

          {/* Actions */}
          {hasTire ? (
            <TireActionsWithTire
              position={position}
              serviceOrderId={serviceOrderId}
              vehicleId={vehicleId}
              onActionComplete={onActionComplete}
              onClose={() => onOpenChange(false)}
            />
          ) : (
            <EmptyPositionAssign
              position={position}
              serviceOrderId={serviceOrderId}
              vehicleId={vehicleId}
              onActionComplete={onActionComplete}
              onClose={() => onOpenChange(false)}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
