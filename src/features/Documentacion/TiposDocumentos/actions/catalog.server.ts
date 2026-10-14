'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { hasDocTypePermission } from '../lib/document-type-permissions';

const logger = new Logger('features/TiposDocumentos/catalog');

// ============================================================================
// CATALOG SEARCH — para MultiSelectField (búsqueda de opciones FK)
// ============================================================================

type CatalogEntry = {
  /**
   * @param parentIds - IDs de la condición padre (catálogos dependientes, ej: subtipos
   *   filtrados por los tipos elegidos). La mayoría de catálogos lo ignoran.
   */
  find: (query: string, companyId: string, parentIds?: string[]) => Promise<{ id: string; name: string }[]>;
};

const CATALOG_MAP: Record<string, CatalogEntry> = {
  hierarchy: {
    // hierarchy does not have company_id — it's a global catalog
    find: async (query, _companyId) => {
      const rows = await prisma.hierarchy.findMany({
        where: {
          is_active: true,
          name: { contains: query, mode: 'insensitive' },
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 20,
      });
      return rows.map((r) => ({ id: r.id, name: r.name }));
    },
  },
  types_of_contract: {
    find: async (query, _companyId) => {
      const rows = await prisma.types_of_contract.findMany({
        where: {
          is_active: true,
          name: { contains: query, mode: 'insensitive' },
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 20,
      });
      return rows.map((r) => ({ id: r.id, name: r.name }));
    },
  },
  provinces: {
    // provinces does not have company_id — it's a global catalog
    find: async (query, _companyId) => {
      const rows = await prisma.provinces.findMany({
        where: {
          name: { contains: query, mode: 'insensitive' },
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 20,
      });
      return rows.map((r) => ({ id: String(r.id), name: r.name ?? '' }));
    },
  },
  company_positions: {
    // company_positions does not have company_id in schema
    find: async (query, _companyId) => {
      const rows = await prisma.company_positions.findMany({
        where: {
          is_active: true,
          name: { contains: query, mode: 'insensitive' },
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 20,
      });
      return rows.map((r) => ({ id: r.id, name: r.name ?? '' }));
    },
  },
  category: {
    find: async (query, _companyId) => {
      const rows = await prisma.category.findMany({
        where: {
          is_active: true,
          name: { contains: query, mode: 'insensitive' },
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 20,
      });
      return rows.map((r) => ({ id: r.id, name: r.name ?? '' }));
    },
  },
  guild: {
    find: async (query, companyId) => {
      const rows = await prisma.guild.findMany({
        where: {
          company_id: companyId,
          is_active: true,
          name: { contains: query, mode: 'insensitive' },
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 20,
      });
      return rows.map((r) => ({ id: r.id, name: r.name ?? '' }));
    },
  },
  covenant: {
    find: async (query, companyId) => {
      const rows = await prisma.covenant.findMany({
        where: {
          company_id: companyId,
          is_active: true,
          name: { contains: query, mode: 'insensitive' },
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 20,
      });
      return rows.map((r) => ({ id: r.id, name: r.name ?? '' }));
    },
  },
  cost_center: {
    // cost_center does not have company_id in schema
    find: async (query, _companyId) => {
      const rows = await prisma.cost_center.findMany({
        where: {
          is_active: true,
          name: { contains: query, mode: 'insensitive' },
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 20,
      });
      return rows.map((r) => ({ id: r.id, name: r.name }));
    },
  },
  brand_vehicles: {
    find: async (query, companyId) => {
      const rows = await prisma.brand_vehicles.findMany({
        where: {
          company_id: companyId,
          is_active: true,
          name: { contains: query, mode: 'insensitive' },
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 20,
      });
      return rows.map((r) => ({ id: String(r.id), name: r.name ?? '' }));
    },
  },
  model_vehicles: {
    // model_vehicles does not have company_id
    find: async (query, _companyId) => {
      const rows = await prisma.model_vehicles.findMany({
        where: {
          is_active: true,
          name: { contains: query, mode: 'insensitive' },
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 20,
      });
      return rows.map((r) => ({ id: String(r.id), name: r.name ?? '' }));
    },
  },
  types_of_vehicles: {
    // types_of_vehicles does not have company_id
    find: async (query, _companyId) => {
      const rows = await prisma.types_of_vehicles.findMany({
        where: {
          is_active: true,
          name: { contains: query, mode: 'insensitive' },
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 20,
      });
      return rows.map((r) => ({ id: String(r.id), name: r.name ?? '' }));
    },
  },
  customers: {
    find: async (query, companyId) => {
      const rows = await prisma.customers.findMany({
        where: {
          company_id: companyId,
          is_active: true,
          name: { contains: query, mode: 'insensitive' },
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 20,
      });
      return rows.map((r) => ({ id: r.id, name: r.name ?? '' }));
    },
  },
  aptitudes_tecnicas: {
    // aptitudes_tecnicas uses 'nombre' field, not 'name'
    find: async (query, _companyId) => {
      const rows = await prisma.aptitudes_tecnicas.findMany({
        where: {
          is_active: true,
          nombre: { contains: query, mode: 'insensitive' },
        },
        select: { id: true, nombre: true },
        orderBy: { nombre: 'asc' },
        take: 20,
      });
      return rows.map((r) => ({ id: r.id, name: r.nombre }));
    },
  },
  work_diagram: {
    find: async (query, _companyId) => {
      const rows = await prisma.work_diagram.findMany({
        where: {
          is_active: true,
          name: { contains: query, mode: 'insensitive' },
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 20,
      });
      return rows.map((r) => ({ id: r.id, name: r.name }));
    },
  },
  workshop_sectors: {
    // workshop_sectors does not have company_id — it belongs to a workshop via workshop_id
    find: async (query, _companyId) => {
      const rows = await prisma.workshop_sectors.findMany({
        where: {
          is_active: true,
          name: { contains: query, mode: 'insensitive' },
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 20,
      });
      return rows.map((r) => ({ id: r.id, name: r.name }));
    },
  },
  type: {
    // 'type' = vehicle type
    find: async (query, companyId) => {
      const rows = await prisma.type.findMany({
        where: {
          company_id: companyId,
          is_active: true,
          name: { contains: query, mode: 'insensitive' },
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 20,
      });
      return rows.map((r) => ({ id: r.id, name: r.name }));
    },
  },
  sub_type: {
    // 'sub_type' = vehicle subtype. Si se reciben parentIds (tipos elegidos),
    // filtra los subtipos por su columna escalar 'type' (FK -> type.id).
    // Sin `take`: el catálogo es chico y con varios tipos elegidos supera los 20,
    // así que un límite dejaba subtipos válidos fuera de la lista (ticket 695).
    find: async (query, companyId, parentIds) => {
      const rows = await prisma.sub_type.findMany({
        where: {
          company_id: companyId,
          is_active: true,
          name: { contains: query, mode: 'insensitive' },
          ...(parentIds && parentIds.length > 0 ? { type: { in: parentIds } } : {}),
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      return rows.map((r) => ({ id: r.id, name: r.name }));
    },
  },
};

export type CatalogKey = keyof typeof CATALOG_MAP;

/**
 * Busca opciones en un catálogo para los MultiSelectField de condiciones.
 * Retorna coincidencias ordenadas por nombre (hasta 20 por catálogo, salvo subtipos que van completos).
 */
export async function searchCatalogForConditions(
  catalogKey: CatalogKey,
  query: string,
  parentIds?: string[]
): Promise<{ id: string; name: string }[]> {
  const companyId = await getActiveCompanyId();

  logger.debug('Buscando en catálogo', { data: { catalogKey, query } });

  try {
    // Solo quien edita condiciones de tipos de personas o equipos necesita estos catálogos.
    const [canViewPersonas, canViewEquipos] = await Promise.all([
      hasDocTypePermission('Persona', 'view'),
      hasDocTypePermission('Equipos', 'view'),
    ]);
    if (!canViewPersonas && !canViewEquipos) {
      logger.warn('Búsqueda de catálogo sin permiso', { data: { catalogKey } });
      return [];
    }

    const entry = CATALOG_MAP[catalogKey];
    if (!entry) {
      logger.warn('Catálogo no encontrado', { data: { catalogKey } });
      return [];
    }

    return await entry.find(query, companyId, parentIds);
  } catch (error) {
    logger.error('Error al buscar en catálogo', { data: { error, catalogKey } });
    return [];
  }
}
