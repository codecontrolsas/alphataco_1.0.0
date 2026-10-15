'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { ImageOff, User } from 'lucide-react';
import { useState } from 'react';
import { getEmployeePicture } from '../actions.server';

interface EmployeeAvatarCellProps {
  employeeId: string;
  name: string;
  initials: string;
}

/**
 * Avatar de la celda del nombre. Al hacer clic abre un diálogo y recién ahí pide la foto del empleado
 * (`getEmployeePicture`): la foto es un base64 pesado y no viaja con las filas del listado.
 */
export function EmployeeAvatarCell({ employeeId, name, initials }: EmployeeAvatarCellProps) {
  const [open, setOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['employee-picture', employeeId],
    queryFn: () => getEmployeePicture(employeeId),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const picture = data?.picture ?? null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Ver foto de ${name}`}
          className="shrink-0 cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Avatar>
            <AvatarFallback>{initials || <User className="h-4 w-4" />}</AvatarFallback>
          </Avatar>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm p-2">
        <DialogTitle className="sr-only">Foto de {name}</DialogTitle>
        <DialogDescription className="sr-only">Foto del empleado {name}</DialogDescription>
        {isLoading ? (
          <Skeleton className="aspect-square w-full rounded-lg" />
        ) : isError ? (
          <p role="alert" className="p-6 text-center text-sm text-destructive">
            No se pudo cargar la foto.
          </p>
        ) : picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={picture} alt={name} className="h-auto w-full rounded-lg" />
        ) : (
          <div className="flex flex-col items-center gap-2 p-6 text-muted-foreground">
            <ImageOff className="h-8 w-8" aria-hidden="true" />
            <p className="text-sm">Este empleado no tiene foto cargada.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
