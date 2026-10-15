import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Logger } from '@/lib/logger';
import { loadVehicleTwinData } from '../lib/vehicle-twin.server';
import { VehicleTwinLoader } from './iso/VehicleTwinLoader';

const logger = new Logger('VehicleTwinSection');

type TwinVehicle = Parameters<typeof loadVehicleTwinData>[0];

/** Resumen de la ficha: el gemelo del vehículo con el estado real de cada sección. */
export async function VehicleTwinSection({
  vehicle,
  permissions,
}: {
  vehicle: TwinVehicle;
  permissions: Record<string, boolean>;
}) {
  let content: React.ReactNode;
  try {
    content = <VehicleTwinLoader data={await loadVehicleTwinData(vehicle, permissions)} />;
  } catch (error) {
    logger.error('Error armando el gemelo del vehículo', { data: { error } });
    content = (
      <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm" role="alert">
        No se pudo cargar el resumen del equipo. Probá recargar la página; las pestañas siguen disponibles.
      </p>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Estado del equipo</CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
