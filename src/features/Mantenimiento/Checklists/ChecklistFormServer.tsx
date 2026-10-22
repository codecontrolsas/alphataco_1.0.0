import { fetchActiveCustomersForEquipment } from '@/features/Checklists/actions/actionsServer';
import {
  fetchChecklistTemplateById,
  fetchEquipmentUsageForChecklist,
  fetchFilteredEquipmentForChecklistByEquipment,
} from '@/features/Checklists/actions/checklist-queries';
import { NormalizedChecklistForm } from '@/features/Checklists/components/NormalizedChecklistForm';
import { getCurrentProfile } from '@/features/Formularios/actions/form-actions';
import { getMaintenanceEmployeeForEquipment } from '@/features/Mantenimiento/shared/actions/employee-session.server';
import { MaintenanceHeader } from '@/features/Mantenimiento/shared/components/maintenance-header';
import { mapEquipmentToChecklistFormat } from '@/lib/utils';
import { getSessionEmployeeIdClaim, getSessionUserId } from '@/shared/lib/session';
import { redirect } from 'next/navigation';

interface ChecklistFormServerProps {
  equipmentId: string;
  checklistId: string;
}

/**
 * Carga de un checklist para el equipo escaneado por el QR.
 *
 * Perímetro: TODO sale del `equipmentId` de la ruta. La plantilla se busca atada a la
 * empresa de ese equipo (un `checklistId` de otra empresa no se abre), el legajo del
 * operario se busca en esa misma empresa y la lista de equipos del combobox también.
 * `getActiveCompanyId()` no se usa: en este flujo no hay empresa activa.
 */
export async function ChecklistFormServer({ equipmentId, checklistId }: ChecklistFormServerProps) {
  const [userId, employeeId] = await Promise.all([getSessionUserId(), getSessionEmployeeIdClaim()]);

  if (!employeeId && !userId) {
    redirect('/maintenance');
  }

  const equipmentUsage = await fetchEquipmentUsageForChecklist(equipmentId);
  if (!equipmentUsage) {
    redirect('/maintenance?error=equipment_not_found');
  }

  const template = await fetchChecklistTemplateById(checklistId, { equipmentId });
  if (!template) {
    redirect(`/maintenance/equipment/${equipmentId}/checklists?error=template_not_found`);
  }

  const [employee, equipments, currentUserProfiles, customers] = await Promise.all([
    getMaintenanceEmployeeForEquipment(equipmentId),
    fetchFilteredEquipmentForChecklistByEquipment(template.id, equipmentId),
    userId ? getCurrentProfile() : Promise.resolve(null),
    fetchActiveCustomersForEquipment(equipmentId),
  ]);

  const equipmentsForComboBox = equipments.map(mapEquipmentToChecklistFormat);
  const selectedEquipment = equipments.find((equipment) => equipment.id === equipmentId);

  const currentUser = currentUserProfiles?.find((profile) => profile.credential_id === userId) || null;

  const employeeFullName = employee ? `${employee.firstname || ''} ${employee.lastname || ''}`.trim() : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <MaintenanceHeader
        title={template.name}
        showBack
        backHref={`/maintenance/equipment/${equipmentId}/checklists`}
        employeeName={employeeFullName}
        employeeCuil={employee?.cuil || null}
      />
      <main className="flex-1 p-4 pb-24">
        <NormalizedChecklistForm
          template={template}
          equipments={equipmentsForComboBox}
          customers={customers}
          currentUser={currentUser}
          defaultEquipmentId={equipmentId}
          defaultEmployeeId={employeeId || undefined}
          defaultEmployeeName={employeeFullName || undefined}
          defaultKilometer={selectedEquipment?.kilometer ?? equipmentUsage.kilometer ?? '0'}
          defaultHorometro={selectedEquipment?.engine_hours ?? equipmentUsage.engine_hours ?? '0'}
        />
      </main>
    </div>
  );
}
