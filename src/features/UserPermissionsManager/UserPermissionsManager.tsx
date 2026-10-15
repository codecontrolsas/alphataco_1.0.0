'use client';

import { SectionCard } from '@/shared/components/common/SectionCard';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  getModulesWithTabsServer,
  type AllRolePermissionsMap,
  type ModulesWithTabsData,
  type RoleWithCount,
  type UserPermissionsData,
  type UserRolesData,
} from './actions.server';
import { UserEquipmentTypesSection } from './components/UserEquipmentTypesSection';
import { PermissionEditor } from './components/permission-editor/PermissionEditor';
import { AssignedRolesCard } from './components/user-permissions/AssignedRolesCard';
import { CleanPermissionsDialog } from './components/user-permissions/CleanPermissionsDialog';
import { useUserPermissionEditor } from './hooks/useUserPermissionEditor';
import { buildPermissionIndex } from './lib/permission-rules';

interface UserPermissionsManagerProps {
  userId: string;
  canEdit: boolean;
  initialUserPermissions: UserPermissionsData;
  initialUserRoles: UserRolesData;
  initialRoles: RoleWithCount[];
  initialRolePermissions: AllRolePermissionsMap;
  initialModules: ModulesWithTabsData;
}

/**
 * Accesos de un usuario: sus roles y su acceso efectivo (qué puede hacer y de dónde sale,
 * con los ajustes personales de tres estados). Cada cambio se guarda al instante.
 */
export function UserPermissionsManager({
  userId,
  canEdit,
  initialUserPermissions,
  initialUserRoles,
  initialRoles,
  initialRolePermissions,
  initialModules,
}: UserPermissionsManagerProps) {
  const { data: modules } = useQuery({
    queryKey: ['modules-with-tabs'],
    queryFn: () => getModulesWithTabsServer(),
    initialData: initialModules,
    staleTime: 5 * 60 * 1000,
  });
  const index = useMemo(() => buildPermissionIndex(modules), [modules]);

  const editor = useUserPermissionEditor({
    userId,
    index,
    disabled: !canEdit,
    initialPermissions: initialUserPermissions,
    initialUserRoles,
    initialRolePermissions,
  });

  const overrideCount = editor.overrides.size;

  return (
    <div className="space-y-4">
      <AssignedRolesCard
        userId={userId}
        disabled={!canEdit}
        initialRoles={initialRoles}
        userRoles={editor.userRoles}
        rolePermissions={editor.rolePermissions}
      />

      <SectionCard
        title="Acceso efectivo"
        description={
          canEdit
            ? 'Qué puede hacer y de dónde sale. Heredar usa lo de sus roles; Conceder y Quitar son ajustes personales que mandan sobre los roles.'
            : 'Qué puede hacer y de dónde sale: de sus roles o de un ajuste personal.'
        }
        action={
          canEdit ? (
            <CleanPermissionsDialog
              disabled={editor.isSaving}
              userRoles={editor.userRoles}
              overrideCount={overrideCount}
              editor={editor}
            />
          ) : undefined
        }
        flush
      >
        <div className="p-3 sm:p-5">
          <PermissionEditor
            mode="user"
            modules={modules}
            index={index}
            effective={editor.effective}
            fromRoles={editor.fromRoles}
            disabled={!canEdit || editor.isSaving}
            busy={editor.isSaving}
            user={editor}
            moduleAddons={{ mantenimiento: <UserEquipmentTypesSection userId={userId} disabled={!canEdit} /> }}
          />
        </div>
      </SectionCard>
    </div>
  );
}
