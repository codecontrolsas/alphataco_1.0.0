'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { assignRoleToUserServer, getUsersForRoleAssignment, removeRoleFromUserServer } from '@/features/Permissions/actions/roles.server';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Search, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import type { RoleWithCount, UsersForRoleData } from '@/features/Permissions/actions/roles.server';

// ─── Types ────────────────────────────────────────────────────────────────────

type UserForRole = UsersForRoleData[number];

interface ManageRoleUsersDialogProps {
  role: RoleWithCount | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── ManageRoleUsersDialog ────────────────────────────────────────────────────

export function ManageRoleUsersDialog({ role, open, onOpenChange }: ManageRoleUsersDialogProps) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users-with-role-status', role?.id],
    queryFn: () => getUsersForRoleAssignment(role!.id),
    enabled: open && !!role?.id,
  });

  const assignMutation = useMutation({
    mutationFn: (credentialId: string) => assignRoleToUserServer(credentialId, role!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-role-status', role?.id] });
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success('Rol asignado correctamente');
    },
    onError: () => {
      toast.error('Error al asignar el rol');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (credentialId: string) => removeRoleFromUserServer(credentialId, role!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-role-status', role?.id] });
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success('Rol removido correctamente');
    },
    onError: () => {
      toast.error('Error al remover el rol');
    },
  });

  const handleToggleRole = (credentialId: string, hasRole: boolean) => {
    if (hasRole) {
      removeMutation.mutate(credentialId);
    } else {
      assignMutation.mutate(credentialId);
    }
  };

  const filteredUsers = users.filter(
    (user) =>
      user.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.userEmail.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const usersWithRole = filteredUsers.filter((u) => u.hasRole);
  const usersWithoutRole = filteredUsers.filter((u) => !u.hasRole);
  const isPending = assignMutation.isPending || removeMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Gestionar Usuarios - {role?.name}
          </DialogTitle>
          <DialogDescription>Asigna o remueve este rol de los usuarios de tu empresa</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Búsqueda */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar usuarios por nombre o email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Lista de usuarios */}
          <div className="flex-1 overflow-y-auto space-y-4">
            {isLoading ? (
              <div className="text-sm text-muted-foreground text-center py-8">Cargando usuarios...</div>
            ) : (
              <>
                {/* Usuarios con el rol */}
                {usersWithRole.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold">Con este rol</h4>
                      <Badge variant="secondary" className="text-xs">
                        {usersWithRole.length}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      {usersWithRole.map((user) => (
                        <UserRow key={user.userId} user={user} onToggle={handleToggleRole} isPending={isPending} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Usuarios sin el rol */}
                {usersWithoutRole.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold">Sin este rol</h4>
                      <Badge variant="outline" className="text-xs">
                        {usersWithoutRole.length}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      {usersWithoutRole.map((user) => (
                        <UserRow key={user.userId} user={user} onToggle={handleToggleRole} isPending={isPending} />
                      ))}
                    </div>
                  </div>
                )}

                {filteredUsers.length === 0 && (
                  <div className="text-sm text-muted-foreground text-center py-8">No se encontraron usuarios</div>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── UserRow ──────────────────────────────────────────────────────────────────

function UserRow({
  user,
  onToggle,
  isPending,
}: {
  user: UserForRole;
  onToggle: (credentialId: string, hasRole: boolean) => void;
  isPending: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-md border transition-colors ${
        user.hasRole ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-muted/50'
      }`}
    >
      <Checkbox
        checked={user.hasRole}
        onCheckedChange={() => onToggle(user.credentialId, user.hasRole)}
        disabled={isPending}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{user.userName}</p>
        <p className="text-xs text-muted-foreground truncate">{user.userEmail}</p>
      </div>
      <Link href={`/dashboard/configuration/user/${user.userId}`} target="_blank">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          aria-label={`Abrir permisos de ${user.userName}`}
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </Button>
      </Link>
    </div>
  );
}
