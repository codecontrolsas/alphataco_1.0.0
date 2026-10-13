import { OtherEquipmentHeaderSkeleton } from '@/features/Equipos/OtherEquipment/fallback/OtherEquipmentHeaderSkeleton';

/** La cabecera del vehículo y la del equipamiento comparten estructura, y por eso el esqueleto. */
export function VehicleHeaderSkeleton() {
  return <OtherEquipmentHeaderSkeleton />;
}
