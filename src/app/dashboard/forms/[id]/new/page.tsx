import { fetchActiveCustomersForChecklist, fetchActiveEmployeesForChecklist } from '@/features/Checklists';
import {
  fetchChecklistTemplateById,
  fetchFilteredEquipmentForChecklist,
} from '@/features/Checklists/actions/checklist-queries';
import { NormalizedChecklistForm } from '@/features/Checklists/components/NormalizedChecklistForm';
import { fetchCustomFormById, getCurrentProfile } from '@/features/Formularios/actions/form-actions';
import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { mapEquipmentToChecklistFormat } from '@/lib/utils';
import BackButton from '@/shared/components/common/BackButton';

async function page({ params }: { params: Promise<{ id: string }> }) {
  // En Next.js 15+, params es una Promise, necesitamos hacer await
  const resolvedParams = await params;

  const [currentUserProfile, canSubmit] = await Promise.all([
    getCurrentProfile(),
    checkPermissionServer('formularios', 'formularios', 'create'),
  ]);
  const currentUser = currentUserProfile && currentUserProfile.length > 0 ? currentUserProfile[0] : null;

  // Intentar obtener el checklist desde la nueva estructura normalizada
  const checklistTemplate = await fetchChecklistTemplateById(resolvedParams.id);

  // Si no existe en la nueva estructura, intentar con la antigua
  const formInfo = checklistTemplate ? null : await fetchCustomFormById(resolvedParams.id);

  // Obtener equipos filtrados optimizados (solo si es checklist normalizado)
  let equipments: Awaited<ReturnType<typeof mapEquipmentToChecklistFormat>>[] = [];
  let customers: { id: string; name: string }[] = [];
  let employees: { id: string; fullName: string; document: string | null }[] = [];

  if (checklistTemplate) {
    // Usar función optimizada que filtra directamente en la base de datos
    const [filteredEquipments, activeCustomers, activeEmployees] = await Promise.all([
      fetchFilteredEquipmentForChecklist(resolvedParams.id),
      fetchActiveCustomersForChecklist(),
      fetchActiveEmployeesForChecklist(),
    ]);
    equipments = filteredEquipments.map(mapEquipmentToChecklistFormat);
    customers = activeCustomers;
    employees = activeEmployees;
  }

  // Si es un checklist de la nueva estructura
  if (checklistTemplate) {
    return (
      <div className="px-7 py-4">
        <div className="flex items-center gap-4 mb-6">
          <BackButton />
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{checklistTemplate.name}</h1>
            {checklistTemplate.description && <p className="text-muted-foreground">{checklistTemplate.description}</p>}
          </div>
        </div>
        <NormalizedChecklistForm
          shouldDisabledInputs={false}
          template={checklistTemplate}
          equipments={equipments}
          customers={customers}
          employees={employees}
          currentUser={currentUser}
          canSubmit={canSubmit}
        />
      </div>
    );
  }

  // Si es un formulario de la estructura antigua
  if (formInfo && formInfo.length > 0) {
    return (
      <div className="px-7">
        <div className="p-4 border rounded-lg">
          <p className="text-muted-foreground">
            Formulario de estructura antigua detectado. La nueva implementación de checklists está en desarrollo.
          </p>
          <p className="text-sm text-gray-500 mt-2">Formulario: {formInfo[0].name}</p>
        </div>
      </div>
    );
  }

  // Si no se encuentra ningún formulario
  return (
    <div className="px-7">
      <div className="p-4 border rounded-lg">
        <p className="text-red-600">No se encontró el formulario con ID: {resolvedParams.id}</p>
      </div>
    </div>
  );
}

export default page;
