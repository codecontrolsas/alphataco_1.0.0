'use client';

import { Shield, Users } from 'lucide-react';
import type { RoleWithCount } from '@/features/Permissions/actions/roles.server';
import { RoleCard } from './RoleCard';

interface RoleGroupsProps {
  customRoles: RoleWithCount[];
  systemRoles: RoleWithCount[];
  searchQuery: string;
  getPermissionsCount: (roleId: number) => number;
  onEdit: (role: RoleWithCount) => void;
  onManageUsers: (role: RoleWithCount) => void;
  onEditNotifications: (role: RoleWithCount) => void;
  onDelete: (roleId: number, roleName: string) => void;
  isDeleting: boolean;
}

/** Lista de roles agrupada en personalizados y de sistema. */
export function RoleGroups({
  customRoles,
  systemRoles,
  searchQuery,
  getPermissionsCount,
  onEdit,
  onManageUsers,
  onEditNotifications,
  onDelete,
  isDeleting,
}: RoleGroupsProps) {
  if (customRoles.length + systemRoles.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No se encontraron roles que coincidan con {searchQuery}
      </div>
    );
  }

  const renderGrid = (roles: RoleWithCount[]) => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {roles.map((role) => (
        <RoleCard
          key={role.id}
          role={role}
          permissionsCount={getPermissionsCount(role.id)}
          onEdit={onEdit}
          onManageUsers={onManageUsers}
          onEditNotifications={onEditNotifications}
          onDelete={onDelete}
          isDeleting={isDeleting}
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      {customRoles.length > 0 && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Users className="h-4 w-4" aria-hidden="true" />
            Roles Personalizados ({customRoles.length})
          </h3>
          {renderGrid(customRoles)}
        </div>
      )}

      {systemRoles.length > 0 && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Shield className="h-4 w-4" aria-hidden="true" />
            Roles de Sistema ({systemRoles.length})
          </h3>
          {renderGrid(systemRoles)}
        </div>
      )}
    </div>
  );
}
