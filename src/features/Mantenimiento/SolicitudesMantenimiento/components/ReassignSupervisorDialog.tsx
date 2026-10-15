'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { fetchSupervisorsForChecklist } from '@/features/Checklists/actions/actionsServer';
import { ActionDialogResource, getActionErrorMessage } from '@/features/Mantenimiento/shared/components/ActionDialogParts';
import { SearchableSelect } from '@/features/Mantenimiento/shared/components/SearchableSelect';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { getResourceCondition } from '../../shared/maintenance-resource';
import { invalidateAllMaintenanceQueries } from '../../utils/queryInvalidation';
import { reassignRequestSupervisor } from '../actions/approvals.server';
import { getResourceLabel } from '../../shared/maintenance-resource';
import type { MaintenanceRequestData } from '../actions/queries.server';

const logger = new Logger('ReassignSupervisorDialog');

interface ReassignSupervisorDialogProps {
  request: MaintenanceRequestData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const reassignSchema = z.object({
  supervisorId: z.string().min(1, 'Debe seleccionar un supervisor'),
});

type ReassignValues = z.infer<typeof reassignSchema>;

/**
 * Reasignación del supervisor de turno de una solicitud.
 * Permiso: `maintenance_requests:update` (lo exige el servidor y la tabla oculta la acción sin él).
 */
export function ReassignSupervisorDialog({ request, open, onOpenChange, onSuccess }: ReassignSupervisorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* El formulario vive dentro de DialogContent: al cerrar se desmonta y vuelve al supervisor actual. */}
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <ReassignForm request={request} onOpenChange={onOpenChange} onSuccess={onSuccess} />
      </DialogContent>
    </Dialog>
  );
}

function ReassignForm({
  request,
  onOpenChange,
  onSuccess,
}: Pick<ReassignSupervisorDialogProps, 'request' | 'onOpenChange' | 'onSuccess'>) {
  const queryClient = useQueryClient();
  // Tras el éxito el botón sigue bloqueado mientras el diálogo termina de cerrarse.
  const [isDone, setIsDone] = useState(false);

  // Pre-cargar con el supervisor actual de la solicitud
  const currentSupervisorId = request.supervisor?.id ?? request.supervisor_id ?? undefined;

  const form = useForm<ReassignValues>({
    resolver: zodResolver(reassignSchema),
    mode: 'onChange',
    defaultValues: { supervisorId: currentSupervisorId ?? '' },
  });
  const { isSubmitting, isValid } = form.formState;

  // Cargar lista de supervisores disponibles
  const {
    data: supervisors,
    isLoading: isLoadingSupervisors,
    isError: isSupervisorsError,
    refetch: refetchSupervisors,
    isFetching: isFetchingSupervisors,
  } = useQuery({
    queryKey: ['supervisors-for-checklist'],
    queryFn: () => fetchSupervisorsForChecklist(),
    staleTime: 5 * 60 * 1000,
  });

  // Opciones del combobox con buscador: la lista de supervisores es larga y
  // buscar por nombre es mas rapido que recorrerla.
  const supervisorOptions = useMemo(
    () =>
      (supervisors ?? []).map((supervisor) => ({
        value: supervisor.id,
        label: supervisor.fullName,
        disabled: !supervisor.isAvailable,
        trailing: !supervisor.hasLinkedEmployee ? (
          <Badge variant="outline" className="shrink-0 text-[10px]">
            Sin empleado vinculado
          </Badge>
        ) : !supervisor.hasActiveDiagram ? (
          <Badge variant="warning" className="shrink-0 text-[10px]">
            Sin diagrama activo
          </Badge>
        ) : null,
      })),
    [supervisors]
  );

  async function onSubmit(values: ReassignValues) {
    try {
      await reassignRequestSupervisor(request.id, values.supervisorId);

      setIsDone(true);
      toast.success('Supervisor reasignado correctamente');
      invalidateAllMaintenanceQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['datatable-facet'] });
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      logger.error('Error al reasignar supervisor', { data: { error, requestId: request.id } });
      toast.error('Error al reasignar el supervisor', { description: getActionErrorMessage(error) ?? undefined });
    }
  }

  const blocked = isSubmitting || isDone;
  const vehicleLabel = getResourceLabel(request);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <DialogHeader>
          <DialogTitle>Reasignar Supervisor</DialogTitle>
          <DialogDescription>
            Selecciona el nuevo supervisor de turno para la solicitud del equipo{' '}
            <span className="font-medium">{vehicleLabel}</span>.
          </DialogDescription>
        </DialogHeader>

        <ActionDialogResource row={request} condition={getResourceCondition(request)} />

        {/* Supervisor actual */}
        {request.supervisor?.fullname && (
          <div className="text-muted-foreground text-sm">
            Supervisor actual: <span className="text-foreground font-medium">{request.supervisor.fullname}</span>
          </div>
        )}

        {/* Select de supervisores */}
        <FormField
          control={form.control}
          name="supervisorId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nuevo supervisor *</FormLabel>
              {isLoadingSupervisors ? (
                <div role="status" className="text-muted-foreground flex items-center gap-2 py-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Cargando supervisores...
                </div>
              ) : isSupervisorsError ? (
                <div role="alert" className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="text-destructive">No se pudo cargar la lista de supervisores.</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => refetchSupervisors()}
                    disabled={isFetchingSupervisors}
                  >
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    Reintentar
                  </Button>
                </div>
              ) : (
                <FormControl>
                  <SearchableSelect
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={blocked}
                    options={supervisorOptions}
                    placeholder="Seleccionar supervisor..."
                    searchPlaceholder="Buscar supervisor..."
                    emptyMessage="No hay supervisores disponibles"
                  />
                </FormControl>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={blocked}>
            Cancelar
          </Button>
          <Button type="submit" disabled={blocked || !isValid || isLoadingSupervisors || isSupervisorsError}>
            {blocked && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Confirmar
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
