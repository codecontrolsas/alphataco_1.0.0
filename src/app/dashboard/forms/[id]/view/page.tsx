import { fetchChecklistAnswerById, fetchChecklistTemplateById } from '@/features/Checklists/actions/checklist-queries';
import { NormalizedChecklistForm } from '@/features/Checklists/components/NormalizedChecklistForm';
import {
  fetchAnswerById,
  fetchEquipmentsByIdsForChecklist,
  getCurrentProfile,
} from '@/features/Formularios/actions/form-actions';
import { readAnswerData } from '@/features/Formularios/utils/checklistView';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { mapEquipmentToChecklistFormat } from '@/lib/utils';
import BackButton from '@/shared/components/common/BackButton';
import { StateBlock } from '@/shared/components/common/StateBlock';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6 px-4 py-4 sm:px-7">
      <BackButton />
      {children}
    </div>
  );
}

/** Respuesta vista por su propio id (ruta `/dashboard/forms/[id]/view`, donde `id` es el de la respuesta). */
async function page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const canView = await checkPermissionServer('formularios', 'formularios', 'view');
  if (!canView) {
    return (
      <Shell>
        <StateBlock variant="noperm" title="No tenés permiso para ver formularios" />
      </Shell>
    );
  }

  // Respuesta de checklist normalizado y perfil no dependen entre sí.
  const [normalizedAnswer, currentUserProfile] = await Promise.all([fetchChecklistAnswerById(id), getCurrentProfile()]);

  if (normalizedAnswer) {
    const answerData = readAnswerData(normalizedAnswer.answer_data);
    const hitchEquipmentId = normalizedAnswer.hitch_equipment_id;

    const [template, equipmentRows] = await Promise.all([
      normalizedAnswer.template_id ? fetchChecklistTemplateById(normalizedAnswer.template_id) : null,
      fetchEquipmentsByIdsForChecklist([normalizedAnswer.equipment_id, hitchEquipmentId ?? ''].filter(Boolean)),
    ]);

    if (!template) {
      return (
        <Shell>
          <StateBlock variant="error" title="No se encontró la plantilla del formulario" />
        </Shell>
      );
    }

    const defaultAnswers = {
      equipment_id: normalizedAnswer.equipment_id,
      chofer: answerData.chofer,
      fecha: answerData.fecha,
      hora: answerData.hora,
      kilometraje: answerData.kilometraje,
      horometro: answerData.horometro,
      observaciones: normalizedAnswer.observations || '',
      ...answerData.answers, // Respuestas por sección
    };

    return (
      <Shell>
        <div>
          <h1 className="text-2xl font-bold">{template.name}</h1>
          {template.description && <p className="text-muted-foreground">{template.description}</p>}
        </div>
        <NormalizedChecklistForm
          template={template}
          equipments={equipmentRows.map(mapEquipmentToChecklistFormat)}
          currentUser={currentUserProfile.length > 0 ? currentUserProfile[0] : null}
          defaultAnswers={defaultAnswers}
          defaultHitchEquipmentId={hitchEquipmentId}
          readOnly
        />
      </Shell>
    );
  }

  // Estructura antigua (`custom_form`): todavía no tiene visualización.
  const answer = await fetchAnswerById(id);
  if (answer.length === 0) {
    return (
      <Shell>
        <StateBlock variant="error" title="No se encontró la respuesta" description={`ID: ${id}`} />
      </Shell>
    );
  }

  return (
    <Shell>
      <StateBlock
        variant="empty"
        title="Respuesta de un formulario anterior"
        description="La visualización de respuestas de la estructura antigua todavía no está disponible."
      />
    </Shell>
  );
}

export default page;
