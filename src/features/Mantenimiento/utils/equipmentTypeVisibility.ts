import 'server-only';

import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { cache } from 'react';

const logger = new Logger('Mantenimiento/equipmentTypeVisibility');

/**
 * Tipos de equipamiento cuyas solicitudes/órdenes de mantenimiento NO ve el usuario
 * actual (ticket 690). Se aplica con `visibleEquipmentTypeCondition` en cada `where`.
 *
 * Reglas, espejo de role_permissions / user_permissions:
 * - Por rol (opt-out): un tipo queda oculto solo si TODOS los roles activos del
 *   usuario lo ocultan. Con que un rol lo muestre, lo ve (misma unión que los permisos).
 * - Por usuario: la excepción de `user_equipment_type_visibility` manda sobre los roles.
 * - Sin configuración, no se oculta nada.
 *
 * Módulo server-only (no es una Server Action). Si la consulta falla, lanza (falla cerrado).
 * Devuelve los ids ordenados para que sirvan de argumento estable a funciones
 * `'use cache'`. Memoizada por request: la consultan todas las tablas y contadores
 * del módulo en el mismo render.
 */
export async function getHiddenEquipmentTypeIds(): Promise<string[]> {
  return loadHiddenEquipmentTypeIds();
}

const loadHiddenEquipmentTypeIds = cache(async (): Promise<string[]> => {
  const profile = await getServerAuthProfile();
  if (!profile) return [];

  try {
    // Los roles son por empresa: sólo cuentan los de la empresa activa. Va DENTRO del try
    // porque `getActiveCompanyId()` lanza si no hay empresa y esta función no lanza nunca.
    const companyId = await getActiveCompanyId();

    // user_roles / user_equipment_type_visibility usan el id de auth (credentialId)
    const [userRoles, userOverrides] = await Promise.all([
      prisma.user_roles.findMany({
        where: { user_id: profile.credentialId, company_id: companyId, roles: { is_active: true } },
        select: { roles: { select: { role_hidden_equipment_types: { select: { type_id: true } } } } },
      }),
      prisma.user_equipment_type_visibility.findMany({
        where: { user_id: profile.credentialId },
        select: { type_id: true, is_visible: true },
      }),
    ]);

    const hiddenPerRole = userRoles.map(
      (userRole) => new Set(userRole.roles.role_hidden_equipment_types.map((hidden) => hidden.type_id))
    );
    const [firstRole, ...otherRoles] = hiddenPerRole;
    const hidden = new Set(
      firstRole ? [...firstRole].filter((typeId) => otherRoles.every((role) => role.has(typeId))) : []
    );

    for (const override of userOverrides) {
      if (override.is_visible) hidden.delete(override.type_id);
      else hidden.add(override.type_id);
    }

    return [...hidden].sort();
  } catch (error) {
    // Falla cerrado: si no se puede resolver qué tipos están ocultos, se propaga el error en
    // vez de mostrar de más (devolver [] exponía equipos que el usuario no debe ver).
    logger.error('Error al resolver los tipos de equipamiento ocultos', {
      data: { error, profileId: profile.id },
    });
    throw error;
  }
});
