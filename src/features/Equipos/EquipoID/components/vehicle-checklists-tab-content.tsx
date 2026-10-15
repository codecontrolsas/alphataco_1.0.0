'use client';

import { getPendingDeviations } from '@/features/Mantenimiento/actions/maintenance-actions';
import { PendingDeviationsAlert } from '@/features/Mantenimiento/shared/components/pending-deviations-alert';
import { useQuery } from '@tanstack/react-query';
import { EquipmentChecklistsDataTable } from './checklists/_EquipmentChecklistsDataTable';

interface VehicleChecklistsTabContentProps {
  equipmentId: string;
}

/**
 * Tab "Checklists" de la ficha del equipo: alerta de desvíos pendientes y el historial de respuestas
 * (paginado en el servidor).
 */
export function VehicleChecklistsTabContent({ equipmentId }: VehicleChecklistsTabContentProps) {
  // La alerta no bloquea la tabla: si todavía carga, simplemente no se muestra.
  const { data: pendingDeviations = [] } = useQuery({
    queryKey: ['equipment-pending-deviations', equipmentId],
    queryFn: () => getPendingDeviations(equipmentId),
    enabled: !!equipmentId,
    // Corto: los desvíos se resuelven desde Mantenimiento y la ficha debe mostrar los vigentes.
    staleTime: 30 * 1000,
  });

  return (
    <div className="space-y-6">
      {pendingDeviations.length > 0 && <PendingDeviationsAlert equipmentId={equipmentId} />}

      <EquipmentChecklistsDataTable equipmentId={equipmentId} />
    </div>
  );
}
