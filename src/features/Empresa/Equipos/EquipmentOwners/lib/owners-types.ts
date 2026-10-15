import type { getEquipmentOwnersPaginated } from '../owners.server';
import type { getVehiclesByOwnerPaginated } from '../vehicles-by-owner.server';

/** Tipos inferidos de las lecturas: nunca se definen a mano. */
export type EquipmentOwnerListItem = Awaited<ReturnType<typeof getEquipmentOwnersPaginated>>['data'][number];
export type VehicleByOwnerListItem = Awaited<ReturnType<typeof getVehiclesByOwnerPaginated>>['data'][number];
