'use server';

import { requireMaintenancePermission } from '@/features/Mantenimiento/shared/permissions.server';
import { Logger } from '@/lib/logger';
import { CACHE_TAGS } from '@/shared/constants/cache';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { runInCompanyScope } from '@/shared/lib/tenant-context';
import { cacheLife, cacheTag } from 'next/cache';
import { MAINTENANCE_REQUEST_FULL_SELECT, mapRequestWithAliases } from './request-select';

const serverLogger = new Logger('SolicitudesMantenimiento/queries');

/**
 * Lectura cacheada de una solicitud, acotada a una empresa.
 *
 * La empresa llega por parámetro porque una función `'use cache'` no puede leer la sesión
 * (ni cookies ni headers): el helper `getActiveCompanyId()` la resuelve en la action de
 * abajo y la pasa acá, que además la vuelve parte de la clave de caché.
 */
async function getCachedMaintenanceRequestById(requestId: string, companyId: string) {
  'use cache';
  cacheTag(CACHE_TAGS.MAINTENANCE_REQUESTS);
  cacheLife({ expire: 15, revalidate: 15, stale: 5 });
  return runInCompanyScope(companyId, () => getCachedMaintenanceRequestByIdQuery(requestId, companyId));
}

/** Cuerpo de `getCachedMaintenanceRequestById`: corre dentro de `runInCompanyScope` (la RLS necesita la empresa). */
async function getCachedMaintenanceRequestByIdQuery(requestId: string, companyId: string) {
  try {
    const request = await prisma.maintenance_requests.findFirst({
      where: withCompany({ id: requestId }, companyId),
      select: MAINTENANCE_REQUEST_FULL_SELECT,
    });

    if (!request) {
      serverLogger.warn('Solicitud no encontrada', { data: { requestId } });
      return null;
    }

    return mapRequestWithAliases(request);
  } catch (error) {
    serverLogger.error('Error al obtener solicitud de mantenimiento', { data: { error, requestId } });
    throw error;
  }
}

/**
 * Obtiene una solicitud de mantenimiento por ID, acotada a la empresa activa.
 */
export async function getMaintenanceRequestById(requestId: string) {
  // Se abre desde la tab de solicitudes: exige `view` en ella.
  await requireMaintenancePermission('maintenance_requests', 'view');
  const companyId = await getActiveCompanyId();
  return getCachedMaintenanceRequestById(requestId, companyId);
}

// Solicitud con items, equipo y pedido asociado (forma que consumen los diálogos de solicitudes)
export type MaintenanceRequestData = NonNullable<Awaited<ReturnType<typeof getMaintenanceRequestById>>>;
