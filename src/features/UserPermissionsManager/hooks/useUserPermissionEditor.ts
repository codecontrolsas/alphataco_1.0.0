'use client';

import { Logger } from '@/lib/logger';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { applyUserPermissionChanges, cleanAllUserPermissionsAndRoles, cleanUserCustomPermissions, getAllRolePermissions, getUserPermissionsForUserServer, getUserRolesServer, type AllRolePermissionsMap, type UserPermissionsData, type UserRolesData } from '@/features/Permissions/actions/roles.server';
import {
  applyPreset as applyPresetRule,
  applyToggle,
  diffPermissionSets,
  keysOfTabs,
  pairFromKey,
  permissionKey,
  type PermissionIndex,
} from '../lib/permission-rules';
import type { OverrideState, PermissionPreset, RoleSourceRef } from '../lib/permission-types';
import { equipmentTypeVisibilityKeys } from './useEquipmentTypeVisibility';

const logger = new Logger('useUserPermissionEditor');

/** Escritura sobre `user_permissions`: conceder/quitar (`set`) o volver a heredar (`remove`). */
type UserPermissionOp = { key: string; kind: 'set'; isGranted: boolean } | { key: string; kind: 'remove' };

export const userPermissionKeys = {
  permissions: (userId: string) => ['user-permissions', userId] as const,
  roles: (userId: string) => ['user-roles', userId] as const,
  allRolePermissions: ['all-role-permissions'] as const,
};

interface UseUserPermissionEditorArgs {
  userId: string;
  index: PermissionIndex;
  disabled: boolean;
  initialPermissions: UserPermissionsData;
  initialUserRoles: UserRolesData;
  initialRolePermissions: AllRolePermissionsMap;
}

/**
 * Estado del editor de permisos de un usuario: qué tiene efectivamente, qué le dan sus roles
 * y qué ajustes personales tiene. Cada cambio se guarda al instante con
 * `applyUserPermissionChanges` (todas las escrituras de un cambio en una sola transacción).
 *
 * `get_user_permissions` devuelve solo lo concedido, así que un ajuste que QUITA un permiso del
 * rol se reconoce porque el rol lo da y el usuario no lo tiene.
 */
export function useUserPermissionEditor({
  userId,
  index,
  disabled,
  initialPermissions,
  initialUserRoles,
  initialRolePermissions,
}: UseUserPermissionEditorArgs) {
  const queryClient = useQueryClient();

  const permissionsQuery = useQuery({
    queryKey: userPermissionKeys.permissions(userId),
    queryFn: () => getUserPermissionsForUserServer(userId),
    initialData: initialPermissions,
    staleTime: 0,
  });

  const rolesQuery = useQuery({
    queryKey: userPermissionKeys.roles(userId),
    queryFn: () => getUserRolesServer(userId),
    initialData: initialUserRoles,
  });

  const rolePermissionsQuery = useQuery({
    queryKey: userPermissionKeys.allRolePermissions,
    queryFn: () => getAllRolePermissions(),
    initialData: initialRolePermissions,
    staleTime: 30 * 1000,
  });

  const permissions = permissionsQuery.data;
  const userRoles = rolesQuery.data;
  const rolePermissions = rolePermissionsQuery.data;

  const derived = useMemo(() => {
    const effective = new Set<string>();
    const customGrants = new Set<string>();
    for (const row of permissions) {
      if (row.is_granted !== true) continue;
      const key = permissionKey(row.tab_id, row.action_id);
      effective.add(key);
      if (row.source === 'custom') customGrants.add(key);
    }

    const roleSources = new Map<string, RoleSourceRef[]>();
    for (const userRole of userRoles) {
      if (!userRole.roles || userRole.roles.is_active === false) continue;
      const ref: RoleSourceRef = { id: userRole.role_id, name: userRole.roles.name, color: userRole.roles.color };
      for (const pair of rolePermissions.get(userRole.role_id) ?? []) {
        const key = permissionKey(pair.tabId, pair.actionId);
        const list = roleSources.get(key);
        if (list) list.push(ref);
        else roleSources.set(key, [ref]);
      }
    }
    const fromRoles = new Set(roleSources.keys());

    const overrides = new Map<string, boolean>();
    for (const key of index.allKeys) {
      if (customGrants.has(key)) overrides.set(key, true);
      else if (fromRoles.has(key) && !effective.has(key)) overrides.set(key, false);
    }

    return { effective, fromRoles, roleSources, overrides };
  }, [permissions, userRoles, rolePermissions, index]);

  const invalidateUserPermissions = async () => {
    await queryClient.invalidateQueries({ queryKey: userPermissionKeys.permissions(userId) });
    void queryClient.invalidateQueries({ queryKey: ['permissions'] });
  };

  const writeMutation = useMutation({
    mutationFn: async (ops: UserPermissionOp[]) => {
      const set: Array<{ tab_id: string; action_id: string; is_granted: boolean }> = [];
      const remove: Array<{ tab_id: string; action_id: string }> = [];
      for (const op of ops) {
        const { tabId, actionId } = pairFromKey(op.key);
        if (op.kind === 'set') set.push({ tab_id: tabId, action_id: actionId, is_granted: op.isGranted });
        else remove.push({ tab_id: tabId, action_id: actionId });
      }
      await applyUserPermissionChanges(userId, { set, remove });
      return ops.length;
    },
    onSettled: invalidateUserPermissions,
    onError: (error) => {
      logger.error('Error al guardar permisos del usuario', { data: { error, userId } });
      toast.error('No se pudo guardar el permiso', { description: 'El acceso quedó como estaba antes del cambio.' });
    },
  });

  /** Escrituras para pasar del acceso efectivo actual a `after`, sin tocar `skip`. */
  const opsTowards = (after: ReadonlySet<string>, skip?: string): UserPermissionOp[] => {
    const { added, removed } = diffPermissionSets(derived.effective, after);
    const ops: UserPermissionOp[] = [];
    for (const key of [...added, ...removed]) {
      if (key === skip) continue;
      const desired = after.has(key);
      if (desired === derived.fromRoles.has(key)) {
        if (derived.overrides.has(key)) ops.push({ key, kind: 'remove' });
      } else {
        ops.push({ key, kind: 'set', isGranted: desired });
      }
    }
    return ops;
  };

  const run = (ops: UserPermissionOp[]) => {
    if (disabled || writeMutation.isPending || ops.length === 0) return;
    writeMutation.mutate(ops);
  };

  const getState = (key: string): OverrideState => {
    const override = derived.overrides.get(key);
    if (override === undefined) return 'inherit';
    return override ? 'grant' : 'deny';
  };

  const setState = (key: string, state: OverrideState) => {
    const current = getState(key);
    if (current === state) return;
    const nextEffective = state === 'inherit' ? derived.fromRoles.has(key) : state === 'grant';
    const after = applyToggle(derived.effective, index, key, nextEffective);

    const primary: UserPermissionOp[] =
      state === 'inherit'
        ? derived.overrides.has(key)
          ? [{ key, kind: 'remove' }]
          : []
        : [{ key, kind: 'set', isGranted: state === 'grant' }];

    run([...primary, ...opsTowards(after, key)]);
  };

  const applyPreset = (tabIds: string[], preset: PermissionPreset) => {
    run(opsTowards(applyPresetRule(derived.effective, index, tabIds, preset)));
  };

  const resetOverrides = (tabIds: string[]) => {
    run(
      keysOfTabs(index, tabIds)
        .filter((key) => derived.overrides.has(key))
        .map((key) => ({ key, kind: 'remove' as const }))
    );
  };

  const afterClean = () => {
    void invalidateUserPermissions();
    void queryClient.invalidateQueries({ queryKey: userPermissionKeys.roles(userId) });
    void queryClient.invalidateQueries({ queryKey: equipmentTypeVisibilityKeys.user(userId) });
  };

  const cleanCustomPermissionsMutation = useMutation({
    mutationFn: () => cleanUserCustomPermissions(userId),
    onSuccess: () => {
      afterClean();
      toast.success('Ajustes personales eliminados', { description: 'El acceso queda igual al de sus roles.' });
    },
    onError: (error) => {
      logger.error('Error al limpiar ajustes personales', { data: { error, userId } });
      toast.error('No se pudieron eliminar los ajustes personales');
    },
  });

  const cleanAllPermissionsMutation = useMutation({
    mutationFn: () => cleanAllUserPermissionsAndRoles(userId),
    onSuccess: () => {
      afterClean();
      void queryClient.invalidateQueries({ queryKey: ['role-user-counts'] });
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success('Roles y ajustes eliminados', { description: 'El usuario queda sin acceso a ningún módulo.' });
    },
    onError: (error) => {
      logger.error('Error al eliminar roles y ajustes', { data: { error, userId } });
      toast.error('No se pudieron eliminar los roles y ajustes');
    },
  });

  return {
    userRoles,
    rolePermissions,
    effective: derived.effective,
    fromRoles: derived.fromRoles,
    roleSources: derived.roleSources,
    overrides: derived.overrides,
    isSaving: writeMutation.isPending,
    getState,
    setState,
    applyPreset,
    resetOverrides,
    cleanCustomPermissionsMutation,
    cleanAllPermissionsMutation,
  };
}

export type UserPermissionEditorState = ReturnType<typeof useUserPermissionEditor>;
