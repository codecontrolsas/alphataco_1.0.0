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
import { StateBlock } from '@/shared/components/common/StateBlock';

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6 px-4 py-4 sm:px-7">{children}</div>;
}

async function page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [canView, canSubmit] = await Promise.all([
    checkPermissionServer('formularios', 'formularios', 'view'),
    checkPermissionServer('formularios', 'formularios', 'create'),
  ]);

  if (!canView) {
    return (
      <Shell>
        <BackButton />
        <StateBlock variant="noperm" title="No tenés permiso para ver formularios" />
      </Shell>
    );
  }

  // Todo depende solo del id de la URL: plantilla normalizada, formulario legacy y opciones del form en paralelo.
  const [currentUserProfile, checklistTemplate, formInfo, filteredEquipments, customers, employees] = await Promise.all(
    [
      getCurrentProfile(),
      fetchChecklistTemplateById(id),
      fetchCustomFormById(id),
      fetchFilteredEquipmentForChecklist(id),
      fetchActiveCustomersForChecklist(),
      fetchActiveEmployeesForChecklist(),
    ]
  );
  const currentUser = currentUserProfile.length > 0 ? currentUserProfile[0] : null;

  if (checklistTemplate) {
    return (
      <Shell>
        <div className="flex items-center gap-4">
          <BackButton />
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{checklistTemplate.name}</h1>
            {checklistTemplate.description && <p className="text-muted-foreground">{checklistTemplate.description}</p>}
          </div>
        </div>
        <NormalizedChecklistForm
          shouldDisabledInputs={false}
          template={checklistTemplate}
          equipments={filteredEquipments.map(mapEquipmentToChecklistFormat)}
          customers={customers}
          employees={employees}
          currentUser={currentUser}
          canSubmit={canSubmit}
        />
      </Shell>
    );
  }

  // Formulario de la estructura antigua: todavía no se pueden cargar respuestas desde acá.
  if (formInfo.length > 0) {
    return (
      <Shell>
        <BackButton />
        <StateBlock
          variant="empty"
          title={formInfo[0].name}
          description="Este formulario es de la estructura anterior y todavía no admite cargar respuestas."
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <BackButton />
      <StateBlock variant="error" title="No se encontró el formulario" description={`ID: ${id}`} />
    </Shell>
  );
}

export default page;
