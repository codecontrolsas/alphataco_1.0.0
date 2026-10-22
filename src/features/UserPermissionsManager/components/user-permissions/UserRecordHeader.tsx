import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { EditNameButton } from '@/features/Empresa/Usuarios/components/EditNameButton';
import { RecordHeader } from '@/shared/components/common/RecordHeader';
import { Briefcase, Mail } from 'lucide-react';
import type { UserDetailData, UserRolesData } from '@/features/Permissions/actions/roles.server';
import { UserRoleBadges } from './UserRoleBadges';

type Profile = NonNullable<NonNullable<UserDetailData>['profile']>;

function getInitials(name: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase();
}

interface UserRecordHeaderProps {
  profile: Profile;
  userId: string;
  canEdit: boolean;
  initialUserRoles: UserRolesData;
}

/** Cabecera de la ficha de accesos del usuario: identidad, empleado vinculado y roles. */
export function UserRecordHeader({ profile, userId, canEdit, initialUserRoles }: UserRecordHeaderProps) {
  const { fullname, email, avatar, employees: employee } = profile;
  const employeeName = employee?.full_name?.trim() || null;

  return (
    <RecordHeader
      identity={
        <div className="flex min-w-0 items-start gap-4">
          <Avatar className="size-14 shrink-0">
            {avatar ? <AvatarImage src={avatar} alt="" /> : null}
            <AvatarFallback className="bg-muted text-muted-foreground font-medium">
              {getInitials(fullname)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-1.5">
            <h1
              className={fullname ? 'truncate text-xl font-semibold' : 'text-muted-foreground truncate text-xl italic'}
            >
              {fullname || 'Sin nombre'}
            </h1>
            <p className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-sm">
              <Mail aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate">{email || 'Sin email'}</span>
            </p>
            <p className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-sm">
              <Briefcase aria-hidden="true" className="size-3.5 shrink-0" />
              {employee ? (
                <span className="truncate">
                  Empleado <span className="text-foreground font-medium tabular-nums">[{employee.file}]</span>{' '}
                  {employeeName ?? 'Sin nombre'}
                </span>
              ) : (
                <span>Sin empleado vinculado</span>
              )}
            </p>
            <UserRoleBadges userId={userId} initialUserRoles={initialUserRoles} />
          </div>
        </div>
      }
      actions={
        canEdit ? (
          <EditNameButton profileId={profile.id} currentFullname={fullname} employeeFullname={employeeName} />
        ) : undefined
      }
    />
  );
}
