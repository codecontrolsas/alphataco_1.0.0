import type { Prisma } from '@/generated/prisma/client';

/** Lo que se lee de un sector para las tablas y formularios. */
export const SECTOR_SELECT = {
  id: true,
  customer_id: true,
  name: true,
  descripcion_corta: true,
  created_at: true,
  customers: { select: { id: true, name: true } },
} satisfies Prisma.sectorsSelect;

type SectorQueryRow = Prisma.sectorsGetPayload<{ select: typeof SECTOR_SELECT }>;

/**
 * Se conserva la forma anidada `sectors: {...}` que ya consumían las pantallas: el ticket 745
 * pidió reordenar el dominio, no rehacer un DTO que atraviesa media aplicación.
 */
export function serializeSector(row: SectorQueryRow) {
  return {
    id: row.id,
    sector_id: row.id,
    customer_id: row.customer_id,
    created_at: row.created_at,
    sectors: { id: row.id, name: row.name, descripcion_corta: row.descripcion_corta },
    customers: row.customers,
  };
}
