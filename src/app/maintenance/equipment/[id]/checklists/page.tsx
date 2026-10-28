import { ChecklistsListServer } from '@/features/Mantenimiento/Checklists/ChecklistsListServer';
import { requireEquipmentRoute } from '@/features/Modules/server/public-routes.server';

export default async function ChecklistsListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireEquipmentRoute(`/maintenance/equipment/${id}/checklists`, id);

  return <ChecklistsListServer equipmentId={id} />;
}
