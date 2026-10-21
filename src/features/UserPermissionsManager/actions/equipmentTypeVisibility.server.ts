'use server';

import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getSessionUserId } from '@/shared/lib/session';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { z } from 'zod';

/**
 * Ticket 690 — visibilidad de solicitudes de mantenimiento por tipo de equipamiento.
 *
 * - Por rol (opt-out): una fila en `role_hidden_equipment_types` = el rol NO ve ese tipo.
 * - Por usuario: `user_equipment_type_visibility.is_visible` pisa lo que resuelven sus roles.
 *
 * La resolución que aplica el módulo Mantenimiento vive en
 * `features/Mantenimiento/utils/equipmentTypeVisibility.ts`; acá solo se lee y se edita
 * la configuración.
 */

const logger = new Logger('features/UserPermissionsManager/equipmentTypeVisibility');

const OTHER_EQUIPMENT = 'other_equipment';

const roleEquipmentTypeChangesSchema = z.object({
  hide: z.array(z.string().uuid()),
  show: z.array(z.string().uuid()),
});

const userEquipmentTypeSchema = z.object({
  userId: z.string().uuid(),
  typeId: z.string().uuid(),
});

/** Error de negocio cuyo mensaje se puede mostrar tal cual (el resto se reemplaza por uno genérico) */
class EquipmentTypeVisibilityError extends Error {}

/**
 * Mismos permisos que protegen hoy cada editor: la edición de roles (`gestion-roles`)
 * y la página de detalle de usuario (`detalle-usuario`).
 */
async function assertCanUpdate(tabSlug: 'gestion-roles' | 'detalle-usuario') {
  const allowed = await checkPermissionServer('configuracion', tabSlug, 'update');
  if (!allowed) {
    throw new EquipmentTypeVisibilityError('No tienes permisos para modificar la visibilidad de tipos de equipamiento');
  }
}

// ─── Catálogo ─────────────────────────────────────────────────────────────────

/**
 * Tipos de equipamiento (otros equipos) activos de la empresa actual o globales,
 * ordenados por nombre. El nombre se devuelve con `trim()`: hay tipos cargados con
 * espacios adelante que, sin recortar, rompen el orden alfabético.
 */
export async function getEquipmentTypesForVisibility() {
  logger.debug('Obteniendo tipos de equipamiento para visibilidad');

  // Las server actions son endpoints públicos: sin sesión no se devuelve nada. La empresa sale
  // de `getActiveCompanyId()` y no del claim crudo: una sesión que la resuelve por cookie veía
  // sólo los tipos globales.
  if (!(await getSessionUserId())) throw new EquipmentTypeVisibilityError('Sesión no válida');
  const companyId = await getActiveCompanyId();

  try {
    const types = await prisma.type.findMany({
      where: {
        applies_to: OTHER_EQUIPMENT,
        is_active: true,
        company_id: companyId,
      },
      select: { id: true, name: true },
    });

    return types
      .map((type) => ({ id: type.id, name: type.name.trim() }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  } catch (error) {
    logger.error('Error al obtener tipos de equipamiento', { data: { error } });
    throw new Error('No se pudieron cargar los tipos de equipamiento');
  }
}

// ─── Rol ──────────────────────────────────────────────────────────────────────

/**
 * Ids de los tipos de equipamiento que el rol tiene ocultos (baseline del editor de rol).
 */
export async function getRoleHiddenEquipmentTypeIds(roleId: number) {
  logger.debug('Obteniendo tipos de equipamiento ocultos del rol', { data: { roleId } });

  if (!Number.isSafeInteger(roleId)) throw new EquipmentTypeVisibilityError('Rol no válido');

  // El chequeo de permiso corre en paralelo con la lectura: no bloquea la query
  const [allowed, rows] = await Promise.all([
    checkPermissionServer('configuracion', 'gestion-roles', 'view'),
    prisma.role_hidden_equipment_types
      .findMany({ where: { role_id: BigInt(roleId) }, select: { type_id: true } })
      .catch((error: unknown) => {
        logger.error('Error al obtener tipos ocultos del rol', { data: { error, roleId } });
        throw new Error('No se pudo cargar la visibilidad de tipos de equipamiento del rol');
      }),
  ]);

  if (!allowed) throw new Error('No tienes permisos para ver la configuración de roles');

  return rows.map((row) => row.type_id);
}

/**
 * Aplica altas y bajas EXPLÍCITAS sobre los tipos ocultos de un rol (nunca reemplazo total):
 * - `hide`: tipos que el rol deja de ver (se crea la fila; si ya existía, no pasa nada).
 * - `show`: tipos que el rol vuelve a ver (se borra solo esa fila).
 * Los tipos que no vienen en ninguna de las dos listas no se tocan.
 *
 * Devuelve lo que realmente cambió en la base.
 */
export async function updateRoleHiddenEquipmentTypes(roleId: number, changes: { hide: string[]; show: string[] }) {
  // Validación de entrada (barata, sin I/O) antes de consultar permisos
  const parsed = roleEquipmentTypeChangesSchema.safeParse(changes);
  if (!Number.isSafeInteger(roleId) || !parsed.success) {
    throw new EquipmentTypeVisibilityError('Los tipos de equipamiento enviados no son válidos');
  }

  logger.debug('Actualizando tipos de equipamiento ocultos del rol', {
    data: { roleId, hide: parsed.data.hide.length, show: parsed.data.show.length },
  });

  await assertCanUpdate('gestion-roles');

  const hide = [...new Set(parsed.data.hide)];
  const show = [...new Set(parsed.data.show)];
  if (hide.some((typeId) => show.includes(typeId))) {
    throw new EquipmentTypeVisibilityError('Un tipo de equipamiento no puede ocultarse y mostrarse a la vez');
  }
  if (hide.length === 0 && show.length === 0) return { hidden: 0, shown: 0 };

  try {
    // Queries secuenciales: una transacción interactiva usa una sola conexión
    return await prisma.$transaction(async (tx) => {
      const role = await tx.roles.findUnique({
        where: { id: BigInt(roleId) },
        select: { is_system: true },
      });
      if (!role) throw new EquipmentTypeVisibilityError('El rol no existe');
      // Mismo criterio que updateRoleWithPermissions: los roles de sistema no se editan
      if (role.is_system) throw new EquipmentTypeVisibilityError('No se pueden modificar roles del sistema');

      // Solo se ocultan tipos de "otros equipos": los vehículos no se filtran por tipo
      const validHideTypes =
        hide.length > 0
          ? await tx.type.findMany({
              where: { id: { in: hide }, applies_to: OTHER_EQUIPMENT },
              select: { id: true },
            })
          : [];

      const created =
        validHideTypes.length > 0
          ? await tx.role_hidden_equipment_types.createMany({
              data: validHideTypes.map((type) => ({ role_id: BigInt(roleId), type_id: type.id })),
              skipDuplicates: true,
            })
          : { count: 0 };

      const deleted =
        show.length > 0
          ? await tx.role_hidden_equipment_types.deleteMany({
              where: { role_id: BigInt(roleId), type_id: { in: show } },
            })
          : { count: 0 };

      return { hidden: created.count, shown: deleted.count };
    });
  } catch (error) {
    logger.error('Error al actualizar tipos ocultos del rol', { data: { error, roleId } });
    if (error instanceof EquipmentTypeVisibilityError) throw error;
    throw new Error('No se pudo guardar la visibilidad de tipos de equipamiento del rol');
  }
}

// ─── Usuario ──────────────────────────────────────────────────────────────────

/**
 * Configuración de visibilidad de un usuario (`userId` = credential_id de auth):
 * - `roles`: sus roles activos con los tipos que oculta cada uno (para explicar el origen).
 * - `hiddenByRolesTypeIds`: lo que resuelven los roles — oculto solo si lo ocultan TODOS
 *   (misma regla que `getHiddenEquipmentTypeIds` de Mantenimiento).
 * - `overrides`: excepciones propias del usuario, que pisan lo anterior.
 */
export async function getUserEquipmentTypeVisibility(userId: string) {
  logger.debug('Obteniendo visibilidad de tipos de equipamiento del usuario', { data: { userId } });

  if (!z.string().uuid().safeParse(userId).success) throw new EquipmentTypeVisibilityError('Usuario no válido');

  // Los roles son por empresa: la pantalla muestra los que el usuario tiene en la activa.
  const companyId = await getActiveCompanyId();

  const [allowed, data] = await Promise.all([
    checkPermissionServer('configuracion', 'detalle-usuario', 'view'),
    Promise.all([
      prisma.user_roles.findMany({
        where: { user_id: userId, company_id: companyId, roles: { is_active: true } },
        orderBy: { assigned_at: 'asc' },
        select: {
          roles: {
            select: {
              id: true,
              name: true,
              color: true,
              role_hidden_equipment_types: { select: { type_id: true } },
            },
          },
        },
      }),
      prisma.user_equipment_type_visibility.findMany({
        where: { user_id: userId },
        select: { type_id: true, is_visible: true },
      }),
    ]).catch((error: unknown) => {
      logger.error('Error al obtener visibilidad de tipos del usuario', { data: { error, userId } });
      throw new Error('No se pudo cargar la visibilidad de tipos de equipamiento del usuario');
    }),
  ]);

  if (!allowed) throw new Error('No tienes permisos para ver la configuración de este usuario');

  const [userRoles, overrides] = data;

  const roles = userRoles.map(({ roles: role }) => ({
    id: Number(role.id),
    name: role.name,
    color: role.color,
    hiddenTypeIds: role.role_hidden_equipment_types.map((hidden) => hidden.type_id),
  }));

  const [firstRole, ...otherRoles] = roles;
  const hiddenByRolesTypeIds = firstRole
    ? firstRole.hiddenTypeIds.filter((typeId) => otherRoles.every((role) => role.hiddenTypeIds.includes(typeId)))
    : [];

  return {
    roles,
    hiddenByRolesTypeIds,
    overrides: overrides.map((override) => ({ typeId: override.type_id, isVisible: override.is_visible })),
  };
}

export type UserEquipmentTypeVisibility = Awaited<ReturnType<typeof getUserEquipmentTypeVisibility>>;

/**
 * Crea o actualiza la excepción del usuario para un tipo (upsert).
 */
export async function setUserEquipmentTypeVisibility(userId: string, typeId: string, isVisible: boolean) {
  logger.debug('Seteando excepción de visibilidad de tipo', { data: { userId, typeId, isVisible } });

  const parsed = userEquipmentTypeSchema.safeParse({ userId, typeId });
  if (!parsed.success || typeof isVisible !== 'boolean') {
    throw new EquipmentTypeVisibilityError('Los datos enviados no son válidos');
  }

  await assertCanUpdate('detalle-usuario');

  try {
    const saved = await prisma.user_equipment_type_visibility.upsert({
      where: { user_id_type_id: { user_id: userId, type_id: typeId } },
      create: { user_id: userId, type_id: typeId, is_visible: isVisible },
      update: { is_visible: isVisible, updated_at: new Date() },
      select: { type_id: true, is_visible: true },
    });

    return { typeId: saved.type_id, isVisible: saved.is_visible };
  } catch (error) {
    logger.error('Error al setear excepción de visibilidad de tipo', { data: { error, userId, typeId } });
    throw new Error('No se pudo guardar la visibilidad del tipo de equipamiento');
  }
}

/**
 * Borra la excepción del usuario para un tipo: vuelve a heredar lo que resuelven sus roles.
 */
export async function removeUserEquipmentTypeVisibility(userId: string, typeId: string) {
  logger.debug('Removiendo excepción de visibilidad de tipo', { data: { userId, typeId } });

  const parsed = userEquipmentTypeSchema.safeParse({ userId, typeId });
  if (!parsed.success) throw new EquipmentTypeVisibilityError('Los datos enviados no son válidos');

  await assertCanUpdate('detalle-usuario');

  try {
    const deleted = await prisma.user_equipment_type_visibility.deleteMany({
      where: { user_id: userId, type_id: typeId },
    });

    return { removed: deleted.count };
  } catch (error) {
    logger.error('Error al remover excepción de visibilidad de tipo', { data: { error, userId, typeId } });
    throw new Error('No se pudo restablecer la visibilidad del tipo de equipamiento');
  }
}
