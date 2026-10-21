import type { Prisma } from '@/generated/prisma/client';
import { prismaBase } from '@/shared/lib/prisma';
import { createTenantClient } from '@/shared/lib/tenant-context';
import { VEHICLE_SELECT } from '@/shared/prisma-selects/vehicle-select';
import { buildCreatedAtFilter, type ExternalListQuery, type ExternalListResult } from '../lib/request';
import { toPublicDate, toPublicReference, type PublicReference } from './shared';

/**
 * Recurso "vehiculos" de la API externa (ticket 671).
 *
 * Usa VEHICLE_SELECT, el mismo que alimenta la tabla de Equipos, y replica su
 * filtro `type_of_vehicle = 1`: los equipamientos (contenedores, piletas,
 * trailers) viven en otra tabla y no forman parte de esta nomina.
 */

const VEHICLE_TYPE_ID = 1;

type VehicleRow = Prisma.vehiclesGetPayload<{ select: typeof VEHICLE_SELECT }>;

export async function fetchExternalVehicles(params: {
  companyId: string;
  query: ExternalListQuery;
}): Promise<ExternalListResult<VehicleRow>> {
  const { companyId, query } = params;
  const db = createTenantClient(prismaBase, { companyId, userId: null, kind: 'api' });

  const where: Prisma.vehiclesWhereInput = {
    company_id: companyId,
    type_of_vehicle: VEHICLE_TYPE_ID,
    ...(query.includeInactive ? {} : { is_active: true }),
    ...(buildCreatedAtFilter(query) ? { created_at: buildCreatedAtFilter(query) } : {}),
  };

  const [data, total] = await Promise.all([
    db.vehicles.findMany({
      where,
      select: VEHICLE_SELECT,
      orderBy: { domain: 'asc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.vehicles.count({ where }),
  ]);

  return { data, total };
}

export type PublicVehicle = {
  id: string;
  domain: string | null;
  internNumber: string | null;
  type: PublicReference | null;
  subType: PublicReference | null;
  brand: PublicReference | null;
  model: PublicReference | null;
  year: string | null;
  chassis: string | null;
  engine: string | null;
  serialNumber: string | null;
  condition: string | null;
  documentationStatus: string | null;
  kilometers: string | null;
  engineHours: string | null;
  owner: PublicReference | null;
  /** Sector del organigrama interno, el mismo catalogo que el de empleados */
  organizationalSector: PublicReference | null;
  costCenter: PublicReference | null;
  costType: string | null;
  contractType: string | null;
  contractNumber: string | null;
  contractStartDate: string | null;
  contractExpirationDate: string | null;
  currency: string | null;
  price: string | null;
  assignedCustomers: PublicReference[];
  isActive: boolean;
  terminationDate: string | null;
  terminationReason: string | null;
  createdAt: string;
};

export function toPublicVehicle(row: VehicleRow): PublicVehicle {
  return {
    id: row.id,
    domain: row.domain,
    internNumber: row.intern_number,
    type: toPublicReference(row.type_vehicles_typeTotype),
    subType: toPublicReference(row.sub_type),
    // El select trae solo el nombre de marca y modelo: el id sale del escalar
    brand: row.brand_vehicles ? { id: String(row.brand), name: row.brand_vehicles.name } : null,
    model: row.model_vehicles ? { id: String(row.model), name: row.model_vehicles.name } : null,
    year: row.year,
    chassis: row.chassis,
    engine: row.engine,
    serialNumber: row.serie,
    condition: row.condition,
    documentationStatus: row.status,
    kilometers: row.kilometer,
    engineHours: row.engine_hours,
    owner: toPublicReference(row.equipment_owners),
    organizationalSector: toPublicReference(row.hierarchy),
    costCenter: toPublicReference(row.cost_center),
    costType: row.cost_type,
    contractType: row.type_of_contract,
    contractNumber: row.contract_number,
    contractStartDate: toPublicDate(row.contract_start_date),
    contractExpirationDate: toPublicDate(row.contract_expiration_date),
    currency: row.currency,
    // Decimal de Prisma: se serializa como string para no perder precision
    price: row.price?.toString() ?? null,
    assignedCustomers: row.contractor_equipment
      .filter((relation) => relation.customers !== null)
      .map((relation) => ({ id: relation.customers!.id, name: relation.customers!.name })),
    isActive: row.is_active ?? false,
    terminationDate: toPublicDate(row.termination_date),
    terminationReason: row.reason_for_termination,
    createdAt: row.created_at.toISOString(),
  };
}
