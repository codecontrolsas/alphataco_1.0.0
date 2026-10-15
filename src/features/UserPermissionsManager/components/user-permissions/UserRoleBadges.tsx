'use client';

import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { getUserRolesServer, type UserRolesData } from '../../actions.server';
import { userPermissionKeys } from '../../hooks/useUserPermissionEditor';

/** Roles del usuario en la cabecera; comparte la consulta con la tarjeta "Roles asignados". */
export function UserRoleBadges({ userId, initialUserRoles }: { userId: string; initialUserRoles: UserRolesData }) {
  const { data: userRoles } = useQuery({
    queryKey: userPermissionKeys.roles(userId),
    queryFn: () => getUserRolesServer(userId),
    initialData: initialUserRoles,
  });

  if (userRoles.length === 0) {
    return <span className="text-muted-foreground text-sm">Sin roles asignados</span>;
  }

  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Roles">
      {userRoles.map((userRole) => (
        <li key={userRole.id}>
          <Badge variant="outline" className="gap-1.5 font-normal">
            <span
              aria-hidden="true"
              className="bg-muted-foreground/40 size-2 rounded-full"
              style={userRole.roles?.color ? { backgroundColor: userRole.roles.color } : undefined}
            />
            {userRole.roles?.name ?? `Rol ${userRole.role_id}`}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
