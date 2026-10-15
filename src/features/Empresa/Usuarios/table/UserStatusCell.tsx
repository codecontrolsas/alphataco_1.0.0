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
import { Form } from '@/components/ui/form';
import {
  TerminationFormFields,
  terminationSchema,
  type TerminationFormValues,
} from '@/features/Employees/components/shared/TerminationFormFields';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Ban, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { CompanyUserListItem } from '../lib/users-types';
import { banCompanyUser, unbanCompanyUser } from '../mutations.server';

const logger = new Logger('UserStatusCell');

export const COMPANY_USERS_QUERY_KEY = ['company-users'] as const;

interface UserStatusCellProps {
  row: CompanyUserListItem;
  canBan: boolean;
  canReactivate: boolean;
}

type DialogStep = 'idle' | 'ask-cascade' | 'termination-form' | 'confirm-ban' | 'ask-reactivate-cascade';

export function UserStatusCell({ row, canBan, canReactivate }: UserStatusCellProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<DialogStep>('idle');
  const [isPending, setIsPending] = useState(false);
  const [banWithEmployee, setBanWithEmployee] = useState(false);

  const form = useForm<TerminationFormValues>({
    resolver: zodResolver(terminationSchema),
    defaultValues: {
      reason_for_termination: '',
      termination_date: undefined,
    },
  });

  const isActive = row.is_active;
  const hasLinkedEmployee = !!row.profile?.employees;
  const linkedEmployeeActive = row.profile?.employees?.is_active ?? false;
  const linkedEmployeeInactive = hasLinkedEmployee && !linkedEmployeeActive;
  const employeeName = hasLinkedEmployee
    ? `[${row.profile?.employees?.file}] ${row.profile?.employees?.lastname} ${row.profile?.employees?.firstname}`
    : '';

  const resetState = () => {
    setStep('idle');
    setBanWithEmployee(false);
    form.reset();
  };

  // ── Ban flow ────────────────────────────────────────────────────────────────
  const handleBanClick = () => {
    if (hasLinkedEmployee && linkedEmployeeActive) {
      setStep('ask-cascade');
    } else {
      setStep('confirm-ban');
    }
  };

  const handleCascadeChoice = (withEmployee: boolean) => {
    setBanWithEmployee(withEmployee);
    if (withEmployee) {
      setStep('termination-form');
    } else {
      executeBan();
    }
  };

  const handleTerminationSubmit = async (values: TerminationFormValues) => {
    await executeBan({
      reason: values.reason_for_termination,
      date: values.termination_date,
    });
  };

  const executeBan = async (employeeTermination?: { reason: string; date: Date }) => {
    setIsPending(true);
    try {
      await banCompanyUser(row.id, employeeTermination);
      toast.success('Usuario dado de baja exitosamente');
      queryClient.invalidateQueries({ queryKey: [...COMPANY_USERS_QUERY_KEY] });
      resetState();
    } catch (error) {
      logger.error('Error baneando usuario', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'Error al dar de baja al usuario');
    } finally {
      setIsPending(false);
    }
  };

  // ── Unban flow ──────────────────────────────────────────────────────────────
  const handleReactivateClick = () => {
    if (linkedEmployeeInactive) {
      setStep('ask-reactivate-cascade');
    } else {
      executeUnban(false);
    }
  };

  const executeUnban = async (reactivateEmployee: boolean) => {
    setIsPending(true);
    try {
      await unbanCompanyUser(row.id, reactivateEmployee);
      toast.success('Usuario reactivado exitosamente');
      queryClient.invalidateQueries({ queryKey: [...COMPANY_USERS_QUERY_KEY] });
      resetState();
    } catch (error) {
      logger.error('Error reactivando usuario', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'Error al reactivar al usuario');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <>
      {/* Boton principal */}
      {isActive && canBan && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={handleBanClick}
        >
          <Ban className="h-3.5 w-3.5" />
          <span className="text-xs">Dar de baja</span>
        </Button>
      )}
      {!isActive && canReactivate && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-ok hover:text-ok hover:bg-ok-subtle"
          onClick={handleReactivateClick}
        >
          <UserCheck className="h-3.5 w-3.5" />
          <span className="text-xs">Reactivar</span>
        </Button>
      )}

      {/* Dialog: Pregunta cascada ban (con empleado vinculado activo) */}
      <AlertDialog open={step === 'ask-cascade'} onOpenChange={(open) => !open && resetState()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dar de baja usuario</AlertDialogTitle>
            <AlertDialogDescription>
              Este usuario tiene un empleado vinculado: <strong>{employeeName}</strong>. ¿Deseas tambien dar de baja al
              empleado?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={resetState}>Cancelar</AlertDialogCancel>
            <Button variant="outline" onClick={() => handleCascadeChoice(false)} disabled={isPending}>
              Solo quitar acceso
            </Button>
            <Button variant="destructive" onClick={() => handleCascadeChoice(true)} disabled={isPending}>
              Si, ambos
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: Formulario de terminacion del empleado */}
      <AlertDialog open={step === 'termination-form'} onOpenChange={(open) => !open && resetState()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Datos de baja del empleado</AlertDialogTitle>
            <AlertDialogDescription>
              Completa los datos de baja para el empleado <strong>{employeeName}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleTerminationSubmit)} className="space-y-4">
              <TerminationFormFields form={form} />
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={resetState} disabled={isPending}>
                  Cancelar
                </Button>
                <Button type="submit" variant="destructive" disabled={isPending}>
                  {isPending ? 'Procesando...' : 'Dar de baja'}
                </Button>
              </div>
            </form>
          </Form>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: Confirmar ban simple (sin empleado) */}
      <AlertDialog open={step === 'confirm-ban'} onOpenChange={(open) => !open && resetState()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dar de baja usuario</AlertDialogTitle>
            <AlertDialogDescription>
              Este usuario sera baneado y no podra acceder al sistema. Podras reactivarlo mas tarde.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={resetState}>Cancelar</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="destructive" onClick={() => executeBan()} disabled={isPending}>
                {isPending ? 'Procesando...' : 'Dar de baja'}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: Pregunta cascada reactivacion (con empleado inactivo) */}
      <AlertDialog open={step === 'ask-reactivate-cascade'} onOpenChange={(open) => !open && resetState()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reactivar usuario</AlertDialogTitle>
            <AlertDialogDescription>
              El empleado vinculado <strong>{employeeName}</strong> tambien esta dado de baja. ¿Deseas reactivar al
              empleado tambien?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={resetState}>Cancelar</AlertDialogCancel>
            <Button variant="outline" onClick={() => executeUnban(false)} disabled={isPending}>
              Solo restaurar acceso
            </Button>
            <Button onClick={() => executeUnban(true)} disabled={isPending}>
              {isPending ? 'Procesando...' : 'Si, ambos'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
