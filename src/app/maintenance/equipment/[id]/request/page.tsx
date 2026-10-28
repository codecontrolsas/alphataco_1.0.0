import { MaintenanceRequestServer } from '@/features/Mantenimiento/NuevoPedido/MaintenanceRequestServer';
import { requireEquipmentRoute } from '@/features/Modules/server/public-routes.server';

export default async function MaintenanceEquipmentRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireEquipmentRoute(`/maintenance/equipment/${id}/request`, id);

  return <MaintenanceRequestServer equipmentId={id} />;
}
