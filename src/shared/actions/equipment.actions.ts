'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getActiveCompanyId, NoActiveCompanyError } from '@/shared/lib/tenant';

const logger = new Logger('shared/equipment');

const vehicleRelations = {
  brand_vehicles: true,
  model_vehicles: true,
  type_vehicles_typeTotype: true,
  types_of_vehicles: true,
  sub_type: true,
  contractor_equipment: { include: { customers: true } },
} as const;

type VehicleWithRelations = Awaited<
  ReturnType<typeof prisma.vehicles.findFirstOrThrow<{ include: typeof vehicleRelations }>>
>;

/**
 * Renombra las relaciones de Prisma al shape legacy de PostgREST
 * (`brand(*)`, `model(*)`, `type(*)`, `types_of_vehicles(*)`, `contractor_equipment(*, contractor_id(*))`).
 */
function toLegacyEquipment({
  brand_vehicles,
  model_vehicles,
  type_vehicles_typeTotype,
  types_of_vehicles,
  sub_type,
  contractor_equipment,
  ...rest
}: VehicleWithRelations) {
  return {
    ...rest,
    brand: brand_vehicles,
    model: model_vehicles,
    type: type_vehicles_typeTotype,
    types_of_vehicles,
    subType: sub_type,
    contractor_equipment: contractor_equipment.map(({ customers, ...ce }) => ({ ...ce, contractor_id: customers })),
  };
}

export const fetchSimpleDataEquipment = async () => {
  let company_id: string;
  try {
    company_id = await getActiveCompanyId();
  } catch (error) {
    if (error instanceof NoActiveCompanyError) return [];
    throw error;
  }

  try {
    return await prisma.vehicles.findMany({
      where: withCompany({}, company_id),
      select: { domain: true, serie: true, intern_number: true, id: true },
    });
  } catch (error) {
    logger.error('Error fetching simple equipment', { data: { error, company_id } });
    return [];
  }
};
