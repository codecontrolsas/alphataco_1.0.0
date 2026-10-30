import 'server-only';

import { isModuleEnabledForCompany } from '@/features/Modules/server/modules.server';
import { getMyHseDocuments } from '@/features/Portal/actions/hse-documents.queries';
import { getMyHseTrainings } from '@/features/Portal/actions/hse-trainings.queries';
import { getPortalEmployeeForPage, type PortalEmployee } from '@/features/Portal/actions/perimeter';
import { summarizeWork } from '@/features/Portal/lib/work-summary';
import { Logger } from '@/lib/logger';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import {
  PORTAL_SECTIONS,
  getPortalSection,
  type PortalBadgeCounts,
  type PortalBadgeKey,
  type PortalSectionId,
} from './registry';

/**
 * Lado servidor del registro de navegación: qué secciones ve el empleado (corte por módulo de la empresa de SU legajo)
 * y los contadores de pendientes de cada una. Nunca se decide con datos del cliente.
 */

const logger = new Logger('features/Portal/navigation');

/** Ids de las secciones visibles para la empresa del legajo. Memoizado por request. */
export const getVisiblePortalSectionIds = cache(async (companyId: string): Promise<string[]> => {
  const flags = await Promise.all(
    PORTAL_SECTIONS.map(async (s) => {
      const module = 'module' in s ? s.module : undefined;
      return !module || (await isModuleEnabledForCompany(module, companyId));
    })
  );
  return PORTAL_SECTIONS.filter((_, i) => flags[i]).map((s) => s.id);
});

/**
 * Para las páginas de una sección: el empleado de la sesión (redirige al login si no hay) y 404 si el módulo de la
 * sección está apagado para su empresa. Así una URL escrita a mano no abre una sección que el menú no muestra.
 */
export async function requirePortalSection(id: PortalSectionId): Promise<PortalEmployee> {
  const employee = await getPortalEmployeeForPage();
  const section = getPortalSection(id);
  if (section.module && !(await getVisiblePortalSectionIds(employee.companyId)).includes(id)) notFound();
  return employee;
}

/**
 * Resolvers de los contadores del menú, uno por clave del registro. Sumar un badge nuevo es agregar su clave en
 * `PORTAL_BADGE_KEYS` y su resolver acá. Reciben el MISMO objeto `employee` de la sesión: las consultas con `cache()`
 * se comparten con la página (el inicio y las listas no vuelven a consultar).
 */
const BADGE_RESOLVERS: Record<PortalBadgeKey, (employee: PortalEmployee) => Promise<number>> = {
  documents: async (employee) => {
    const documents = await getMyHseDocuments(employee);
    return summarizeWork(documents, []).documentsBadge;
  },
  trainings: async (employee) => {
    const trainings = await getMyHseTrainings(employee);
    return summarizeWork([], trainings).trainingsBadge;
  },
};

/** Contadores de las secciones visibles. Si uno falla, esa sección queda sin badge (no rompe el menú). */
export async function getPortalBadgeCounts(
  employee: PortalEmployee,
  visibleIds: readonly string[]
): Promise<PortalBadgeCounts> {
  const keys = PORTAL_SECTIONS.flatMap((s) => ('badge' in s && s.badge && visibleIds.includes(s.id) ? [s.badge] : []));
  const entries = await Promise.all(
    keys.map(async (key) => {
      try {
        return [key, await BADGE_RESOLVERS[key](employee)] as const;
      } catch (error) {
        logger.warn('No se pudo calcular un contador del menú', { data: { key, error } });
        return [key, 0] as const;
      }
    })
  );
  return Object.fromEntries(entries);
}
