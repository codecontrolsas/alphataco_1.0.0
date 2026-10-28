import { ChecklistFormServer } from '@/features/Mantenimiento/Checklists/ChecklistFormServer';
import { requireEquipmentRoute } from '@/features/Modules/server/public-routes.server';

export default async function ChecklistFormPage({ params }: { params: Promise<{ id: string; checklistId: string }> }) {
  const { id, checklistId } = await params;
  await requireEquipmentRoute(`/maintenance/equipment/${id}/checklists/${checklistId}`, id);

  return <ChecklistFormServer equipmentId={id} checklistId={checklistId} />;
}
