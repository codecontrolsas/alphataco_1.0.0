import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/lib/prisma';

interface LastPressureRow {
  tire_id: string;
  psi: Prisma.Decimal | string | number;
}

/**
 * Última presión medida (psi) de cada cubierta, a partir de los servicios de gomería, en UNA sola
 * consulta (`DISTINCT ON`), sin una consulta por cubierta.
 *
 * Qué presión corresponde a qué cubierta:
 * - REPLACE: la cubierta que queda montada es `new_tire_id` y su presión es `pressure_end`
 *   (`pressure_start` pertenece a la que se retiró).
 * - Resto de acciones: la cubierta del puesto es `tire_id`; vale `pressure_end` y, si no hay,
 *   `pressure_start`.
 */
export async function getLastTirePressures(tireIds: string[]): Promise<Map<string, number>> {
  const ids = Array.from(new Set(tireIds));
  if (ids.length === 0) return new Map();

  const rows = await prisma.$queryRaw<LastPressureRow[]>`
    SELECT DISTINCT ON (tire_key) tire_key AS tire_id, psi
    FROM (
      SELECT
        CASE WHEN action = 'REPLACE' THEN new_tire_id ELSE tire_id END AS tire_key,
        CASE WHEN action = 'REPLACE' THEN pressure_end ELSE COALESCE(pressure_end, pressure_start) END AS psi,
        created_at
      FROM tire_service_items
      WHERE tire_id = ANY(${ids}::uuid[]) OR new_tire_id = ANY(${ids}::uuid[])
    ) AS items
    WHERE tire_key = ANY(${ids}::uuid[]) AND psi IS NOT NULL
    ORDER BY tire_key, created_at DESC
  `;

  return new Map(rows.map((row) => [row.tire_id, Number(row.psi)]));
}

/** Agrega `last_pressure_psi` (null si no hay medición) a cada posición con cubierta, con una sola consulta. */
export async function withLastPressure<T extends { tire_id: string | null }>(
  positions: T[]
): Promise<Array<T & { last_pressure_psi: number | null }>> {
  const pressures = await getLastTirePressures(
    positions.flatMap((position) => (position.tire_id ? [position.tire_id] : []))
  );
  return positions.map((position) => ({
    ...position,
    last_pressure_psi: position.tire_id ? pressures.get(position.tire_id) ?? null : null,
  }));
}
