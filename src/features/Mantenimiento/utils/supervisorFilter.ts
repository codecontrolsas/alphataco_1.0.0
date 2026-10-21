import 'server-only';

import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { cache } from 'react';

const logger = new Logger('Mantenimiento/supervisorFilter');

/**
 * Información del usuario actual y si puede ver todas las solicitudes
 */
export interface SupervisorFilterInfo {
  /** ID del usuario actual (profile.id — UUID interno usado en FKs como supervisor_id) */
  userId: string;
  /** Si el usuario tiene permiso para ver todas las solicitudes (view_all_requests) */
  hasViewAllPermission: boolean;
  /** Si el usuario NO tiene el permiso, se debe filtrar por supervisor_id = userId */
  shouldFilterBySupervisor: boolean;
}

/**
 * Obtiene la información necesaria para aplicar el filtro de supervisor.
 *
 * Reglas:
 * - Si el usuario tiene el permiso 'view_all_requests' en alguna tab de operaciones → puede ver TODAS las solicitudes
 * - Si el usuario NO tiene el permiso → solo ve solicitudes donde supervisor_id = su user_id
 *
 * Memoizada por request con React.cache: el módulo monta todas sus pestañas en
 * el mismo render y cada tabla la consulta (listado, export, facets, contadores
 * del pipeline). Sin memoizar eran 2 round-trips repetidos por cada llamada.
 *
 * @returns SupervisorFilterInfo con la información del usuario y si debe aplicar filtro
 */
export async function getSupervisorFilterInfo(): Promise<SupervisorFilterInfo | null> {
  return loadSupervisorFilterInfo();
}

const loadSupervisorFilterInfo = cache(async (): Promise<SupervisorFilterInfo | null> => {
  const profile = await getServerAuthProfile();

  if (!profile) {
    logger.warn('No se pudo obtener el perfil del usuario actual');
    return null;
  }

  // Tabs de operaciones de mantenimiento que usan este filtro
  const operationsTabs = ['maintenance_requests', 'pendientes_ejecutar', 'para_taller'];

  try {
    // El rol vale en la empresa donde se otorgó: el permiso se evalúa en la empresa activa.
    // Va DENTRO del try porque `getActiveCompanyId()` lanza si no hay empresa y esta función
    // devuelve `null` ante cualquier error.
    const companyId = await getActiveCompanyId();

    // Verificar permisos basados en rol (role_permissions → roles → user_roles → users)
    const rolePermsCount = await prisma.role_permissions.count({
      where: {
        roles: {
          is_active: true,
          user_roles: {
            some: {
              user_id: profile.credentialId,
              company_id: companyId,
            },
          },
        },
        tabs: { slug: { in: operationsTabs } },
        actions: { slug: 'view_all_requests' },
      },
    });

    // Verificar permisos específicos por usuario (user_permissions.user_id = users.id = credentialId).
    // El permiso custom también vale sólo en la empresa donde se otorgó (Task 13b).
    const userPermsCount = await prisma.user_permissions.count({
      where: {
        user_id: profile.credentialId,
        company_id: companyId,
        tabs: { slug: { in: operationsTabs } },
        actions: { slug: 'view_all_requests' },
        is_granted: true,
      },
    });

    const hasViewAllPermission = rolePermsCount > 0 || userPermsCount > 0;

    logger.debug('Permiso view_all_requests verificado', {
      data: { profileId: profile.id, hasViewAllPermission, rolePermsCount, userPermsCount },
    });

    return {
      userId: profile.id,
      hasViewAllPermission,
      shouldFilterBySupervisor: !hasViewAllPermission,
    };
  } catch (error) {
    logger.error('Error al verificar permisos del usuario', {
      data: { error, profileId: profile.id },
    });
    // En caso de error, asumir que NO tiene el permiso (más restrictivo)
    return {
      userId: profile.id,
      hasViewAllPermission: false,
      shouldFilterBySupervisor: true,
    };
  }
});
