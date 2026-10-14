'use client';

import { TabsManagerClientSide } from '@/features/TabsManager/TabsManagerClientSide';
import { _EquipmentOrdersDataTable } from './equipment-orders/_EquipmentOrdersDataTable';
import { VehicleRejectedRequestsTable } from './rejected-requests/VehicleRejectedRequestsTable';

interface VehicleOperationsHistoryProps {
  equipmentId: string;
}

/**
 * Tab "Historial de Mantenimiento" del legajo del equipo.
 *
 * Se divide en dos sub-tabs:
 * - Órdenes de Mantenimiento: el trabajo que efectivamente se ejecutó o está en curso.
 * - Solicitudes Rechazadas: lo que se pidió y no se aprobó. Estas solicitudes no
 *   generan orden, y se quitaron del paso "Validar Solicitud" de Operaciones, así
 *   que este es el único lugar del sistema donde quedan registradas.
 *
 * Las sub-tabs no declaran moduleSlug/tabSlug: heredan la protección de la tab padre
 * (`equipos` / `historial-mantenimiento-equipo`), que es también el permiso que exigen las
 * Server Actions de ambas tablas.
 */
export function VehicleOperationsHistory({ equipmentId }: VehicleOperationsHistoryProps) {
  return (
    <TabsManagerClientSide
      paramName="mant_subtab"
      defaultTab="orders"
      tabs={[
        {
          value: 'orders',
          label: 'Órdenes de Mantenimiento',
          content: <_EquipmentOrdersDataTable equipmentId={equipmentId} />,
        },
        {
          value: 'rejected',
          label: 'Solicitudes Rechazadas',
          content: <VehicleRejectedRequestsTable equipmentId={equipmentId} />,
        },
      ]}
    />
  );
}
