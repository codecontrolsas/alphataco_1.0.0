import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Suspense } from 'react';
import { VehicleTiresSkeleton } from './fallback/VehicleTiresSkeleton';
import { VehicleTireDiagramSection } from './vehicle-tire-diagram-section';
import { VehicleTireOrdersList } from './vehicle-tire-orders-list';

// ============================================================================
// TYPES
// ============================================================================

interface VehicleTiresTabProps {
  vehicleId: string;
  permissionsMap: Record<string, boolean>;
  searchParams?: DataTableSearchParams;
}

// ============================================================================
// COMPONENT
// ============================================================================

export async function VehicleTiresTab({ vehicleId, permissionsMap, searchParams = {} }: VehicleTiresTabProps) {
  const canUpdate = permissionsMap['equipos:cubiertas-equipo:update'] === true;

  return (
    <div className="space-y-6">
      {/* Tire diagram + template config */}
      <VehicleTireDiagramSection vehicleId={vehicleId} canUpdate={canUpdate} />

      {/* Orders history */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold">Historial de Órdenes de Gomería</h3>
        <Suspense fallback={<VehicleTiresSkeleton ordersOnly />}>
          <VehicleTireOrdersList vehicleId={vehicleId} searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}
