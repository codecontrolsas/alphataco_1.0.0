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
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toggleVehicleStatus } from '@/features/Equipos/EquipoID/lib/actions/vehicle-actions';
import { invalidateVehicleLists } from '@/features/Equipos/EquipoID/lib/invalidate-vehicle-lists';
import { toggleOtherEquipmentStatus } from '@/features/Equipos/OtherEquipment/actions/actionsServer';
import { Logger } from '@/lib/logger';
import { CatalogFormSheet, useCatalogSheet } from '@/shared/components/common/CatalogFormSheet';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, PackageCheck, PackageX } from 'lucide-react';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const logger = new Logger('EquipmentStatusActions');

const TERMINATION_REASONS = ['venta', 'destrucción total', 'devolución', 'otro'] as const;

const terminationSchema = z.object({
  reason_for_termination: z
    .string({ required_error: 'El motivo de baja es requerido.' })
    .min(1, 'El motivo de baja es requerido.'),
  termination_date: z
    .date({ required_error: 'La fecha de baja es requerida.' })
    // El día elegido no puede ser posterior al "hoy" argentino (el servidor también lo valida).
    .refine((date) => moment(date).format('YYYY-MM-DD') <= argentinaDate(), 'La fecha de baja no puede ser futura.'),
});

type TerminationValues = z.infer<typeof terminationSchema>;

interface EquipmentStatusActionsProps {
  equipmentId: string;
  isActive: boolean;
  /** Vehículo u otro equipo: cambian la action de estado y los listados a refrescar. */
  kind: 'vehicle' | 'other';
}

/**
 * Menú de acciones de la ficha de un equipo: baja (motivo + fecha en un panel lateral) y reactivación.
 * Lo montan las cabeceras de vehículos y de otros equipos; el permiso lo resuelve quien lo monta.
 */
export function EquipmentStatusActions({ equipmentId, isActive, kind }: EquipmentStatusActionsProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const deactivateSheet = useCatalogSheet<never>({ canCreate: isActive, canUpdate: false });
  const [showActivateDialog, setShowActivateDialog] = useState(false);

  const form = useForm<TerminationValues>({
    resolver: zodResolver(terminationSchema),
    defaultValues: { reason_for_termination: '', termination_date: undefined },
  });

  /** Los listados (activos / dados de baja) y los conteos de sus filtros quedan viejos tras el cambio. */
  const refreshLists = () => {
    if (kind === 'vehicle') {
      invalidateVehicleLists(queryClient);
    } else {
      queryClient.invalidateQueries({ queryKey: ['other-equipment-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['inactive-other-equipment-list'] });
      queryClient.invalidateQueries({ queryKey: ['datatable-facet'] });
    }
    router.refresh();
  };

  const toggleStatus = (activate: boolean, reason?: string, terminationDate?: string) =>
    kind === 'vehicle'
      ? toggleVehicleStatus(equipmentId, activate, reason, terminationDate)
      : toggleOtherEquipmentStatus(equipmentId, activate, reason, terminationDate);

  const onSubmit = (values: TerminationValues) => {
    startTransition(async () => {
      try {
        // Día calendario como YYYY-MM-DD: un Date serializado correría el día según la zona del navegador.
        await toggleStatus(false, values.reason_for_termination, moment(values.termination_date).format('YYYY-MM-DD'));
        toast.success('Equipo dado de baja correctamente');
        deactivateSheet.close();
        form.reset();
        refreshLists();
      } catch (error) {
        logger.error('Error al dar de baja el equipo', { data: { error, equipmentId, kind } });
        toast.error(error instanceof Error && error.message ? error.message : 'Error al dar de baja al equipo');
      }
    });
  };

  const handleActivate = () => {
    startTransition(async () => {
      try {
        await toggleStatus(true);
        toast.success('Equipo reactivado correctamente');
        setShowActivateDialog(false);
        refreshLists();
      } catch (error) {
        logger.error('Error al reactivar el equipo', { data: { error, equipmentId, kind } });
        toast.error(error instanceof Error && error.message ? error.message : 'Error al reactivar el equipo');
      }
    });
  };

  return (
    <>
      {/* `modal={false}`: el menú abre un Sheet; con el menú modal, Radix deja `pointer-events: none` en el body al cerrarlo. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="size-10" aria-label="Más acciones del equipo">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isActive ? (
            <DropdownMenuItem onClick={deactivateSheet.openCreate} className="text-destructive">
              <PackageX className="mr-2 size-4" />
              Dar de baja
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setShowActivateDialog(true)} className="text-ok-subtle-foreground">
              <PackageCheck className="mr-2 size-4" />
              Reactivar
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <CatalogFormSheet
        sheet={deactivateSheet}
        getKey={() => equipmentId}
        title={{ create: 'Dar de baja el equipo', edit: 'Dar de baja el equipo' }}
        description={{ create: 'Podés reactivarlo más tarde si hace falta.' }}
        size="md"
      >
        {({ close }) => (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="reason_for_termination"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Motivo de baja</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccioná el motivo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TERMINATION_REASONS.map((reason) => (
                          <SelectItem key={reason} value={reason}>
                            {reason}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="termination_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Fecha de baja</FormLabel>
                    <FormControl>
                      <EnhancedDatePicker
                        date={field.value}
                        setDate={field.onChange}
                        minDate={new Date('1900-01-01')}
                        maxDate={moment(argentinaDate(), 'YYYY-MM-DD').toDate()}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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

      <AlertDialog open={showActivateDialog} onOpenChange={setShowActivateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Reactivar el equipo?</AlertDialogTitle>
            <AlertDialogDescription>Vuelve a figurar entre los equipos activos.</AlertDialogDescription>
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
