import 'server-only';

import { prisma } from '@/shared/lib/prisma';

/** Varias llamadas al motor de stock por operacion: mas margen que los 5 s por defecto. */
export const GOMERIA_TX_OPTIONS = { timeout: 30_000, maxWait: 5_000 };

// ============================================================================
// GET VEHICLE TIRE POSITIONS
// ============================================================================

/**
 * Posiciones de un vehículo sin perímetro propio: helper interno para los flujos que ya
 * resolvieron la empresa del vehículo (el alta de la orden, que corre también desde el QR).
 * NO exportar: quien la llame tiene que haber validado el vehículo antes.
 */
export async function fetchVehicleTirePositions(vehicleId: string) {
  const positions = await prisma.vehicle_tire_positions.findMany({
    where: { vehicle_id: vehicleId },
    include: {
      tire: {
        select: {
          id: true,
          serial_number: true,
          is_new: true,
          retread_level: true,
          tread_depth: true,
          status: true,
          brand: { select: { id: true, name: true } },
          tire_type: { select: { id: true, size: true, tread_type: true } },
        },
      },
      template_axle: {
        select: {
          id: true,
          axle_number: true,
          tires_per_side: true,
          tire_size: true,
          is_drive_axle: true,
          is_spare: true,
        },
      },
    },
    orderBy: { position_number: 'asc' },
  });
  return positions;
}

/** Referencia de los movimientos de stock de una orden de gomeria: "Gomería AB123CD, posición 3". */
export async function tireServiceReference(
  tx: Pick<typeof prisma, 'vehicles'>,
  vehicleId: string,
  positionNumber: number
): Promise<string> {
  const vehicle = await tx.vehicles.findUnique({
    where: { id: vehicleId },
    select: { domain: true, intern_number: true },
  });
  const name = vehicle?.domain || vehicle?.intern_number || 'equipo';
  return `Gomería ${name}, posición ${positionNumber}`;
}
