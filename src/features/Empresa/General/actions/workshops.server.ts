'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getActiveCompanyId, NoActiveCompanyError } from '@/shared/lib/tenant';

/**
 * Talleres (`workshops`) y sectores de taller (`workshop_sectors`) de la empresa activa.
 * Ambas tablas tienen `company_id`: toda lectura va con `withCompany` y toda escritura verifica
 * que la fila (y el taller padre de un sector) pertenezca a la empresa activa.
 * Las mutaciones exigen `configuracion.talleres.*` / `configuracion.sectores_taller.*`; las listas completas
 * (`fetchAllWorkshops`, `fetchAllWorkshopSectors`) exigen `view` de su tab, y el selector de talleres internos
 * (`fetchInternalWorkshops`, solo lo usa Sectores de taller) exige `view` de esa tab.
 *
 * `employee_workshop_sectors` (empleados por sector) no se toca acá: sus altas/bajas viven en
 * `Employees/EmpleadoID` (altas/bajas explícitas por id).
 */
const logger = new Logger('features/Empresa/General/workshops');

async function activeCompanyOrNull(): Promise<string | null> {
  try {
    return await getActiveCompanyId();
  } catch (error) {
    if (error instanceof NoActiveCompanyError) {
      logger.warn('No hay empresa activa');
      return null;
    }
    throw error;
  }
}

async function assertPermission(
  tab: 'talleres' | 'sectores_taller',
  action: 'view' | 'create' | 'update'
): Promise<void> {
  if (!(await checkPermissionServer('configuracion', tab, action))) {
    throw new Error('No tenés permiso para realizar esta acción');
  }
}

// ─── Serialización ──────────────────────────────────────────────────────────
// `city`/`province` son bigint y `latitude`/`longitude` Decimal: los formularios y tablas los
// consumen como number (o null).

const workshopSelect = {
  id: true,
  created_at: true,
  updated_at: true,
  name: true,
  address: true,
  city: true,
  province: true,
  latitude: true,
  longitude: true,
  type: true,
  provider_name: true,
  provider_phone: true,
  provider_email: true,
  is_active: true,
  company_id: true,
  provinces: { select: { id: true, name: true } },
  cities: { select: { id: true, name: true } },
} satisfies Prisma.workshopsSelect;

type WorkshopDbRow = Prisma.workshopsGetPayload<{ select: typeof workshopSelect }>;

function serializeWorkshop(row: WorkshopDbRow) {
  return {
    ...row,
    city: row.city === null ? null : Number(row.city),
    province: row.province === null ? null : Number(row.province),
    latitude: row.latitude === null ? null : row.latitude.toNumber(),
    longitude: row.longitude === null ? null : row.longitude.toNumber(),
    provinces: row.provinces ? { id: Number(row.provinces.id), name: row.provinces.name } : null,
    cities: row.cities ? { id: Number(row.cities.id), name: row.cities.name } : null,
  };
}

export type Workshop = ReturnType<typeof serializeWorkshop>;

const sectorInclude = {
  workshops: { select: { id: true, name: true, type: true } },
} satisfies Prisma.workshop_sectorsInclude;

export type WorkshopSector = Prisma.workshop_sectorsGetPayload<{ include: typeof sectorInclude }>;

// ─── Talleres ───────────────────────────────────────────────────────────────

export async function fetchAllWorkshops(): Promise<Workshop[]> {
  await assertPermission('talleres', 'view');
  const companyId = await activeCompanyOrNull();
  if (!companyId) return [];
  try {
    const rows = await prisma.workshops.findMany({
      where: withCompany({}, companyId),
      select: workshopSelect,
      orderBy: { name: 'asc' },
    });
    return rows.map(serializeWorkshop);
  } catch (error) {
    logger.error('Error al obtener talleres', { data: { error, companyId } });
    return [];
  }
}

/** Talleres internos activos (`{ id, name }`) para el selector de sectores. Sin permiso, lanza (no devuelve []). */
export async function fetchInternalWorkshops() {
  await assertPermission('sectores_taller', 'view');
  const companyId = await activeCompanyOrNull();
  if (!companyId) return [];
  try {
    return await prisma.workshops.findMany({
      where: withCompany({ is_active: true, type: 'interno' as const }, companyId),
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener talleres internos', { data: { error, companyId } });
    return [];
  }
}

export interface WorkshopInput {
  name: string;
  type: 'interno' | 'externo';
  address?: string | null;
  province?: number | null;
  city?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  provider_name?: string | null;
  provider_phone?: string | null;
  provider_email?: string | null;
  is_active: boolean;
}

function toWorkshopData(input: WorkshopInput) {
  return {
    name: input.name.trim(),
    type: input.type,
    address: input.address ?? null,
    province: input.province == null ? null : BigInt(input.province),
    city: input.city == null ? null : BigInt(input.city),
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    provider_name: input.provider_name ?? null,
    provider_phone: input.provider_phone ?? null,
    provider_email: input.provider_email || null,
    is_active: input.is_active,
  };
}

export async function createWorkshop(workshop: WorkshopInput): Promise<Workshop> {
  const companyId = await getActiveCompanyId();
  await assertPermission('talleres', 'create');
  try {
    const created = await prisma.workshops.create({
      data: { ...toWorkshopData(workshop), },
      select: workshopSelect,
    });
    logger.info('Taller creado', { data: { workshopId: created.id, companyId } });
    return serializeWorkshop(created);
  } catch (error) {
    logger.error('Error al crear taller', { data: { error, companyId } });
    throw new Error('Error creating workshop');
  }
}

export async function updateWorkshop(workshop: WorkshopInput & { id: string }): Promise<Workshop> {
  const companyId = await getActiveCompanyId();
  await assertPermission('talleres', 'update');
  const { id, ...input } = workshop;
  try {
    const owned = await prisma.workshops.findFirst({ where: { id, company_id: companyId }, select: { id: true } });
    if (!owned) throw new Error('Taller no encontrado en la empresa activa');
    const updated = await prisma.workshops.update({
      where: { id },
      data: { ...toWorkshopData(input), updated_at: new Date() },
      select: workshopSelect,
    });
    logger.info('Taller actualizado', { data: { workshopId: id, companyId } });
    return serializeWorkshop(updated);
  } catch (error) {
    logger.error('Error al actualizar taller', { data: { error, workshopId: id, companyId } });
    throw new Error('Error updating workshop');
  }
}

// ─── Sectores de taller ─────────────────────────────────────────────────────

export async function fetchAllWorkshopSectors(): Promise<WorkshopSector[]> {
  await assertPermission('sectores_taller', 'view');
  const companyId = await activeCompanyOrNull();
  if (!companyId) return [];
  try {
    return await prisma.workshop_sectors.findMany({
      where: withCompany({}, companyId),
      include: sectorInclude,
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener sectores de taller', { data: { error, companyId } });
    return [];
  }
}

export interface WorkshopSectorInput {
  name: string;
  description?: string | null;
  workshop_id: string;
  is_active: boolean;
  max_capacity?: number | null;
}

/** El taller padre tiene que ser de la empresa activa: si no, no se escribe nada. */
async function assertWorkshopOwned(workshopId: string, companyId: string): Promise<void> {
  const owned = await prisma.workshops.findFirst({
    where: { id: workshopId, company_id: companyId },
    select: { id: true },
  });
  if (!owned) throw new Error('El taller no pertenece a la empresa activa');
}

export async function createWorkshopSector(
  sector: WorkshopSectorInput
): Promise<{ ok: true; data: WorkshopSector } | { ok: false; error: string }> {
  const companyId = await getActiveCompanyId();
  await assertPermission('sectores_taller', 'create');
  try {
    await assertWorkshopOwned(sector.workshop_id, companyId);

    // Guarda contra duplicados dentro del mismo taller: repetir el alta del mismo
    // sector creaba una segunda fila identica sin ningun aviso (ticket 616).
    const existing = await prisma.workshop_sectors.findFirst({
      where: { workshop_id: sector.workshop_id, name: { equals: sector.name.trim(), mode: 'insensitive' } },
      select: { name: true },
    });
    if (existing) {
      // Se devuelve como dato en vez de lanzarlo: Next reemplaza el mensaje de un
      // Error lanzado en una server action por un texto generico en produccion.
      return { ok: false, error: `Ya existe el sector "${existing.name}" en este taller.` };
    }

    const created = await prisma.workshop_sectors.create({
      data: {
        name: sector.name.trim(),
        description: sector.description ?? null,
        workshop_id: sector.workshop_id,
        is_active: sector.is_active,
        max_capacity: sector.max_capacity ?? null,
      },
      include: sectorInclude,
    });
    logger.info('Sector de taller creado', { data: { sectorId: created.id, companyId } });
    return { ok: true, data: created };
  } catch (error) {
    logger.error('Error al crear sector de taller', { data: { error, companyId } });
    return { ok: false, error: 'No se pudo crear el sector. Intente nuevamente.' };
  }
}

export async function updateWorkshopSector(sector: WorkshopSectorInput & { id: string }): Promise<WorkshopSector> {
  const companyId = await getActiveCompanyId();
  await assertPermission('sectores_taller', 'update');
  const { id, ...input } = sector;
  try {
    const [owned] = await Promise.all([
      prisma.workshop_sectors.findFirst({ where: { id, company_id: companyId }, select: { id: true } }),
      assertWorkshopOwned(input.workshop_id, companyId),
    ]);
    if (!owned) throw new Error('Sector no encontrado en la empresa activa');
    const updated = await prisma.workshop_sectors.update({
      where: { id },
      data: {
        name: input.name.trim(),
        description: input.description ?? null,
        workshop_id: input.workshop_id,
        is_active: input.is_active,
        max_capacity: input.max_capacity ?? null,
        updated_at: new Date(),
      },
      include: sectorInclude,
    });
    logger.info('Sector de taller actualizado', { data: { sectorId: id, companyId } });
    return updated;
  } catch (error) {
    logger.error('Error al actualizar sector de taller', { data: { error, sectorId: id, companyId } });
    throw new Error('Error updating workshop sector');
  }
}
