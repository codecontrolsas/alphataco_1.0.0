import { getSessionRoleForEquipment } from '@/features/Mantenimiento/EquipmentDashboard/actions/equipment-access.server';
import { fetchEquipmentForDashboard } from '@/features/Mantenimiento/EquipmentDashboard/actions/equipment-dashboard.server';
import EquipmentDashboardClient from '@/features/Mantenimiento/EquipmentDashboard/components/equipment-dashboard-client';
import { getMaintenanceEmployeeForEquipment } from '@/features/Mantenimiento/shared/actions/employee-session.server';
import { getEquipmentModules, isRouteEnabled } from '@/features/Modules/server/public-routes.server';
import {
  getSessionDisplayName,
  getSessionEmployeeIdClaim,
  getSessionUserId,
  isSessionAnonymous,
} from '@/shared/lib/session';
import { redirect } from 'next/navigation';

/**
 * Dashboard del equipo escaneado por el QR.
 *
 * Todo el perímetro sale del `equipmentId` de la ruta: acá no hay empresa activa (la sesión
 * es anónima o de un invitado) y ninguna lectura puede depender de `getActiveCompanyId()`.
 */
export async function EquipmentDashboardServer({ equipmentId }: { equipmentId: string }) {
  const [userId, employeeId] = await Promise.all([getSessionUserId(), getSessionEmployeeIdClaim()]);

  if (!employeeId && !userId) {
    redirect('/maintenance');
  }

  const equipment = await fetchEquipmentForDashboard(equipmentId);

  if (!equipment) {
    redirect('/maintenance?error=equipment_not_found');
  }

  // El rol se resuelve contra la empresa DEL EQUIPO, no contra la de la sesión.
  const [role, displayName, isAnonymous, employee, enabledModules] = await Promise.all([
    userId ? getSessionRoleForEquipment(equipmentId) : Promise.resolve(null),
    getSessionDisplayName(),
    isSessionAnonymous(),
    getMaintenanceEmployeeForEquipment(equipmentId),
    getEquipmentModules(equipmentId),
  ]);

  // Cada opción se ofrece solo si el módulo dueño de su URL está encendido para la empresa del equipo (F3.3).
  const isOptionEnabled = (suffix: string) =>
    !enabledModules || isRouteEnabled(`/maintenance/equipment/${equipmentId}/${suffix}`, enabledModules);

  // El encabezado recibe el legajo resuelto acá. Si no se lo pasáramos, caería a su hook
  // de cliente, que deriva la empresa de la SESIÓN — y en el QR la empresa sale del equipo.
  return (
    <EquipmentDashboardClient
      equipment={equipment}
      equipmentId={equipmentId}
      isGuest={role === 'Invitado'}
      isAnonymous={isAnonymous}
      options={{
        request: isOptionEnabled('request'),
        checklists: isOptionEnabled('checklists'),
        tireService: isOptionEnabled('tire-service'),
      }}
      employeeName={employee ? `${employee.firstname} ${employee.lastname}` : displayName ?? null}
      employeeCuil={employee?.cuil ?? null}
    />
  );
}
