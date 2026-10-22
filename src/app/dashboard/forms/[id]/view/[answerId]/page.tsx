import {
  fetchActiveCustomersForChecklist,
  fetchActiveEmployeesForChecklist,
} from '@/features/Checklists/actions/actionsServer';
import { fetchChecklistAnswerById } from '@/features/Checklists/actions/checklist-answer-queries';
import { fetchChecklistTemplateById } from '@/features/Checklists/actions/checklist-queries';
import { ChecklistPDFDownloadButton } from '@/features/Checklists/components/ChecklistPDFDownloadButton';
import { NormalizedChecklistForm } from '@/features/Checklists/components/NormalizedChecklistForm';
import { fetchEquipmentsByIdsForChecklist, getCurrentProfile } from '@/features/Formularios/actions/form-actions';
import { formatAnswerDate, readAnswerData, toPdfSections } from '@/features/Formularios/utils/checklistView';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { mapEquipmentToChecklistFormat } from '@/lib/utils';
import BackButton from '@/shared/components/common/BackButton';
import { Field, FieldGrid } from '@/shared/components/common/FieldGrid';
import { RecordHeader } from '@/shared/components/common/RecordHeader';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { notFound } from 'next/navigation';

export default async function ChecklistAnswerViewPage({
  params,
}: {
  params: Promise<{ id: string; answerId: string }>;
}) {
  const { id: templateId, answerId } = await params;

  const canView = await checkPermissionServer('formularios', 'formularios', 'view');
  if (!canView) {
    return (
      <div className="px-4 py-4 sm:px-7">
        <StateBlock variant="noperm" title="No tenés permiso para ver formularios" />
      </div>
    );
  }

  // La plantilla sale de la URL: se pide junto con la respuesta.
  const [normalizedAnswer, template] = await Promise.all([
    fetchChecklistAnswerById(answerId),
    fetchChecklistTemplateById(templateId),
  ]);

  if (!normalizedAnswer) notFound();

  // Seguridad/consistencia: la URL incluye el template, validamos que la respuesta pertenezca.
  if (normalizedAnswer.template_id && normalizedAnswer.template_id !== templateId) notFound();

  if (!template) {
    return (
      <div className="space-y-6 px-4 py-4 sm:px-7">
        <BackButton />
        <StateBlock variant="error" title="No se encontró la plantilla del formulario" />
      </div>
    );
  }

  const answerData = readAnswerData(normalizedAnswer.answer_data);
  const hitchEquipmentId = normalizedAnswer.hitch_equipment_id;

  // Solo el equipo de la respuesta (y su enganche) alimentan el formulario en solo lectura.
  const [equipmentRows, customers, employees, currentUserProfile] = await Promise.all([
    fetchEquipmentsByIdsForChecklist([normalizedAnswer.equipment_id, hitchEquipmentId ?? ''].filter(Boolean)),
    fetchActiveCustomersForChecklist(),
    fetchActiveEmployeesForChecklist(),
    getCurrentProfile(),
  ]);

  const equipments = equipmentRows.map(mapEquipmentToChecklistFormat);
  const currentUser = currentUserProfile.length > 0 ? currentUserProfile[0] : null;

  const defaultAnswers = {
    equipment_id: normalizedAnswer.equipment_id,
    customer_id: answerData.customerId,
    chofer: answerData.chofer,
    fecha: answerData.fecha,
    hora: answerData.hora,
    kilometraje: answerData.kilometraje,
    horometro: answerData.horometro,
    observaciones: normalizedAnswer.observations || '',
    // Observaciones por item (columna OBSERVACIONES del formulario en papel)
    item_observations: answerData.itemObservations,
    ...answerData.answers, // Respuestas por sección
  };

  const selectedEquipment = equipments.find((eq) => eq.value === normalizedAnswer.equipment_id);
  const dominio = selectedEquipment?.domain || selectedEquipment?.serie || '';
  const tipoEquipo = selectedEquipment?.sub_type_name || selectedEquipment?.type_name || '';
  const clienteName = customers.find((customer) => customer.id === answerData.customerId)?.name || '';

  return (
    <div className="space-y-6 px-4 py-4 sm:px-7">
      <BackButton />

      <RecordHeader
        identity={
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold">{template.name}</h1>
            <p className="text-muted-foreground text-sm">
              {template.code}
              {dominio ? ` · ${dominio}` : ''}
            </p>
          </div>
        }
        actions={
          <ChecklistPDFDownloadButton
            templateName={template.name}
            templateCode={template.code}
            sections={toPdfSections(template)}
            dominio={dominio}
            tipoEquipo={tipoEquipo}
            cliente={clienteName}
            observaciones={normalizedAnswer.observations || answerData.observaciones}
            fechaInspeccion={answerData.fecha}
            chofer={answerData.chofer}
            answers={answerData.pdfAnswers}
            itemObservations={answerData.itemObservations}
          />
        }
      />

      <SectionCard title="Datos de la respuesta">
        <FieldGrid>
          <Field label="Equipo" value={selectedEquipment?.label} />
          <Field label="Cliente" value={clienteName} />
          <Field label="Chofer" value={answerData.chofer} />
          <Field
            label="Fecha de inspección"
            value={answerData.fecha ? formatAnswerDate(answerData.fecha) : null}
            mono
          />
          <Field
            label="Cargada el"
            value={normalizedAnswer.created_at ? formatArgentinaDateTime(normalizedAnswer.created_at) : null}
            mono
          />
        </FieldGrid>
      </SectionCard>

      <NormalizedChecklistForm
        template={template}
        equipments={equipments}
        customers={customers}
        employees={employees}
        currentUser={currentUser}
        defaultAnswers={defaultAnswers}
        defaultHitchEquipmentId={hitchEquipmentId}
        defaultCustomerId={answerData.customerId || null}
        readOnly
      />
    </div>
  );
}
