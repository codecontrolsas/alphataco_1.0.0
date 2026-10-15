import type { Prisma } from '@/generated/prisma/client';

/** Lo que se lee de un área para las tablas y formularios: cliente y provincias embebidas. */
export const areaInclude = {
  customers: { select: { id: true, name: true, company_id: true } },
  area_province: { select: { province_id: true, provinces: { select: { id: true, name: true } } } },
} satisfies Prisma.areas_clienteInclude;

type AreaWithRelations = Prisma.areas_clienteGetPayload<{ include: typeof areaInclude }>;

/** `provinces.id` es bigint: hacia el cliente viaja como number. */
export function serializeArea(area: AreaWithRelations) {
  return {
    id: area.id,
    nombre: area.nombre,
    descripcion_corta: area.descripcion_corta,
    customer_id: area.customer_id,
    customers: area.customers,
    area_province: area.area_province.map((ap) => ({
      province_id: Number(ap.province_id),
      provinces: { id: Number(ap.provinces.id), name: ap.provinces.name },
    })),
  };
}
