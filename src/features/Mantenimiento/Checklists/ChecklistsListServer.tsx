import { fetchChecklistTemplatesForEquipment } from '@/features/Checklists/actions/checklist-equipment-templates';
import ChecklistsListClient from '@/features/Mantenimiento/Checklists/components/checklists-list-client';
import { getMaintenanceEmployeeForEquipment } from '@/features/Mantenimiento/shared/actions/employee-session.server';
import { getSessionEmployeeIdClaim, getSessionUserId } from '@/shared/lib/session';
import { redirect } from 'next/navigation';

/**
 * Plantillas de checklist aplicables al equipo escaneado por el QR.
 *
 * La empresa, el tipo y el subtipo salen del equipo de la ruta, nunca de la sesión: este
 * flujo corre sin empresa activa.
 */
export async function ChecklistsListServer({ equipmentId }: { equipmentId: string }) {
  const [userId, employeeId] = await Promise.all([getSessionUserId(), getSessionEmployeeIdClaim()]);

  if (!employeeId && !userId) {
    redirect('/maintenance');
  }

  const result = await fetchChecklistTemplatesForEquipment(equipmentId);

  if (result.status === 'not_found') {
    redirect('/maintenance?error=equipment_not_found');
  }
  // Un fallo de consulta no se disfraza de "este equipo no tiene checklists".
  if (result.status === 'error') {
    redirect(`/maintenance/equipment/${equipmentId}?error=checklists_unavailable`);
  }

  // El encabezado recibe el legajo resuelto acá. Si no se lo pasáramos, caería a su hook de
  // cliente, que deriva la empresa de la SESIÓN — y en el QR la empresa sale del equipo.
  const employee = await getMaintenanceEmployeeForEquipment(equipmentId);

  return (
    <ChecklistsListClient
      equipmentId={equipmentId}
      employeeName={employee ? `${employee.firstname} ${employee.lastname}` : null}
      employeeCuil={employee?.cuil ?? null}
      checklists={result.templates.map((checklist) => ({
        id: checklist.id,
        name: checklist.name,
        form: { description: checklist.description ?? checklist.name, title: checklist.name },
        created_at: checklist.created_at ? checklist.created_at.toISOString() : new Date().toISOString(),
      }))}
    />
  );
}
