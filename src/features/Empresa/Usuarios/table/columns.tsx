'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import { Crown, Shield } from 'lucide-react';
import Link from 'next/link';
import { LinkEmployeeCell } from '../components/LinkEmployeeCell';
import type { CompanyUserListItem } from '../lib/users-types';
import { UserStatusCell } from './UserStatusCell';

type Permissions = {
  hasPermission: (module: string, tab: string, action: string) => boolean;
};

// ── Componente de celda de roles ──────────────────────────────────────────────
function RoleCell({ row }: { row: CompanyUserListItem }) {
  const isOwner = row.isOwner;
  const userRoles = row.profile?.user_roles ?? [];

  if (isOwner && userRoles.length === 0) {
    return (
      <Badge
        variant="outline"
        className="gap-1 flex items-center"
        style={{
          backgroundColor: '#F59E0B15',
          color: '#F59E0B',
          borderColor: '#F59E0B30',
        }}
      >
        <Crown className="h-3 w-3" />
        <span>Propietario</span>
      </Badge>
    );
  }

  if (userRoles.length === 0) {
    return <span className="text-muted-foreground text-sm">Sin rol</span>;
  }

  const firstRole = userRoles[0];
  const roleColor = firstRole.roles?.color || '#2563EB';
  const roleName = firstRole.roles?.name || 'Sin nombre';
  const additionalCount = userRoles.length - 1;

  if (additionalCount === 0) {
    return (
      <Badge
        variant="outline"
        className="gap-1 flex items-center"
        style={{
          backgroundColor: `${roleColor}15`,
          color: roleColor,
          borderColor: `${roleColor}30`,
        }}
      >
        <Shield className="h-3 w-3" />
        <span>{roleName}</span>
        {isOwner && <Crown className="h-3 w-3 ml-1" />}
      </Badge>
    );
  }

  const additionalRoles = userRoles.slice(1);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1 cursor-pointer">
            <Badge
              variant="outline"
              className="gap-1 flex items-center"
              style={{
                backgroundColor: `${roleColor}15`,
                color: roleColor,
                borderColor: `${roleColor}30`,
              }}
            >
              <Shield className="h-3 w-3" />
              <span>{roleName}</span>
              <span className="text-xs opacity-70">{`+${additionalCount}`}</span>
              {isOwner && <Crown className="h-3 w-3 ml-1" />}
            </Badge>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs z-50">
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-sm mb-1">Roles adicionales:</p>
            {additionalRoles.map((ur) => {
              const color = ur.roles?.color || '#2563EB';
              return (
                <Badge
                  key={ur.id}
                  variant="outline"
                  className="flex items-center gap-1 w-full justify-start"
                  style={{
                    backgroundColor: `${color}15`,
                    color,
                    borderColor: `${color}30`,
                  }}
                >
                  <Shield className="h-3 w-3" />
                  <span>{ur.roles?.name || 'Sin nombre'}</span>
                </Badge>
              );
            })}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Columnas de la tabla ──────────────────────────────────────────────────────
export function getCompanyUsersColumns(permissions: Permissions): ColumnDef<CompanyUserListItem>[] {
  const canDelete = permissions.hasPermission('configuracion', 'usuarios-empleados', 'delete');
  const canUpdate = permissions.hasPermission('configuracion', 'usuarios-empleados', 'update');

  return [
    // ── Nombre + Avatar ────────────────────────────────────────────────────────
    {
      id: 'fullname',
      accessorFn: (row) => row.profile?.fullname ?? '',
      meta: { title: 'Nombre' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
      cell: ({ row }) => {
        const profile = row.original.profile;
        const fullname = profile?.fullname || 'Sin nombre';
        const id = row.original.id;
        const isOwner = row.original.isOwner;

        const avatarSrc = profile?.avatar || profile?.employees?.picture || '';
        const initials =
          fullname
            .split(' ')
            .map((w) => w.charAt(0))
            .slice(0, 2)
            .join('')
            .toUpperCase() || '??';

        const avatarElement = (
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarImage src={avatarSrc || undefined} alt={fullname} className="rounded-full object-cover" />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
        );

        if (isOwner) {
          return (
            <div className="flex items-center gap-2">
              {avatarElement}
              <span className="font-medium flex items-center gap-1.5">
                {fullname}
                <Crown className="h-3.5 w-3.5 text-warn shrink-0" />
              </span>
            </div>
          );
        }

        return (
          <div className="flex items-center gap-2">
            {avatarElement}
            <Link href={`/dashboard/configuration/user/${id}`} className="hover:underline font-medium">
              {fullname}
            </Link>
          </div>
        );
      },
      enableSorting: true,
    },
    // ── Email ───────────────────────────────────────────────────────────────────
    {
      id: 'email',
      accessorFn: (row) => row.profile?.email ?? '',
      meta: { title: 'Correo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Correo" />,
      cell: ({ row }) => {
        const email = row.original.profile?.email || '';
        return <span className="max-w-[300px] truncate text-sm">{email || '-'}</span>;
      },
      enableSorting: true,
    },
    // ── Estado (is_active) ──────────────────────────────────────────────────────
    {
      id: 'is_active',
      accessorFn: (row) => row.is_active,
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => {
        const isActive = row.original.is_active;
        return <Badge variant={isActive ? 'success' : 'destructive'}>{isActive ? 'Activo' : 'Baneado'}</Badge>;
      },
      filterFn: (row, _id, value: string[]) => {
        return value.includes(String(row.original.is_active));
      },
      enableSorting: true,
    },
    // ── Rol ──────────────────────────────────────────────────────────────────
    {
      id: 'role',
      accessorFn: (row) => {
        const roles = row.profile?.user_roles ?? [];
        if (row.isOwner && roles.length === 0) return 'Propietario';
        if (roles.length === 0) return 'Sin rol';
        return roles
          .map((ur) => ur.roles?.name ?? '')
          .filter(Boolean)
          .join(', ');
      },
      meta: { title: 'Rol' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Rol" />,
      cell: ({ row }) => <RoleCell row={row.original} />,
      filterFn: (row, _id, value: string[]) => {
        const userRoles = row.original.profile?.user_roles ?? [];
        if (userRoles.length === 0) return value.includes(NULL_FILTER_VALUE);
        return userRoles.some((ur) => value.includes(String(ur.role_id)));
      },
      enableSorting: false,
    },
    // ── Empleado vinculado ────────────────────────────────────────────────────
    {
      id: 'linked_employee',
      accessorFn: (row) => {
        const emp = row.profile?.employees;
        if (!emp) return '';
        return `[${emp.file}] ${emp.lastname ?? ''} ${emp.firstname ?? ''}`.trim();
      },
      meta: { title: 'Empleado vinculado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Empleado vinculado" />,
      cell: ({ row }) => {
        const profile = row.original.profile;
        const employee = profile?.employees
          ? {
              id: profile.employees.id,
              firstname: profile.employees.firstname ?? '',
              lastname: profile.employees.lastname ?? '',
              file: profile.employees.file,
              cuil: '',
            }
          : null;
        const profileId = profile?.id;

        if (!profileId) return <span className="text-muted-foreground text-sm">-</span>;

        return <LinkEmployeeCell profileId={profileId} employee={employee} />;
      },
      filterFn: (row, _id, value: string[]) => {
        const empId = row.original.profile?.employee_id;
        if (empId == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(empId);
      },
      enableSorting: false,
    },
    // ── Fecha de alta ─────────────────────────────────────────────────────────
    {
      id: 'created_at',
      accessorFn: (row) => (row.created_at ? row.created_at.toISOString() : ''),
      meta: { title: 'Fecha de alta' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de alta" />,
      cell: ({ row }) => {
        const date = row.original.created_at;
        // El propietario no figura en `share_company_users`: su fecha es un centinela (epoch 0).
        if (!date || row.original.isOwner) return <span className="text-muted-foreground">-</span>;
        return <span className="text-sm text-muted-foreground">{formatArgentinaDay(date)}</span>;
      },
      enableSorting: true,
    },
    // ── Acciones ──────────────────────────────────────────────────────────────
    {
      id: 'actions',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        // El owner no se puede banear ni eliminar
        if (row.original.isOwner) return null;

        // Mostrar UserStatusCell si tiene permiso de delete (ban) o update (reactivar)
        if (!canDelete && !canUpdate) return null;

        return <UserStatusCell row={row.original} canBan={canDelete} canReactivate={canUpdate} />;
      },
    },
  ];
}
