import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';
import { ViewManagerServer } from '@/features/TabsManager/ViewManagerServer';
import { _EquipmentOrdersDataTable } from './equipment-orders/_EquipmentOrdersDataTable';
import { VehicleRejectedRequestsTable } from './rejected-requests/VehicleRejectedRequestsTable';

interface VehicleOperationsHistoryProps {
  equipmentId: string;
  searchParams: Record<string, string | string[] | undefined>;
}

/**
 * Sección "Mantenimiento" de la ficha del equipo, con dos vistas (`?mant_subtab=`):
 * - Órdenes de Mantenimiento: el trabajo que efectivamente se ejecutó o está en curso.
 * - Solicitudes Rechazadas: lo que se pidió y no se aprobó. Estas solicitudes no
 *   generan orden, y se quitaron del paso "Validar Solicitud" de Operaciones, así
 *   que este es el único lugar del sistema donde quedan registradas.
 *
 * Las vistas no declaran moduleSlug/tabSlug: heredan la protección de la sección padre
 * (`equipos` / `historial-mantenimiento-equipo`), que es también el permiso que exigen las
 * Server Actions de ambas tablas.
 */
export async function VehicleOperationsHistory({ equipmentId, searchParams }: VehicleOperationsHistoryProps) {
  const permissions = await getUserPermissionsMapServer();

  return (
    <ViewManagerServer
      paramName="mant_subtab"
      searchParams={searchParams}
      defaultView="orders"
      permissions={permissions}
      preserveParams={['action', 'id', 'type', 'tab']}
      ariaLabel="Tipo de registro de mantenimiento"
      views={[
        {
          value: 'orders',
          label: 'Órdenes',
          description: 'Trabajo ejecutado o en curso',
          content: <_EquipmentOrdersDataTable equipmentId={equipmentId} />,
        },
        {
          value: 'rejected',
          label: 'Solicitudes rechazadas',
          description: 'Pedidos que no se aprobaron',
          content: <VehicleRejectedRequestsTable equipmentId={equipmentId} />,
        },
      ]}
    />
  );
}
