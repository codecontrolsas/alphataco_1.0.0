'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { Bell, Pencil, Shield, Trash2, Users } from 'lucide-react';
import type { RoleWithCount } from '@/features/Permissions/actions/roles.server';

interface RoleCardProps {
  role: RoleWithCount;
  permissionsCount: number;
  onEdit: (role: RoleWithCount) => void;
  onManageUsers: (role: RoleWithCount) => void;
  /** Roles de sistema: abre solo la configuración de avisos (sus permisos no se editan). */
  onEditNotifications: (role: RoleWithCount) => void;
  onDelete: (roleId: number, roleName: string) => void;
  isDeleting: boolean;
}

export function RoleCard({
  role,
  permissionsCount,
  onEdit,
  onManageUsers,
  onEditNotifications,
  onDelete,
  isDeleting,
}: RoleCardProps) {
  const hasUsers = role.userCount > 0;
  const canDelete = !role.is_system && !hasUsers;

  return (
    <Card className="p-4 transition-shadow hover:shadow-md">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Shield
            className="h-5 w-5 flex-shrink-0"
            style={{ color: role.color || 'currentColor' }}
            aria-hidden="true"
          />
          <h3 className="truncate font-semibold">{role.name}</h3>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline" className="flex items-center gap-1 text-xs tabular-nums">
            <Users className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">Usuarios:</span>
            {role.userCount}
          </Badge>
          <Badge variant="outline" className="flex items-center gap-1 text-xs tabular-nums">
            <Shield className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">Permisos:</span>
            {role.slug === 'owner' ? 'ALL' : permissionsCount}
          </Badge>
          {role.color && (
            <Badge
              variant="outline"
              style={{
                backgroundColor: `${role.color}20`,
                borderColor: role.color,
                color: role.color,
              }}
              className="text-xs"
            >
              {role.is_system ? 'Sistema' : 'Personalizado'}
            </Badge>
          )}
        </div>
      </div>

      {role.description && <p className="mb-4 line-clamp-2 text-sm text-muted-foreground">{role.description}</p>}

      <div className="flex gap-2">
        {/* Roles de sistema: asignar usuarios y configurar sus avisos (los permisos no se editan) */}
        {role.is_system ? (
          <PermissionGuard module="configuracion" tab="gestion-roles" action="update">
            <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => onManageUsers(role)}>
              <Users className="mr-2 h-4 w-4" aria-hidden="true" />
              Asignar Usuarios
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onEditNotifications(role)}
              title="Notificaciones del rol"
              aria-label={`Notificaciones del rol ${role.name}`}
            >
              <Bell className="h-3 w-3" aria-hidden="true" />
            </Button>
          </PermissionGuard>
        ) : (
          /* Roles personalizados: editar, asignar y eliminar */
          <>
            <PermissionGuard module="configuracion" tab="gestion-roles" action="update">
              <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => onEdit(role)}>
                <Pencil className="mr-2 h-3 w-3" aria-hidden="true" />
                Editar
              </Button>
            </PermissionGuard>
            <PermissionGuard module="configuracion" tab="gestion-roles" action="update">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onManageUsers(role)}
                title="Asignar usuarios"
                aria-label={`Asignar usuarios al rol ${role.name}`}
              >
                <Users className="h-3 w-3" aria-hidden="true" />
              </Button>
            </PermissionGuard>
            <PermissionGuard module="configuracion" tab="gestion-roles" action="delete">
              <Button
                type="button"
                variant={canDelete ? 'destructive' : 'outline'}
                size="sm"
                onClick={() => onDelete(role.id, role.name)}
                disabled={!canDelete || isDeleting}
                title={hasUsers ? `No se puede eliminar: ${role.userCount} usuario(s) asignado(s)` : 'Eliminar rol'}
                aria-label={`Eliminar rol ${role.name}`}
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />
              </Button>
            </PermissionGuard>
          </>
        )}
      </div>
    </Card>
  );
}
