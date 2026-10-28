import { TireServiceQrServer } from '@/features/Mantenimiento/Gomeria/Ordenes/TireServiceQrServer';
import { requireEquipmentRoute } from '@/features/Modules/server/public-routes.server';

export default async function TireServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireEquipmentRoute(`/maintenance/equipment/${id}/tire-service`, id);

  return <TireServiceQrServer equipmentId={id} />;
}
