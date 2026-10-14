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
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
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
        setShowDeactivateDialog(false);
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Más acciones">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleSendEmail} disabled={!email}>
            <Mail className="h-4 w-4 mr-2" />
            Enviar Email
          </DropdownMenuItem>
          {/* Baja y reactivación se atan a la edición del legajo (no existe permiso de borrado). */}
          <PermissionGuard module="empleados" tab="employees" action="update">
            {isActive ? (
              <DropdownMenuItem onClick={() => setShowDeactivateDialog(true)} className="text-destructive">
                <UserX className="h-4 w-4 mr-2" />
                Dar de Baja Empleado
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => setShowActivateDialog(true)} className="text-ok-subtle-foreground">
                <UserCheck className="h-4 w-4 mr-2" />
                Activar Empleado
              </DropdownMenuItem>
            )}
          </PermissionGuard>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Deactivate Dialog */}
      <AlertDialog open={showDeactivateDialog} onOpenChange={setShowDeactivateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Dar de baja al empleado?</AlertDialogTitle>
            <AlertDialogDescription>Podés reactivarlo más tarde si hace falta.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="w-full">
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
                <div className="flex justify-end gap-2">
                  <AlertDialogCancel type="button" onClick={() => setShowDeactivateDialog(false)}>
                    Cancelar
                  </AlertDialogCancel>
                  <Button variant="destructive" type="submit" disabled={isPending}>
                    {isPending ? 'Procesando…' : 'Dar de baja'}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Activate Dialog */}
      <AlertDialog open={showActivateDialog} onOpenChange={setShowActivateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Activar empleado?</AlertDialogTitle>
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
              {isPending ? 'Activando...' : 'Activar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
