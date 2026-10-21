import type { Prisma } from '@/generated/prisma/client';
import { prismaBase } from '@/shared/lib/prisma';
import { createTenantClient } from '@/shared/lib/tenant-context';
import { buildCreatedAtFilter, type ExternalListQuery, type ExternalListResult } from '../lib/request';
import { toPublicDate, type PublicReference } from './shared';

/**
 * Recursos comerciales de la API externa (ticket 671): clientes, sectores y
 * areas, tal como los muestran las pantallas de Comercial.
 *
 * `sectors` y `areas_cliente` no tienen `company_id` ni estado propio: cuelgan
 * del cliente, asi que la empresa y el filtro de activos se resuelven a traves
 * de `customers`.
 */

// ─── Clientes ────────────────────────────────────────────────────────────────

const CUSTOMER_SELECT = {
  id: true,
  name: true,
  cuit: true,
  client_email: true,
  client_phone: true,
  address: true,
  is_active: true,
  reason_for_termination: true,
  termination_date: true,
  created_at: true,
} as const;

type CustomerRow = Prisma.customersGetPayload<{ select: typeof CUSTOMER_SELECT }>;

export async function fetchExternalCustomers(params: {
  companyId: string;
  query: ExternalListQuery;
}): Promise<ExternalListResult<CustomerRow>> {
  const { companyId, query } = params;
  const db = createTenantClient(prismaBase, { companyId, userId: null, kind: 'api' });

  const where: Prisma.customersWhereInput = {
    company_id: companyId,
    ...(query.includeInactive ? {} : { is_active: true }),
    ...(buildCreatedAtFilter(query) ? { created_at: buildCreatedAtFilter(query) } : {}),
  };

  const [data, total] = await Promise.all([
    db.customers.findMany({
      where,
      select: CUSTOMER_SELECT,
      orderBy: { name: 'asc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.customers.count({ where }),
  ]);

  return { data, total };
}

export type PublicCustomer = {
  id: string;
  name: string;
  /** BigInt en la base: viaja como texto para no perder digitos ni romper el JSON */
  cuit: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  terminationDate: string | null;
  terminationReason: string | null;
  createdAt: string;
};

export function toPublicCustomer(row: CustomerRow): PublicCustomer {
  return {
    id: row.id,
    name: row.name,
    cuit: row.cuit.toString(),
    email: row.client_email,
    phone: row.client_phone?.toString() ?? null,
    address: row.address,
    isActive: row.is_active ?? false,
    terminationDate: toPublicDate(row.termination_date),
    terminationReason: row.reason_for_termination,
    createdAt: row.created_at.toISOString(),
  };
}

// ─── Sectores comerciales ────────────────────────────────────────────────────

const COMMERCIAL_SECTOR_SELECT = {
  id: true,
  name: true,
  descripcion_corta: true,
  created_at: true,
  customers: { select: { id: true, name: true } },
} as const;

type CommercialSectorRow = Prisma.sectorsGetPayload<{ select: typeof COMMERCIAL_SECTOR_SELECT }>;

export async function fetchExternalCommercialSectors(params: {
  companyId: string;
  query: ExternalListQuery;
}): Promise<ExternalListResult<CommercialSectorRow>> {
  const { companyId, query } = params;
  const db = createTenantClient(prismaBase, { companyId, userId: null, kind: 'api' });

  const where: Prisma.sectorsWhereInput = {
    customers: {
      company_id: companyId,
      ...(query.includeInactive ? {} : { is_active: true }),
    },
  };

  const [data, total] = await Promise.all([
    db.sectors.findMany({
      where,
      select: COMMERCIAL_SECTOR_SELECT,
      orderBy: { name: 'asc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.sectors.count({ where }),
  ]);

  return { data, total };
}

export type PublicCommercialSector = {
  id: string;
  name: string;
  description: string | null;
  customers: PublicReference[];
  createdAt: string | null;
};

export function toPublicCommercialSector(row: CommercialSectorRow): PublicCommercialSector {
  // `customers` sigue siendo un ARRAY aunque un sector ahora pertenezca a un solo cliente.
  // Es un contrato público con consumidores de afuera: cambiarlo a un objeto singular los
  // rompería sin aviso. La forma se mantiene y se devuelve un array de un elemento; si alguna
  // vez se confirma que nadie lo consume, ahí sí conviene versionar la API y aplanarlo.
  return {
    id: row.id,
    name: row.name,
    description: row.descripcion_corta,
    customers: [{ id: row.customers.id, name: row.customers.name }],
    createdAt: row.created_at?.toISOString() ?? null,
  };
}

// ─── Areas de cliente ────────────────────────────────────────────────────────

const CUSTOMER_AREA_SELECT = {
  id: true,
  nombre: true,
  descripcion_corta: true,
  customers: { select: { id: true, name: true } },
  area_province: {
    select: { provinces: { select: { id: true, name: true } } },
  },
} as const;

type CustomerAreaRow = Prisma.areas_clienteGetPayload<{ select: typeof CUSTOMER_AREA_SELECT }>;

export async function fetchExternalCustomerAreas(params: {
  companyId: string;
  query: ExternalListQuery;
}): Promise<ExternalListResult<CustomerAreaRow>> {
  const { companyId, query } = params;
  const db = createTenantClient(prismaBase, { companyId, userId: null, kind: 'api' });

  const where: Prisma.areas_clienteWhereInput = {
    customers: {
      company_id: companyId,
      ...(query.includeInactive ? {} : { is_active: true }),
    },
  };

  const [data, total] = await Promise.all([
    db.areas_cliente.findMany({
      where,
      select: CUSTOMER_AREA_SELECT,
      orderBy: { nombre: 'asc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.areas_cliente.count({ where }),
  ]);

  return { data, total };
}

export type PublicCustomerArea = {
  id: string;
  name: string;
  description: string | null;
  customer: PublicReference;
  provinces: PublicReference[];
};

export function toPublicCustomerArea(row: CustomerAreaRow): PublicCustomerArea {
  return {
    id: row.id,
    name: row.nombre,
    description: row.descripcion_corta,
    customer: { id: row.customers.id, name: row.customers.name },
    provinces: row.area_province.map((relation) => ({
      id: String(relation.provinces.id),
      name: relation.provinces.name,
    })),
  };
}
