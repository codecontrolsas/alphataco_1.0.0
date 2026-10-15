import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import {
  getAllRolePermissions,
  getAllRolesWithCounts,
  getModulesWithTabsServer,
  getUserDetailById,
  getUserPermissionsForUserServer,
  getUserRolesServer,
} from '@/features/UserPermissionsManager/actions.server';
import { UserRecordHeader } from '@/features/UserPermissionsManager/components/user-permissions/UserRecordHeader';
import { UserPermissionsManager } from '@/features/UserPermissionsManager/UserPermissionsManager';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { ArrowLeft, UserX } from 'lucide-react';
import Link from 'next/link';

const USERS_LIST_HREF = '/dashboard/configuration?tab=general&subtab=users&usertab=usuarios-empleados';

function BackToUsers() {
  return (
    <Link
      href={USERS_LIST_HREF}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm outline-none focus-visible:ring-2"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      Usuarios
    </Link>
  );
}

async function User({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [canView, canUpdate, shareUser] = await Promise.all([
    checkPermissionServer('configuracion', 'detalle-usuario', 'view'),
    checkPermissionServer('configuracion', 'detalle-usuario', 'update'),
    getUserDetailById(id),
  ]);

  if (!canView) {
    return (
      <section className="space-y-4 py-4 md:mx-7">
        <BackToUsers />
        <StateBlock
          variant="noperm"
          title="Sin permiso para ver los accesos de usuarios"
          description="Lo habilita Configuración › Detalle de usuario › Ver."
          className="bg-card rounded-xl border"
        />
      </section>
    );
  }

  if (!shareUser?.profile) {
    return (
      <section className="space-y-4 py-4 md:mx-7">
        <BackToUsers />
        <StateBlock
          variant="empty"
          icon={UserX}
          title="Usuario no encontrado"
          description="No existe o no pertenece a esta empresa."
          className="bg-card rounded-xl border"
        />
      </section>
    );
  }

  // El ID que se usa en user_roles y user_permissions es el credential_id (UUID de auth)
  const profile = shareUser.profile;
  const authUserId = profile.credential_id ?? profile.id ?? id;

  const [initialUserPermissions, initialUserRoles, initialRoles, initialRolePermissions, initialModules] =
    await Promise.all([
      getUserPermissionsForUserServer(authUserId),
      getUserRolesServer(authUserId),
      getAllRolesWithCounts(),
      getAllRolePermissions(),
      getModulesWithTabsServer(),
    ]);

  return (
    <section className="space-y-4 py-4 md:mx-7">
      <BackToUsers />
      <UserRecordHeader profile={profile} userId={authUserId} canEdit={canUpdate} initialUserRoles={initialUserRoles} />
      <UserPermissionsManager
        userId={authUserId}
        canEdit={canUpdate}
        initialUserPermissions={initialUserPermissions}
        initialUserRoles={initialUserRoles}
        initialRoles={initialRoles}
        initialRolePermissions={initialRolePermissions}
        initialModules={initialModules}
      />
    </section>
  );
}

export default User;
