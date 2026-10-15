'use server';

import { buildPermissionIndex, permissionKey } from '@/features/UserPermissionsManager/lib/permission-rules';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getSessionUserId } from '@/shared/lib/session';
import { callFunction } from '@/shared/lib/sql';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import moment from 'moment';
import { z } from 'zod';
import {
  assertNoNewActionsWithoutView,
  assertNoOverlap,
  assertPairsInCatalog,
  roleUpdateSchema,
  userPermissionChangesSchema,
  type UserPermissionChanges,
} from '../lib/permission-write-validation';
import { findTabDef } from '../lib/permissions-map-utils';
import { TAB_DESCRIPTIONS, resolveActionCopy } from '../permission-catalog';
import { PERMISSIONS } from '../permissions-map';
import { userPermissionRowSchema } from './permissions.schemas';
import { checkPermissionServer } from './permissions.server';

const logger = new Logger('features/Permissions/roles');

// ─── Perímetro ──────────────────────────────────────────────────────────────────
// Sin RLS: cada 'use server' exportado es un endpoint público. Sólo quien tiene
// permiso de gestión de roles (tab 'gestion-roles') o de edición del detalle de
// usuario (tab 'detalle-usuario', módulo 'empresa') puede escribir acá.

class PermissionDeniedError extends Error {}

async function assertCanManageRoles(): Promise<void> {
  const allowed = await checkPermissionServer('configuracion', 'gestion-roles', 'update');
  if (!allowed) throw new PermissionDeniedError('No tienes permisos para gestionar roles');
}

async function assertCanManageUserAssignments(): Promise<void> {
  const [canManageRoles, canManageUserDetail] = await Promise.all([
    checkPermissionServer('configuracion', 'gestion-roles', 'update'),
    checkPermissionServer('configuracion', 'detalle-usuario', 'update'),
  ]);
  if (!canManageRoles && !canManageUserDetail) {
    throw new PermissionDeniedError('No tienes permisos para gestionar la asignación de roles del usuario');
  }
}

async function assertCanManageUserDetail(): Promise<void> {
  const allowed = await checkPermissionServer('configuracion', 'detalle-usuario', 'update');
  if (!allowed) throw new PermissionDeniedError('No tienes permisos para modificar los permisos de este usuario');
}

// Lecturas por id arbitrario: mismo criterio fail-closed que las escrituras. `userId` es
// SIEMPRE el propio dato del usuario (permiso implícito: ver lo propio) o requiere permiso
// explícito de lectura sobre 'detalle-usuario' (contexto donde se consumen estas dos lecturas
// — ver `UserPermissionsManager.tsx` y `app/dashboard/configuration/user/[id]/page.tsx`).
async function assertCanReadUserData(userId: string): Promise<void> {
  const sessionUserId = await getSessionUserId();
  if (sessionUserId && sessionUserId === userId) return;

  const allowed = await checkPermissionServer('configuracion', 'detalle-usuario', 'view');
  if (!allowed) throw new PermissionDeniedError('Sin permiso');
}

// `getRolePermissionsServer` no tiene noción de "propio dato" (es el detalle de un ROL, no
// de un usuario): sólo gestión de roles puede leerlo.
async function assertCanReadRolePermissions(): Promise<void> {
  const allowed = await checkPermissionServer('configuracion', 'gestion-roles', 'view');
  if (!allowed) throw new PermissionDeniedError('Sin permiso');
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type RoleWithCount = Awaited<ReturnType<typeof getAllRolesWithCounts>>[number];
export type AllRolePermissionsMap = Awaited<ReturnType<typeof getAllRolePermissions>>;
export type ModulesWithTabsData = Awaited<ReturnType<typeof getModulesWithTabsServer>>;
export type UsersForRoleData = Awaited<ReturnType<typeof getUsersForRoleAssignment>>;

// ─── Read Actions ─────────────────────────────────────────────────────────────

/**
 * Obtiene todos los roles activos con el conteo de usuarios asignados.
 * Elimina el N+1 de getRoles + getRoleUserCounts.
 */
export async function getAllRolesWithCounts() {
  logger.debug('Obteniendo todos los roles con conteos');

  // El catálogo de roles es global, pero la asignación es por empresa: el conteo cuenta
  // los usuarios que tienen el rol EN la empresa activa.
  const companyId = await getActiveCompanyId();

  try {
    const roles = await prisma.roles.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        is_system: true,
        is_active: true,
        slug: true,
        intern: true,
        _count: {
          select: { user_roles: { where: { company_id: companyId } } },
        },
      },
    });

    // Convertir BigInt a number para serialización
    return roles.map((r) => ({
      ...r,
      id: Number(r.id),
      userCount: r._count.user_roles,
    }));
  } catch (error) {
    logger.error('Error al obtener roles con conteos', { data: { error } });
    throw error;
  }
}

/**
 * Obtiene TODOS los role_permissions en una sola query.
 * Retorna un Map<number, Array<{tabId, actionId}>> agrupado por role_id.
 * Elimina el N+1 de una query por RoleCard/RoleTemplateItem.
 */
export async function getAllRolePermissions(): Promise<Map<number, Array<{ tabId: string; actionId: string }>>> {
  logger.debug('Obteniendo todos los permisos de roles');

  try {
    const perms = await prisma.role_permissions.findMany({
      select: {
        role_id: true,
        tab_id: true,
        action_id: true,
        tabs: {
          select: {
            slug: true,
            modules: { select: { slug: true } },
          },
        },
        actions: {
          select: { slug: true },
        },
      },
    });

    const grouped = new Map<number, Array<{ tabId: string; actionId: string }>>();
    for (const p of perms) {
      const roleId = Number(p.role_id);
      if (!grouped.has(roleId)) grouped.set(roleId, []);
      grouped.get(roleId)!.push({ tabId: p.tab_id, actionId: p.action_id });
    }

    return grouped;
  } catch (error) {
    logger.error('Error al obtener todos los permisos de roles', { data: { error } });
    throw error;
  }
}

/**
 * Obtiene los permisos de un único rol.
 * Usado al editar un rol para pre-popular el editor de permisos.
 */
export async function getRolePermissionsServer(roleId: number): Promise<Array<{ tabId: string; actionId: string }>> {
  await assertCanReadRolePermissions();

  logger.debug('Obteniendo permisos del rol', { data: { roleId } });

  try {
    const perms = await prisma.role_permissions.findMany({
      where: { role_id: BigInt(roleId) },
      select: { tab_id: true, action_id: true },
    });

    return perms.map((p) => ({ tabId: p.tab_id, actionId: p.action_id }));
  } catch (error) {
    logger.error('Error al obtener permisos del rol', { data: { error, roleId } });
    throw error;
  }
}

/**
 * Obtiene módulos con tabs y acciones, aplicando allowedActions del permissions-map.
 * Nombre y descripción salen de la base, salvo lo que define `permission-catalog.ts`: la
 * descripción de la tab (por id) y el texto puntual de una acción en una tab (override).
 */
export async function getModulesWithTabsServer() {
  logger.debug('Obteniendo módulos con tabs');

  try {
    const [modules, allTabs, actions] = await Promise.all([
      prisma.modules.findMany({
        where: { is_active: true },
        orderBy: { order_index: 'asc' },
        select: { id: true, name: true, slug: true, icon: true, is_active: true, order_index: true, description: true },
      }),
      prisma.tabs.findMany({
        where: { is_active: true },
        orderBy: { order_index: 'asc' },
        select: {
          id: true,
          module_id: true,
          parent_tab_id: true,
          slug: true,
          name: true,
          description: true,
          order_index: true,
        },
      }),
      prisma.actions.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, slug: true, name: true, description: true },
      }),
    ]);

    type ActionItem = (typeof actions)[number];
    type TabItem = (typeof allTabs)[number] & { actions: ActionItem[]; subtabs: TabWithActions[] };
    type TabWithActions = Omit<TabItem, 'subtabs'> & { subtabs: TabWithActions[] };

    const buildTabHierarchy = (parentId: string | null, moduleId: string, moduleSlug: string): TabWithActions[] => {
      return allTabs
        .filter((tab) => tab.module_id === moduleId && tab.parent_tab_id === parentId)
        .map((tab) => {
          const tabDefinition = findTabDef(PERMISSIONS, moduleSlug, tab.slug);
          // Si la tab no está declarada en permissions-map o no tiene allowedActions,
          // NO mostramos acciones. Antes el fallback era "todas", lo cual permitía que
          // acciones custom (upload_private, view_all_requests, etc.) aparezcan en tabs
          // que nunca las declararon, contaminando role_permissions.
          const allowed = (tabDefinition as { allowedActions?: string[] } | null)?.allowedActions;
          const tabActions = allowed
            ? actions
                .filter((a) => allowed.includes(a.slug))
                .map((a) => ({ ...a, ...resolveActionCopy(moduleSlug, tab.slug, a) }))
            : [];
          return {
            ...tab,
            description: TAB_DESCRIPTIONS[tab.id] ?? tab.description,
            actions: tabActions,
            subtabs: buildTabHierarchy(tab.id, moduleId, moduleSlug),
          };
        });
    };

    return modules.map((module) => ({
      ...module,
      tabs: buildTabHierarchy(null, module.id, module.slug ?? ''),
    }));
  } catch (error) {
    logger.error('Error al obtener módulos con tabs', { data: { error } });
    throw error;
  }
}

/**
 * Obtiene los usuarios de la empresa activa con estado de asignación al rol dado.
 */
export async function getUsersForRoleAssignment(roleId: number) {
  logger.debug('Obteniendo usuarios para asignación de rol', { data: { roleId } });

  const companyId = await getActiveCompanyId();

  try {
    // 1. Obtener usuarios de la empresa a través de share_company_users → profile
    const shareUsers = await prisma.share_company_users.findMany({
      where: { company_id: companyId, is_active: true },
      select: {
        id: true,
        profile: {
          select: {
            id: true,
            fullname: true,
            email: true,
            credential_id: true,
          },
        },
      },
    });

    // 2. Obtener credential_ids que tienen este rol EN esta empresa
    const userRoles = await prisma.user_roles.findMany({
      where: { role_id: BigInt(roleId), company_id: companyId },
      select: { user_id: true },
    });
    const usersWithRole = new Set(userRoles.map((ur) => ur.user_id));

    // 3. Mapear resultados
    return shareUsers
      .filter((su) => su.profile !== null)
      .map((su) => ({
        userId: su.id, // ID de share_company_users para link
        credentialId: su.profile!.credential_id ?? su.profile!.id, // credential_id para operaciones de roles
        userName: su.profile!.fullname ?? 'Sin nombre',
        userEmail: su.profile!.email ?? 'Sin email',
        hasRole: usersWithRole.has(su.profile!.credential_id ?? ''),
      }));
  } catch (error) {
    logger.error('Error al obtener usuarios para asignación de rol', { data: { error, roleId } });
    throw error;
  }
}

// ─── Mutation Actions ─────────────────────────────────────────────────────────

/**
 * Crea un nuevo rol con sus permisos en una sola transacción.
 */
export async function createRoleWithPermissions(data: {
  name: string;
  description?: string;
  color?: string;
  permissions: Array<{ tabId: string; actionId: string }>;
}) {
  await assertCanManageRoles();

  logger.debug('Creando rol con permisos', { data: { name: data.name, permissionsCount: data.permissions.length } });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const newRole = await tx.roles.create({
        data: {
          name: data.name,
          description: data.description ?? null,
          color: data.color ?? null,
          is_active: true,
          is_system: false,
        },
        select: {
          id: true,
          name: true,
          description: true,
          color: true,
          is_system: true,
          is_active: true,
          slug: true,
          intern: true,
        },
      });

      if (data.permissions.length > 0) {
        await tx.role_permissions.createMany({
          data: data.permissions.map((perm) => ({
            role_id: newRole.id,
            tab_id: perm.tabId,
            action_id: perm.actionId,
          })),
          skipDuplicates: true,
        });
      }

      return { ...newRole, id: Number(newRole.id) };
    });

    return result;
  } catch (error) {
    logger.error('Error al crear rol', { data: { error, name: data.name } });
    // Manejar error de nombre duplicado
    if ((error as { code?: string }).code === 'P2002') {
      throw new Error(`Ya existe un rol con el nombre "${data.name}". Por favor, elige un nombre diferente.`);
    }
    throw error;
  }
}

/**
 * Actualiza un rol existente y aplica el delta EXPLÍCITO de permisos en una sola transacción.
 *
 * `permissions.add` / `permissions.remove` son pares (tab, acción): la ausencia de un permiso
 * en la petición no significa nada, nunca se borra "lo que no vino". El borrado queda acotado
 * a los pares de `remove`. Devuelve los conteos reales de altas y bajas.
 */
export async function updateRoleWithPermissions(input: {
  id: number;
  name: string;
  description?: string;
  color?: string;
  permissions: {
    add: Array<{ tab_id: string; action_id: string }>;
    remove: Array<{ tab_id: string; action_id: string }>;
  };
}) {
  await assertCanManageRoles();

  const parsed = roleUpdateSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Datos del rol inválidos');
  const data = parsed.data;

  logger.debug('Actualizando rol con permisos', {
    data: {
      id: data.id,
      name: data.name,
      add: data.permissions.add.length,
      remove: data.permissions.remove.length,
    },
  });

  // El catálogo (mapa + tablas tabs/actions) se resuelve en una sola consulta, fuera de la transacción.
  const index = buildPermissionIndex(await getModulesWithTabsServer());
  assertPairsInCatalog(index, data.permissions.add);
  assertNoOverlap(data.permissions.add, data.permissions.remove);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const updatedRole = await tx.roles.update({
        where: { id: BigInt(data.id), is_system: false },
        data: {
          name: data.name,
          description: data.description ?? null,
          color: data.color ?? null,
          updated_at: moment().toDate(),
        },
        select: {
          id: true,
          name: true,
          description: true,
          color: true,
          is_system: true,
          is_active: true,
          slug: true,
          intern: true,
        },
      });

      // Conjunto final = lo guardado hoy + altas - bajas. Si queda una acción sin su "Ver", se
      // lanza y la transacción entera (incluido el update del rol) se deshace.
      const baselineRows = await tx.role_permissions.findMany({
        where: { role_id: updatedRole.id },
        select: { tab_id: true, action_id: true },
      });
      const before = new Set(baselineRows.map((row) => permissionKey(row.tab_id, row.action_id)));
      const after = new Set(before);
      for (const perm of data.permissions.remove) after.delete(permissionKey(perm.tab_id, perm.action_id));
      for (const perm of data.permissions.add) after.add(permissionKey(perm.tab_id, perm.action_id));
      assertNoNewActionsWithoutView(index, before, after);

      let removed = 0;
      if (data.permissions.remove.length > 0) {
        const deleted = await tx.role_permissions.deleteMany({
          where: {
            role_id: updatedRole.id,
            OR: data.permissions.remove.map((perm) => ({
              tab_id: perm.tab_id,
              action_id: perm.action_id,
            })),
          },
        });
        removed = deleted.count;
      }

      let added = 0;
      if (data.permissions.add.length > 0) {
        const created = await tx.role_permissions.createMany({
          data: data.permissions.add.map((perm) => ({
            role_id: updatedRole.id,
            tab_id: perm.tab_id,
            action_id: perm.action_id,
          })),
          skipDuplicates: true,
        });
        added = created.count;
      }

      return { ...updatedRole, id: Number(updatedRole.id), added, removed };
    });

    return result;
  } catch (error) {
    logger.error('Error al actualizar rol', { data: { error, id: data.id } });
    if ((error as { code?: string }).code === 'P2002') {
      throw new Error(`Ya existe un rol con el nombre "${data.name}". Por favor, elige un nombre diferente.`);
    }
    throw error;
  }
}

/**
 * Elimina un rol (solo roles no-sistema).
 */
export async function deleteRoleServer(roleId: number) {
  await assertCanManageRoles();

  logger.debug('Eliminando rol', { data: { roleId } });

  try {
    // Verificar que no sea un rol del sistema
    const role = await prisma.roles.findUnique({
      where: { id: BigInt(roleId) },
      select: { is_system: true },
    });

    if (role?.is_system) {
      throw new Error('No se pueden eliminar roles del sistema');
    }

    await prisma.roles.delete({
      where: { id: BigInt(roleId) },
    });

    return { success: true };
  } catch (error) {
    logger.error('Error al eliminar rol', { data: { error, roleId } });
    throw error;
  }
}

/**
 * Asigna un rol a un usuario EN la empresa activa.
 *
 * El rol se otorga en la empresa desde la que se está gestionando: el mismo usuario puede
 * ser admin en una empresa y no tener nada en otra.
 */
export async function assignRoleToUserServer(userId: string, roleId: number) {
  await assertCanManageUserAssignments();

  logger.debug('Asignando rol a usuario', { data: { userId, roleId } });

  const [assignedBy, companyId] = await Promise.all([getSessionUserId(), getActiveCompanyId()]);

  try {
    await prisma.user_roles.create({
      data: {
        user_id: userId,
        role_id: BigInt(roleId),
        company_id: companyId,
        assigned_by: assignedBy,
      },
    });

    return { success: true };
  } catch (error) {
    logger.error('Error al asignar rol a usuario', { data: { error, userId, roleId } });
    if ((error as { code?: string }).code === 'P2002') {
      // Ya tiene el rol asignado — idempotente, no es error real
      return { success: true };
    }
    throw error;
  }
}

/**
 * Remueve un rol de un usuario EN la empresa activa: lo que tenga en otras empresas no se toca.
 */
export async function removeRoleFromUserServer(userId: string, roleId: number) {
  await assertCanManageUserAssignments();

  logger.debug('Removiendo rol de usuario', { data: { userId, roleId } });

  const companyId = await getActiveCompanyId();

  try {
    await prisma.user_roles.deleteMany({
      where: {
        user_id: userId,
        role_id: BigInt(roleId),
        company_id: companyId,
      },
    });

    return { success: true };
  } catch (error) {
    logger.error('Error al remover rol de usuario', { data: { error, userId, roleId } });
    throw error;
  }
}

// ─── User Permissions (custom) ────────────────────────────────────────────────

/**
 * Obtiene los permisos combinados (rol + custom) de un usuario arbitrario, reusando
 * la misma función SQL `get_user_permissions` que usa `permissions.server.ts` para el
 * usuario de sesión (sin reimplementar la lógica en Prisma por separado).
 *
 * Nombre distinto de `getUserPermissionsServer` de `permissions.server.ts` (esa es sin
 * argumentos, siempre el usuario de sesión) para no tener dos funciones homónimas con
 * firmas distintas en la misma capa.
 */
export async function getUserPermissionsForUserServer(userId: string) {
  await assertCanReadUserData(userId);

  logger.debug('Obteniendo permisos del usuario', { data: { userId } });

  const companyId = await getActiveCompanyId();

  try {
    return await callFunction(
      'get_user_permissions',
      [{ uuid: userId }, { uuid: companyId }],
      z.array(userPermissionRowSchema)
    );
  } catch (error) {
    logger.error('Error al obtener permisos del usuario', { data: { error, userId } });
    throw error;
  }
}

export type UserPermissionsData = Awaited<ReturnType<typeof getUserPermissionsForUserServer>>;
export type UserPermissionEntry = UserPermissionsData[number];

/**
 * Obtiene los roles asignados a un usuario EN la empresa activa (los de otras empresas no
 * son asunto de esta pantalla).
 */
export async function getUserRolesServer(userId: string) {
  await assertCanReadUserData(userId);

  logger.debug('Obteniendo roles del usuario', { data: { userId } });

  const companyId = await getActiveCompanyId();

  try {
    const userRoles = await prisma.user_roles.findMany({
      where: { user_id: userId, company_id: companyId },
      include: {
        roles: {
          select: {
            id: true,
            name: true,
            description: true,
            color: true,
            is_system: true,
            is_active: true,
            slug: true,
          },
        },
      },
      orderBy: { assigned_at: 'asc' },
    });

    // Serializar BigInt
    return userRoles.map((ur) => ({
      id: ur.id,
      user_id: ur.user_id,
      role_id: Number(ur.role_id),
      assigned_by: ur.assigned_by,
      assigned_at: ur.assigned_at,
      roles: ur.roles
        ? {
            ...ur.roles,
            id: Number(ur.roles.id),
          }
        : null,
    }));
  } catch (error) {
    logger.error('Error al obtener roles del usuario', { data: { error, userId } });
    throw error;
  }
}

export type UserRolesData = Awaited<ReturnType<typeof getUserRolesServer>>;
export type UserRoleEntry = UserRolesData[number];

/**
 * Obtiene el detalle de un usuario por su share_company_users.id (para la página de detalle).
 * Filtra por la empresa activa del usuario de sesión (no por un companyId del cliente).
 */
export async function getUserDetailById(shareUserId: string) {
  logger.debug('Obteniendo detalle de usuario', { data: { shareUserId } });

  const companyId = await getActiveCompanyId();

  try {
    const shareUser = await prisma.share_company_users.findFirst({
      where: { id: shareUserId, company_id: companyId },
      include: {
        profile: {
          select: {
            id: true,
            fullname: true,
            email: true,
            avatar: true,
            credential_id: true,
            employee_id: true,
            employees: {
              select: {
                id: true,
                full_name: true,
                file: true,
                picture: true,
              },
            },
          },
        },
      },
    });

    return shareUser;
  } catch (error) {
    logger.error('Error al obtener detalle de usuario', { data: { error, shareUserId } });
    throw error;
  }
}

export type UserDetailData = Awaited<ReturnType<typeof getUserDetailById>>;

/**
 * Aplica de una vez los ajustes personales de permisos de un usuario EN la empresa activa:
 * `set` concede/quita (upsert de `is_granted`) y `remove` vuelve a heredar del rol. Todo en una
 * transacción: o se aplica completo o no cambia nada. Rechaza pares fuera del catálogo y que el
 * acceso efectivo resultante deje una acción sin el "Ver" de su pestaña.
 */
export async function applyUserPermissionChanges(userId: string, changes: UserPermissionChanges) {
  await assertCanManageUserDetail();

  const parsedUserId = z.string().uuid().safeParse(userId);
  const parsed = userPermissionChangesSchema.safeParse(changes);
  if (!parsedUserId.success || !parsed.success) throw new Error('Datos de permisos inválidos');
  const { set, remove } = parsed.data;

  logger.debug('Aplicando ajustes de permisos de usuario', {
    data: { userId, set: set.length, remove: remove.length },
  });

  const [assignedBy, companyId] = await Promise.all([getSessionUserId(), getActiveCompanyId()]);

  const index = buildPermissionIndex(await getModulesWithTabsServer());
  assertPairsInCatalog(index, set);
  assertNoOverlap(set, remove);

  try {
    return await prisma.$transaction(async (tx) => {
      const [userRoleRows, customRows] = await Promise.all([
        tx.user_roles.findMany({
          where: { user_id: userId, company_id: companyId, roles: { is_active: true } },
          select: { role_id: true },
        }),
        tx.user_permissions.findMany({
          where: { user_id: userId, company_id: companyId },
          select: { tab_id: true, action_id: true, is_granted: true },
        }),
      ]);
      const rolePairs = await tx.role_permissions.findMany({
        where: { role_id: { in: userRoleRows.map((row) => row.role_id) } },
        select: { tab_id: true, action_id: true },
      });

      // Acceso efectivo: lo que dan los roles activos, con los ajustes personales por encima.
      const fromRoles = new Set(rolePairs.map((row) => permissionKey(row.tab_id, row.action_id)));
      const effectiveOf = (custom: Map<string, boolean>) => {
        const effective = new Set(fromRoles);
        for (const [key, granted] of custom) {
          if (granted) effective.add(key);
          else effective.delete(key);
        }
        return effective;
      };

      const customBefore = new Map(
        customRows.map((row) => [permissionKey(row.tab_id, row.action_id), row.is_granted !== false] as const)
      );
      const customAfter = new Map(customBefore);
      for (const perm of remove) customAfter.delete(permissionKey(perm.tab_id, perm.action_id));
      for (const perm of set) customAfter.set(permissionKey(perm.tab_id, perm.action_id), perm.is_granted);
      assertNoNewActionsWithoutView(index, effectiveOf(customBefore), effectiveOf(customAfter));

      let removed = 0;
      if (remove.length > 0) {
        const deleted = await tx.user_permissions.deleteMany({
          where: {
            user_id: userId,
            company_id: companyId,
            OR: remove.map((perm) => ({ tab_id: perm.tab_id, action_id: perm.action_id })),
          },
        });
        removed = deleted.count;
      }

      for (const perm of set) {
        await tx.user_permissions.upsert({
          where: {
            user_id_tab_id_action_id_company_id: {
              user_id: userId,
              tab_id: perm.tab_id,
              action_id: perm.action_id,
              company_id: companyId,
            },
          },
          create: {
            user_id: userId,
            tab_id: perm.tab_id,
            action_id: perm.action_id,
            company_id: companyId,
            is_granted: perm.is_granted,
            assigned_by: assignedBy,
          },
          update: { is_granted: perm.is_granted, assigned_by: assignedBy, updated_at: moment().toDate() },
        });
      }

      return { set: set.length, removed };
    });
  } catch (error) {
    logger.error('Error al aplicar ajustes de permisos de usuario', { data: { error, userId } });
    throw error;
  }
}

/**
 * Elimina TODOS los permisos custom de un usuario EN la empresa activa.
 */
export async function cleanUserCustomPermissions(userId: string) {
  await assertCanManageUserDetail();

  logger.debug('Limpiando permisos custom del usuario', { data: { userId } });

  const companyId = await getActiveCompanyId();

  try {
    await prisma.user_permissions.deleteMany({
      where: { user_id: userId, company_id: companyId },
    });

    return { success: true };
  } catch (error) {
    logger.error('Error al limpiar permisos custom del usuario', { data: { error, userId } });
    throw error;
  }
}

/**
 * Elimina TODOS los permisos custom y roles de un usuario en una transacción.
 */
export async function cleanAllUserPermissionsAndRoles(userId: string) {
  await assertCanManageUserDetail();

  logger.debug('Limpiando todos los permisos y roles del usuario', { data: { userId } });

  // Ambas tablas se limpian sólo en la empresa activa: `user_roles` desde la Task 13a y
  // `user_permissions` desde la 13b. Lo que el usuario tenga en otras empresas no se toca.
  const companyId = await getActiveCompanyId();

  try {
    await prisma.$transaction([
      prisma.user_permissions.deleteMany({ where: { user_id: userId, company_id: companyId } }),
      prisma.user_roles.deleteMany({ where: { user_id: userId, company_id: companyId } }),
    ]);

    return { success: true };
  } catch (error) {
    logger.error('Error al limpiar todos los permisos y roles del usuario', { data: { error, userId } });
    throw error;
  }
}
