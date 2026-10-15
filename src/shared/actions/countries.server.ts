'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { assertCompanyAccess, getActiveCompanyId, NoActiveCompanyError } from '@/shared/lib/tenant';

/** Catálogos que consume el store `useCountriesStore` (antes PostgREST + realtime desde el navegador). */
const logger = new Logger('shared/catalogs');

/** Empresa activa o null: los catálogos por empresa devuelven [] sin sesión en vez de lanzar. */
async function activeCompanyOrNull(): Promise<string | null> {
  try {
    return await getActiveCompanyId();
  } catch (error) {
    if (error instanceof NoActiveCompanyError) return null;
    throw error;
  }
}

/** Catálogo global de países, ordenado por nombre. */
export async function getCountries() {
  return prisma.countries.findMany({ orderBy: { name: 'asc' } });
}

/** Provincias (catálogo global). `id` es bigint en Postgres: se devuelve como number. */
export async function getProvinces() {
  const rows = await prisma.provinces.findMany({ orderBy: { name: 'asc' } });
  return rows.map((p) => ({ ...p, id: Number(p.id) }));
}

/** Ciudades de una provincia. */
export async function getCitiesByProvince(provinceId: number) {
  const rows = await prisma.cities.findMany({
    where: { province_id: BigInt(provinceId) },
    orderBy: { name: 'asc' },
  });
  return rows.map((c) => ({ ...c, id: Number(c.id), province_id: Number(c.province_id) }));
}

/** Puestos jerárquicos de la empresa activa (`hierarchy.company_id` NOT NULL). */
export async function getHierarchyPositions() {
  const companyId = await activeCompanyOrNull();
  if (!companyId) return [];
  return prisma.hierarchy.findMany({ where: withCompany({}, companyId), orderBy: { name: 'asc' } });
}

/** Diagramas de trabajo de la empresa activa (`work_diagram.company_id` NOT NULL). */
export async function getWorkDiagrams() {
  const companyId = await activeCompanyOrNull();
  if (!companyId) return [];
  const rows = await prisma.work_diagram.findMany({ where: withCompany({}, companyId), orderBy: { name: 'asc' } });
  // Los días son Decimal en Prisma: se pasan a number para poder cruzar al store del cliente.
  return rows.map((row) => ({
    ...row,
    active_working_days: row.active_working_days === null ? null : Number(row.active_working_days),
    inactive_working_days: row.inactive_working_days === null ? null : Number(row.inactive_working_days),
  }));
}

/** Clientes (contratistas) de la empresa activa. */
export async function getCustomers() {
  const companyId = await activeCompanyOrNull();
  if (!companyId) return [];
  try {
    const rows = await prisma.customers.findMany({ where: withCompany({}, companyId), orderBy: { name: 'asc' } });
    return rows.map(({ cuit, client_phone, ...rest }) => ({
      ...rest,
      cuit: Number(cuit),
      client_phone: client_phone == null ? null : Number(client_phone),
    }));
  } catch (error) {
    logger.error('Error al obtener clientes', { data: { error, companyId } });
    return [];
  }
}

/** Contactos de la empresa activa con su cliente. */
export async function getContacts() {
  const companyId = await activeCompanyOrNull();
  if (!companyId) return [];
  try {
    return await prisma.contacts.findMany({
      where: withCompany({}, companyId),
      include: { customers: { select: { id: true, name: true } } },
      orderBy: { contact_name: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener contactos', { data: { error, companyId } });
    return [];
  }
}

/** Tipos de documento activos aplicables a una empresa: globales (`company_id IS NULL`) + propios. */
export async function getCompanyDocumentTypes(companyId?: string) {
  if (companyId) await assertCompanyAccess(companyId);
  const resolved = companyId || (await activeCompanyOrNull());
  if (!resolved) return [];
  try {
    return await prisma.document_types.findMany({
      where: { is_active: true, OR: [{ company_id: null }, { company_id: resolved }] },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener tipos de documento', { data: { error, companyId: resolved } });
    return [];
  }
}
