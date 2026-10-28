import { EquipmentDashboardServer } from '@/features/Mantenimiento/EquipmentDashboard/EquipmentDashboardServer';
import { requireEquipmentRoute } from '@/features/Modules/server/public-routes.server';

export default async function EquipmentDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireEquipmentRoute(`/maintenance/equipment/${id}`, id);

  return <EquipmentDashboardServer equipmentId={id} />;
}
