'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Logger } from '@/lib/logger';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ShieldCheck, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { assignRoleToUserServer, getAllRolesWithCounts, removeRoleFromUserServer, type AllRolePermissionsMap, type RoleWithCount, type UserRolesData } from '@/features/Permissions/actions/roles.server';
import { equipmentTypeVisibilityKeys } from '../../hooks/useEquipmentTypeVisibility';
import { userPermissionKeys } from '../../hooks/useUserPermissionEditor';

const logger = new Logger('AssignedRolesCard');

interface AssignedRolesCardProps {
  userId: string;
  disabled: boolean;
  initialRoles: RoleWithCount[];
  userRoles: UserRolesData;
  rolePermissions: AllRolePermissionsMap;
}

const permissionCountLabel = (count: number) => `${count} ${count === 1 ? 'permiso' : 'permisos'}`;

function RoleDot({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden="true"
      className="bg-muted-foreground/40 size-2.5 shrink-0 rounded-full"
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}

/** Roles del usuario en la empresa: cada uno suma sus permisos. Asignar y quitar se guarda al instante. */
export function AssignedRolesCard({
  userId,
  disabled,
  initialRoles,
  userRoles,
  rolePermissions,
}: AssignedRolesCardProps) {
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [roleToRemove, setRoleToRemove] = useState<{ id: number; name: string } | null>(null);

  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: () => getAllRolesWithCounts(),
    initialData: initialRoles,
  });

  const invalidateAfterRoleChange = () => {
    void queryClient.invalidateQueries({ queryKey: userPermissionKeys.roles(userId) });
    void queryClient.invalidateQueries({ queryKey: userPermissionKeys.permissions(userId) });
    // Los tipos de equipamiento que ve el usuario se resuelven con sus roles
    void queryClient.invalidateQueries({ queryKey: equipmentTypeVisibilityKeys.user(userId) });
    void queryClient.invalidateQueries({ queryKey: ['permissions'] });
    void queryClient.invalidateQueries({ queryKey: ['role-user-counts'] });
    void queryClient.invalidateQueries({ queryKey: ['roles'] });
  };

  const assignMutation = useMutation({
    mutationFn: (role: { id: number; name: string }) => assignRoleToUserServer(userId, role.id),
    onSuccess: (_result, role) => {
      invalidateAfterRoleChange();
      toast.success(`Rol "${role.name}" asignado`);
    },
    onError: (error) => {
      logger.error('Error al asignar rol', { data: { error, userId } });
      toast.error('No se pudo asignar el rol');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (role: { id: number; name: string }) => removeRoleFromUserServer(userId, role.id),
    onSuccess: (_result, role) => {
      invalidateAfterRoleChange();
      toast.success(`Rol "${role.name}" quitado`);
    },
    onError: (error) => {
      logger.error('Error al quitar rol', { data: { error, userId } });
      toast.error('No se pudo quitar el rol');
    },
  });

  const isPending = assignMutation.isPending || removeMutation.isPending;
  const assignedIds = new Set(userRoles.map((userRole) => userRole.role_id));
  const assignable = roles.filter((role) => !assignedIds.has(role.id));

  const picker = (
    <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" disabled={disabled || isPending || assignable.length === 0} className="h-9">
          <Plus aria-hidden="true" />
          Asignar rol
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <Command>
          <CommandInput placeholder="Buscar rol" />
          <CommandList>
            <CommandEmpty>Ningún rol coincide.</CommandEmpty>
            <CommandGroup>
              {assignable.map((role) => (
                <CommandItem
                  key={role.id}
                  value={`${role.name} ${role.description ?? ''}`}
                  onSelect={() => {
                    setPickerOpen(false);
                    assignMutation.mutate({ id: role.id, name: role.name });
                  }}
                  className="items-start gap-2.5 py-2"
                >
                  <span className="mt-1.5">
                    <RoleDot color={role.color} />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{role.name}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {permissionCountLabel(rolePermissions.get(role.id)?.length ?? 0)}
                      {role.description ? ` · ${role.description}` : ''}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );

  return (
    <SectionCard
      title="Roles asignados"
      description="Cada rol suma sus permisos. Lo que ningún rol da se concede abajo como ajuste personal."
      action={disabled ? undefined : picker}
      flush
    >
      {userRoles.length === 0 ? (
        <StateBlock
          variant="empty"
          icon={ShieldCheck}
          title="Sin roles asignados"
          description="Solo tiene los permisos concedidos como ajuste personal."
        />
      ) : (
        <ul className="divide-y" aria-busy={isPending}>
          {userRoles.map((userRole) => {
            const role = userRole.roles;
            const name = role?.name ?? `Rol ${userRole.role_id}`;
            const count = rolePermissions.get(userRole.role_id)?.length ?? 0;
            return (
              <li key={userRole.id} className="flex items-start gap-3 px-5 py-3.5">
                <span className="mt-1.5">
                  <RoleDot color={role?.color ?? null} />
                </span>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{name}</span>
                    <Badge variant="outline" className="font-normal">
                      {role?.is_system ? 'Del sistema' : 'Propio de la empresa'}
                    </Badge>
                    {role?.is_active === false ? (
                      <Badge variant="outline" className="border-warn/40 text-warn-subtle-foreground font-normal">
                        Inactivo: no suma permisos
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground text-sm tabular-nums">
                    {permissionCountLabel(count)}
                    {role?.description ? ` · ${role.description}` : ''}
                  </p>
                </div>
                {disabled ? null : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={isPending}
                    onClick={() => setRoleToRemove({ id: userRole.role_id, name })}
                    aria-label={`Quitar el rol ${name}`}
                    className="size-10 shrink-0"
                  >
                    <X aria-hidden="true" className="size-4" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog open={roleToRemove !== null} onOpenChange={(open) => !open && setRoleToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quitar el rol {roleToRemove?.name}</AlertDialogTitle>
            <AlertDialogDescription>
              Deja de tener los permisos que le daba este rol, salvo los que le den otros roles o sus ajustes
              personales.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (roleToRemove) removeMutation.mutate(roleToRemove);
                setRoleToRemove(null);
              }}
            >
              Quitar rol
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  );
}
