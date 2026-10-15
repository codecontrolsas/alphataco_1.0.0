import type { DiagramPosition } from '../tire-diagram-utils';

/** Forma común de una posición con cubierta, tal como la devuelven las consultas de posiciones del vehículo. */
interface PositionSource {
  position_number: number;
  axle_number: number;
  side: string;
  tire_id: string | null;
  effective_tire_size: string | null;
  /** Última presión medida (psi); null si la cubierta nunca se midió. */
  last_pressure_psi: number | null;
  tire: {
    serial_number: string;
    retread_level: 'FIRST' | 'SECOND' | 'THIRD' | null;
    // Prisma devuelve Decimal: se comporta como número/string.
    tread_depth: { valueOf(): number | string } | string | number | null;
    brand?: { name: string } | null;
    tire_type?: { size: string } | null;
  } | null;
}

function toNumber(value: { valueOf(): number | string } | string | number | null | undefined): number | undefined {
  if (value == null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Posición de la consulta -> posición del diagrama, con los datos de color (dibujo, presión, recapado). */
export function toDiagramPosition(position: PositionSource): DiagramPosition {
  const { tire } = position;
  return {
    position_number: position.position_number,
    axle_number: position.axle_number,
    side: position.side as DiagramPosition['side'],
    tire_id: position.tire_id,
    tire_serial: tire?.serial_number ?? undefined,
    tire_brand: tire?.brand?.name ?? undefined,
    tire_size: position.effective_tire_size ?? tire?.tire_type?.size ?? undefined,
    tread_depth_mm: toNumber(tire?.tread_depth),
    pressure_psi: position.last_pressure_psi ?? undefined,
    retread_level: tire ? tire.retread_level : undefined,
  };
}
