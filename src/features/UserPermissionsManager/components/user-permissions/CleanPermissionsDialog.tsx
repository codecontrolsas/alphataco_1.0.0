'use client';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Eraser } from 'lucide-react';
import { useState } from 'react';
import type { UserRolesData } from '@/features/Permissions/actions/roles.server';
import type { UserPermissionEditorState } from '../../hooks/useUserPermissionEditor';

interface CleanPermissionsDialogProps {
  disabled: boolean;
  userRoles: UserRolesData;
  overrideCount: number;
  editor: Pick<UserPermissionEditorState, 'cleanCustomPermissionsMutation' | 'cleanAllPermissionsMutation'>;
}

/** Confirmación para borrar los ajustes personales, o los roles y los ajustes del usuario. */
export function CleanPermissionsDialog({ disabled, userRoles, overrideCount, editor }: CleanPermissionsDialogProps) {
  const [open, setOpen] = useState(false);
  const { cleanCustomPermissionsMutation, cleanAllPermissionsMutation } = editor;
  const isPending = cleanCustomPermissionsMutation.isPending || cleanAllPermissionsMutation.isPending;
  const roleNames = userRoles.map((userRole) => userRole.roles?.name).filter(Boolean);

  if (userRoles.length === 0 && overrideCount === 0) return null;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled} className="h-9">
          <Eraser aria-hidden="true" />
          Limpiar accesos
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Limpiar accesos del usuario</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              {roleNames.length > 0 ? (
                <p>
                  {roleNames.length === 1 ? 'Rol asignado' : `${roleNames.length} roles asignados`}:{' '}
                  <span className="text-foreground font-medium">{roleNames.join(', ')}</span>.
                </p>
              ) : null}
              <p className="tabular-nums">
                {overrideCount === 0
                  ? 'Sin ajustes personales.'
                  : `${overrideCount} ${overrideCount === 1 ? 'ajuste personal' : 'ajustes personales'}.`}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          {overrideCount > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => cleanCustomPermissionsMutation.mutate(undefined, { onSuccess: () => setOpen(false) })}
              disabled={isPending}
              className="w-full"
            >
              {cleanCustomPermissionsMutation.isPending ? 'Eliminando…' : 'Eliminar solo los ajustes personales'}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="destructive"
            onClick={() => cleanAllPermissionsMutation.mutate(undefined, { onSuccess: () => setOpen(false) })}
            disabled={disabled || isPending}
            className="w-full"
          >
            {cleanAllPermissionsMutation.isPending ? 'Eliminando…' : 'Quitar roles y ajustes (queda sin acceso)'}
          </Button>
          <AlertDialogCancel className="mt-0 w-full">Cancelar</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
