/**
 * Resuelve la medida efectiva de un eje aplicando el override de vehículo
 * sobre la medida de plantilla.
 *
 * Precedencia: vehicle_override > template_axle.tire_size > null
 */
export function resolveAxleTireSize(
  templateAxleSize: string | null,
  vehicleOverride: string | null | undefined
): string | null {
  return vehicleOverride ?? templateAxleSize ?? null;
}
