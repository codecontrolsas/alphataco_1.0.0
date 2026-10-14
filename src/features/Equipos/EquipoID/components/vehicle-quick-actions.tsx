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
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Logger } from '@/lib/logger';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Truck } from 'lucide-react';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { toggleVehicleStatus } from '../lib/actions/vehicle-actions';
import { invalidateVehicleLists } from '../lib/invalidate-vehicle-lists';

const logger = new Logger('VehicleQuickActions');

interface VehicleQuickActionsProps {
  equipmentId: string | undefined;
  isActive: boolean | undefined;
}

const terminationSchema = z.object({
  reason_for_termination: z
    .string({ required_error: 'La razón de baja es requerida.' })
    .min(1, 'La razón de baja es requerida.'),
  termination_date: z.date({ required_error: 'La fecha de baja es requerida.' }),
});

const termination_reason_enum_equipment = ['venta', 'destrucción total', 'devolución', 'otro'];

export function VehicleQuickActions({ equipmentId, isActive }: VehicleQuickActionsProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [showActivateDialog, setShowActivateDialog] = useState(false);

  const handleActivate = () => {
    startTransition(async () => {
      try {
        await toggleVehicleStatus(equipmentId!, true);
        toast.success('Equipo activado correctamente');
        setShowActivateDialog(false);
        invalidateVehicleLists(queryClient);
        router.refresh();
      } catch (error) {
        logger.error('Error al activar el equipo', { data: { error, equipmentId } });
        toast.error(error instanceof Error ? error.message : 'Error al cambiar el estado del equipo');
      }
    });
  };

  const form = useForm<z.infer<typeof terminationSchema>>({
    resolver: zodResolver(terminationSchema),
    defaultValues: {
      reason_for_termination: '',
      termination_date: undefined,
    },
  });

  if (!equipmentId) return null;

  async function onSubmit(values: z.infer<typeof terminationSchema>) {
    startTransition(async () => {
      try {
        // Fecha como 'YYYY-MM-DD': la condición (no operativo) la fija el servidor.
        await toggleVehicleStatus(
          equipmentId!,
          false,
          values.reason_for_termination,
          moment(values.termination_date).format('YYYY-MM-DD')
        );
        toast.success(`Equipo dado de baja correctamente`);
        setShowDeactivateDialog(false);
        form.reset();
        invalidateVehicleLists(queryClient);
        router.refresh();
      } catch (error) {
        logger.error('Error al dar de baja el equipo', { data: { error, equipmentId } });
        toast.error(error instanceof Error ? error.message : 'Error al dar de baja al equipo');
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" aria-label="Más acciones del equipo">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isActive ? (
            <DropdownMenuItem onClick={() => setShowDeactivateDialog(true)} className="text-destructive">
              <Truck className="h-4 w-4 mr-2" />
              Dar de Baja Equipo
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setShowActivateDialog(true)} className="text-ok">
              <Truck className="h-4 w-4 mr-2" />
              Activar Equipo
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Deactivate Dialog */}
      <AlertDialog open={showDeactivateDialog} onOpenChange={setShowDeactivateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Dar de baja equipo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción dará de baja al equipo y dejará de figurar entre los activos. Podrás reactivarlo más tarde si
              es necesario.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="w-full">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <FormField
                  control={form.control}
                  name="reason_for_termination"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Motivo de Baja</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona la razón" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {termination_reason_enum_equipment.map((reason) => (
                            <SelectItem key={reason} value={reason}>
                              {reason}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>Elige la razón por la que deseas dar de baja al equipo</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="termination_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Fecha de Baja</FormLabel>
                      <FormControl>
                        <EnhancedDatePicker
                          date={field.value}
                          setDate={field.onChange}
                          minDate={new Date('1900-01-01')}
                          maxDate={moment(argentinaDate(), 'YYYY-MM-DD').toDate()}
                        />
                      </FormControl>
                      <FormDescription>
                        Fecha en la que se dio de baja (escribila o elegila en el calendario)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex gap-4 justify-end">
                  <Button type="submit" disabled={isPending}>
                    {isPending ? 'Dando de baja...' : 'Dar de baja'}
                  </Button>
                  <AlertDialogCancel onClick={() => setShowDeactivateDialog(false)}>Cancelar</AlertDialogCancel>
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
            <AlertDialogTitle>¿Activar equipo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción reactivará el equipo y volverá a figurar entre los activos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleActivate} disabled={isPending}>
              {isPending ? 'Activando...' : 'Activar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
