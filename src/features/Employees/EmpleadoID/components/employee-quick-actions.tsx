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
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Form } from '@/components/ui/form';
import {
  TerminationFormFields,
  terminationSchema,
  type TerminationFormValues,
} from '@/features/Employees/components/shared/TerminationFormFields';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { Logger } from '@/lib/logger';
import { CatalogFormSheet, useCatalogSheet } from '@/shared/components/common/CatalogFormSheet';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Mail, MoreHorizontal, UserCheck, UserX } from 'lucide-react';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { toggleEmployeeStatus } from '../lib/actions/document-actions';

const logger = new Logger('EmployeeQuickActions');

/** Si el servidor reporta un aviso (ej. no se pudo revocar el acceso del usuario), lo devuelve. */
function getStatusWarning(result: unknown): string | null {
  if (typeof result === 'object' && result !== null && 'warning' in result) {
    const { warning } = result;
    return typeof warning === 'string' && warning.length > 0 ? warning : null;
  }
  return null;
}

interface EmployeeQuickActionsProps {
  employeeId: string;
  isActive: boolean;
  email?: string;
}

export function EmployeeQuickActions({ employeeId, isActive, email }: EmployeeQuickActionsProps) {
  const [isPending, startTransition] = useTransition();
  // La baja pide motivo y fecha: va en un panel lateral (formulario), no en una confirmación.
  const deactivateSheet = useCatalogSheet<never>({ canCreate: isActive, canUpdate: false });
  const [showActivateDialog, setShowActivateDialog] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();

  /** Las listas de empleados (activos/bajas) y sus filtros quedan viejos tras cambiar un estado. */
  const refreshLists = () => {
    queryClient.invalidateQueries({ queryKey: ['employees-paginated'] });
    queryClient.invalidateQueries({ queryKey: ['datatable-facet'] });
    router.refresh();
  };

  const form = useForm<TerminationFormValues>({
    resolver: zodResolver(terminationSchema),
    defaultValues: {
      reason_for_termination: '',
      termination_date: undefined,
    },
  });

  async function onSubmit(values: TerminationFormValues) {
    startTransition(async () => {
      try {
        const result: unknown = await toggleEmployeeStatus(
          employeeId,
          false,
          values.reason_for_termination as Parameters<typeof toggleEmployeeStatus>[2],
          // Día calendario elegido, como YYYY-MM-DD (nunca un Date: corre el día según la zona).
          moment(values.termination_date).format('YYYY-MM-DD')
        );
        const warning = getStatusWarning(result);
        if (warning) {
          toast.warning('Empleado dado de baja, pero requiere atención', { description: warning, duration: 10000 });
        } else {
          toast.success('Empleado dado de baja correctamente');
        }
        deactivateSheet.close();
        form.reset();
        refreshLists();
      } catch (error) {
        logger.error('Error al dar de baja al empleado', { data: { error, employeeId } });
        toast.error(error instanceof Error && error.message ? error.message : 'Error al dar de baja al empleado');
      }
    });
  }

  const handleActivate = () => {
    startTransition(async () => {
      try {
        const result: unknown = await toggleEmployeeStatus(employeeId, true);
        const warning = getStatusWarning(result);
        if (warning) {
          toast.warning('Empleado activado, pero requiere atención', { description: warning, duration: 10000 });
        } else {
          toast.success('Empleado activado correctamente');
        }
        setShowActivateDialog(false);
        refreshLists();
      } catch (error) {
        logger.error('Error al activar al empleado', { data: { error, employeeId } });
        toast.error(error instanceof Error && error.message ? error.message : 'Error al activar al empleado');
      }
    });
  };

  const handleSendEmail = () => {
    if (email) {
      window.open(`mailto:${email}`, '_blank');
    } else {
      toast.error('El empleado no tiene email registrado');
    }
  };

  return (
    <>
      {/* `modal={false}`: el menú abre un Sheet; con el menú modal, Radix deja `pointer-events: none` en el body al cerrarlo. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="size-10" aria-label="Más acciones del legajo">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleSendEmail} disabled={!email}>
            <Mail className="mr-2 size-4" />
            Enviar email
          </DropdownMenuItem>
          {/* Baja y reactivación se atan a la edición del legajo (no existe permiso de borrado). */}
          <PermissionGuard module="empleados" tab="employees" action="update">
            {isActive ? (
              <DropdownMenuItem onClick={deactivateSheet.openCreate} className="text-destructive">
                <UserX className="mr-2 size-4" />
                Dar de baja
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => setShowActivateDialog(true)} className="text-ok-subtle-foreground">
                <UserCheck className="mr-2 size-4" />
                Reactivar
              </DropdownMenuItem>
            )}
          </PermissionGuard>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Baja: motivo + fecha en un panel lateral. */}
      <CatalogFormSheet
        sheet={deactivateSheet}
        getKey={() => employeeId}
        title={{ create: 'Dar de baja', edit: 'Dar de baja' }}
        description={{ create: 'Podés reactivarlo más tarde si hace falta.' }}
        size="md"
      >
        {({ close }) => (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <TerminationFormFields form={form} />
              <div className="bg-muted text-muted-foreground rounded-lg p-3 text-sm">
                <p className="text-foreground font-medium">Al confirmar</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  <li>Pasa a Bajas y se actualiza el estado de sus diagramas.</li>
                  <li>Si tiene usuario en el sistema, se le revoca el acceso y se cierran sus sesiones.</li>
                </ul>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" className="min-h-10" onClick={close} disabled={isPending}>
                  Cancelar
                </Button>
                <Button variant="destructive" type="submit" className="min-h-10" disabled={isPending}>
                  {isPending ? 'Procesando…' : 'Dar de baja'}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </CatalogFormSheet>

      {/* Activate Dialog */}
      <AlertDialog open={showActivateDialog} onOpenChange={setShowActivateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Reactivar al empleado?</AlertDialogTitle>
            <AlertDialogDescription>
              Vuelve a figurar entre los activos y recupera su acceso al sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                handleActivate();
              }}
              disabled={isPending}
            >
              {isPending ? 'Reactivando…' : 'Reactivar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
