'use server';

import { getUserAccessibleModulesServer } from '@/features/Permissions';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('features/Layout/search');

/** Resultados por tipo: el buscador es para ir directo, no para listar. */
const TAKE = 6;

/**
 * Buscador "Ir a…" del encabezado (mapa v2): personas por legajo, nombre o CUIL; unidades y equipos
 * auxiliares por dominio, interno o serie; clientes por nombre.
 *
 * Cada tipo se busca solo si el usuario tiene acceso al módulo que lo muestra, siempre dentro de la
 * empresa activa. Incluye inactivos (egresados, fuera de flota): el buscador también sirve para
 * encontrar historia; el resultado lo marca.
 */
export async function searchGlobalResources(rawQuery: string) {
  const query = rawQuery.trim();
  if (query.length < 2) return { people: [], units: [], auxiliary: [], clients: [] };

  try {
    const [companyId, modules] = await Promise.all([getActiveCompanyId(), getUserAccessibleModulesServer()]);
    const accessible = new Set(modules.map((module) => module.module_slug));
    const contains = { contains: query, mode: 'insensitive' as const };

    const [people, units, auxiliary, clients] = await Promise.all([
      accessible.has('empleados')
        ? prisma.employees.findMany({
            where: {
              company_id: companyId,
              OR: [{ file: contains }, { lastname: contains }, { firstname: contains }, { cuil: contains }],
            },
            select: { id: true, file: true, firstname: true, lastname: true, is_active: true },
            orderBy: [{ is_active: 'desc' }, { lastname: 'asc' }],
            take: TAKE,
          })
        : [],
      accessible.has('equipos')
        ? prisma.vehicles.findMany({
            where: {
              company_id: companyId,
              OR: [{ domain: contains }, { intern_number: contains }, { serie: contains }],
            },
            select: { id: true, domain: true, intern_number: true, serie: true, is_active: true },
            orderBy: [{ is_active: 'desc' }, { domain: 'asc' }],
            take: TAKE,
          })
        : [],
      accessible.has('equipos')
        ? prisma.other_equipment.findMany({
            where: { company_id: companyId, OR: [{ intern_number: contains }, { serial_number: contains }] },
            select: { id: true, intern_number: true, serial_number: true, is_active: true },
            orderBy: [{ is_active: 'desc' }, { intern_number: 'asc' }],
            take: TAKE,
          })
        : [],
      accessible.has('comercial')
        ? prisma.customers.findMany({
            where: { company_id: companyId, name: contains },
            select: { id: true, name: true, is_active: true },
            orderBy: [{ is_active: 'desc' }, { name: 'asc' }],
            take: TAKE,
          })
        : [],
    ]);

    return { people, units, auxiliary, clients };
  } catch (error) {
    logger.error('Error en el buscador global', { data: { error, query } });
    throw error;
  }
}

export type GlobalSearchResults = Awaited<ReturnType<typeof searchGlobalResources>>;
