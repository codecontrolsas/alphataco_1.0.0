import type { Prisma } from '@/generated/prisma/client';
import { prismaBase } from '@/shared/lib/prisma';
import { createTenantClient } from '@/shared/lib/tenant-context';
import { buildCreatedAtFilter, type ExternalListQuery, type ExternalListResult } from '../lib/request';
import { toPublicDate, toPublicReference, type PublicReference } from './shared';

/**
 * Recurso "equipamiento" de la API externa (ticket 671).
 *
 * Es la contraparte de /vehicles para la tabla `other_equipment`: contenedores,
 * piletas, trailers y demas equipamiento que la nomina de vehiculos deja afuera
 * por el filtro `type_of_vehicle = 1`.
 *
 * El select se declara aca —y no se comparte como VEHICLE_SELECT— porque el de
 * la tabla vive dentro de la feature Equipos y no esta expuesto como select
 * compartido. Replica sus columnas para exponer los mismos datos que el Excel
 * de equipamiento, mas los campos de contrato que /vehicles ya publica.
 */

const OTHER_EQUIPMENT_SELECT = {
  id: true,
  serial_number: true,
  intern_number: true,
  year: true,
  condition: true,
  status: true,
  horometer: true,
  manufacturer_plate: true,
  composition: true,
  invoice_number: true,
  initial_value: true,
  currency: true,
  purchase_date: true,
  cost_type: true,
  type_of_contract: true,
  contract_start_date: true,
  contract_expiration_date: true,
  contract_number: true,
  has_certification: true,
  certification_expiration_date: true,
  certification_number: true,
  reason_for_termination: true,
  termination_date: true,
  is_active: true,
  created_at: true,
  // FK escalares: el select de marca y modelo solo trae el nombre, el id sale de aca
  brand_id: true,
  model_id: true,
  // Relaciones FK
  type: { select: { id: true, name: true } },
  sub_type: { select: { id: true, name: true } },
  brand_vehicles: { select: { name: true } },
  model_vehicles: { select: { name: true } },
  equipment_owners: { select: { id: true, name: true } },
  hierarchy: { select: { id: true, name: true } },
  cost_center: { select: { id: true, name: true } },
  vehicles: { select: { id: true, domain: true } },
  // Relacion M:M con clientes
  contractor_other_equipment: {
    select: {
      customers: { select: { id: true, name: true } },
    },
  },
} as const;

type OtherEquipmentRow = Prisma.other_equipmentGetPayload<{ select: typeof OTHER_EQUIPMENT_SELECT }>;

export async function fetchExternalOtherEquipment(params: {
  companyId: string;
  query: ExternalListQuery;
}): Promise<ExternalListResult<OtherEquipmentRow>> {
  const { companyId, query } = params;
  const db = createTenantClient(prismaBase, { companyId, userId: null, kind: 'api' });

  const createdAtFilter = buildCreatedAtFilter(query);

  const where: Prisma.other_equipmentWhereInput = {
    company_id: companyId,
    ...(query.includeInactive ? {} : { is_active: true }),
    ...(createdAtFilter ? { created_at: createdAtFilter } : {}),
  };

  const [data, total] = await Promise.all([
    db.other_equipment.findMany({
      where,
      select: OTHER_EQUIPMENT_SELECT,
      orderBy: { serial_number: 'asc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.other_equipment.count({ where }),
  ]);

  return { data, total };
}

export type PublicOtherEquipment = {
  id: string;
  serialNumber: string | null;
  internNumber: string | null;
  type: PublicReference | null;
  subType: PublicReference | null;
  brand: PublicReference | null;
  model: PublicReference | null;
  year: string | null;
  condition: string | null;
  documentationStatus: string | null;
  horometer: string | null;
  manufacturerPlate: string | null;
  composition: string | null;
  invoiceNumber: string | null;
  initialValue: string | null;
  currency: string | null;
  purchaseDate: string | null;
  costType: string | null;
  costCenter: PublicReference | null;
  /** Sector del organigrama interno, el mismo catalogo que el de empleados y vehiculos */
  organizationalSector: PublicReference | null;
  owner: PublicReference | null;
  /** Vehiculo al que esta montado el equipamiento; el "nombre" de un vehiculo es su dominio */
  linkedVehicle: PublicReference | null;
  contractType: string | null;
  contractNumber: string | null;
  contractStartDate: string | null;
  contractExpirationDate: string | null;
  hasCertification: boolean;
  certificationNumber: string | null;
  certificationExpirationDate: string | null;
  assignedCustomers: PublicReference[];
  isActive: boolean;
  terminationDate: string | null;
  terminationReason: string | null;
  createdAt: string;
};

export function toPublicOtherEquipment(row: OtherEquipmentRow): PublicOtherEquipment {
  return {
    id: row.id,
    serialNumber: row.serial_number,
    internNumber: row.intern_number,
    type: toPublicReference(row.type),
    subType: toPublicReference(row.sub_type),
    // El select trae solo el nombre de marca y modelo: el id sale del escalar
    brand: row.brand_vehicles ? { id: String(row.brand_id), name: row.brand_vehicles.name } : null,
    model: row.model_vehicles ? { id: String(row.model_id), name: row.model_vehicles.name } : null,
    year: row.year,
    condition: row.condition,
    documentationStatus: row.status,
    // Decimal de Prisma: se serializa como string para no perder precision
    horometer: row.horometer?.toString() ?? null,
    manufacturerPlate: row.manufacturer_plate,
    composition: row.composition,
    invoiceNumber: row.invoice_number,
    initialValue: row.initial_value?.toString() ?? null,
    currency: row.currency,
    purchaseDate: toPublicDate(row.purchase_date),
    costType: row.cost_type,
    costCenter: toPublicReference(row.cost_center),
    organizationalSector: toPublicReference(row.hierarchy),
    owner: toPublicReference(row.equipment_owners),
    linkedVehicle: row.vehicles ? { id: row.vehicles.id, name: row.vehicles.domain } : null,
    contractType: row.type_of_contract,
    contractNumber: row.contract_number,
    contractStartDate: toPublicDate(row.contract_start_date),
    contractExpirationDate: toPublicDate(row.contract_expiration_date),
    hasCertification: row.has_certification,
    certificationNumber: row.certification_number,
    certificationExpirationDate: toPublicDate(row.certification_expiration_date),
    assignedCustomers: row.contractor_other_equipment
      .filter((relation) => relation.customers !== null)
      .map((relation) => ({ id: relation.customers!.id, name: relation.customers!.name })),
    isActive: row.is_active,
    terminationDate: toPublicDate(row.termination_date),
    terminationReason: row.reason_for_termination,
    createdAt: row.created_at.toISOString(),
  };
}
