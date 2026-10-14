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
import { toggleOtherEquipmentStatus } from '@/features/Equipos/OtherEquipment/actions/actionsServer';
import { Logger } from '@/lib/logger';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Package } from 'lucide-react';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const logger = new Logger('OtherEquipmentQuickActions');

interface OtherEquipmentQuickActionsProps {
  equipmentId: string;
  isActive: boolean;
}

const terminationSchema = z.object({
  reason_for_termination: z
    .string({ required_error: 'La razón de baja es requerida.' })
    .min(1, 'La razón de baja es requerida.'),
  termination_date: z.date({ required_error: 'La fecha de baja es requerida.' }),
});

const TERMINATION_REASONS = ['venta', 'destrucción total', 'devolución', 'otro'];

export function OtherEquipmentQuickActions({ equipmentId, isActive }: OtherEquipmentQuickActionsProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [showActivateDialog, setShowActivateDialog] = useState(false);

  const form = useForm<z.infer<typeof terminationSchema>>({
    resolver: zodResolver(terminationSchema),
    defaultValues: {
      reason_for_termination: '',
      termination_date: undefined,
    },
  });

  // Hoy en hora argentina: el navegador puede estar en otra zona
  const today = moment(argentinaDate(), 'YYYY-MM-DD').toDate();

  // El equipo pasa entre el listado de activos y el de dados de baja (tablas de React Query)
  const refreshAfterChange = () => {
    queryClient.invalidateQueries({ queryKey: ['other-equipment-paginated'] });
    queryClient.invalidateQueries({ queryKey: ['inactive-other-equipment-list'] });
    queryClient.invalidateQueries({ queryKey: ['datatable-facet'] });
    router.refresh();
  };

  const handleActivate = () => {
    startTransition(async () => {
      try {
        await toggleOtherEquipmentStatus(equipmentId, true);
        toast.success('Equipo activado correctamente');
        setShowActivateDialog(false);
        refreshAfterChange();
      } catch (error) {
        logger.error('Error al activar el equipo', { data: { error, equipmentId } });
        toast.error(error instanceof Error ? error.message : 'Error al activar el equipo');
      }
    });
  };

  const onSubmitDeactivate = (values: z.infer<typeof terminationSchema>) => {
    startTransition(async () => {
      try {
        await toggleOtherEquipmentStatus(
          equipmentId,
          false,
          values.reason_for_termination,
          // Día calendario (YYYY-MM-DD): un Date serializado correría el día según la zona del navegador
          moment(values.termination_date).format('YYYY-MM-DD')
        );
        toast.success('Equipo dado de baja correctamente');
        setShowDeactivateDialog(false);
        form.reset();
        refreshAfterChange();
      } catch (error) {
        logger.error('Error al dar de baja al equipo', { data: { error, equipmentId } });
        toast.error(error instanceof Error ? error.message : 'Error al dar de baja al equipo');
      }
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isActive ? (
            <DropdownMenuItem onClick={() => setShowDeactivateDialog(true)} className="text-destructive">
              <Package className="h-4 w-4 mr-2" />
              Dar de Baja Equipo
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setShowActivateDialog(true)} className="text-green-600">
              <Package className="h-4 w-4 mr-2" />
              Activar Equipo
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Dialog de dar de baja */}
      <AlertDialog open={showDeactivateDialog} onOpenChange={setShowDeactivateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Dar de baja el equipo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción dará de baja al equipo. Podrás reactivarlo más tarde si es necesario.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="w-full">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmitDeactivate)} className="space-y-8">
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
                          {TERMINATION_REASONS.map((reason) => (
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
                          setDate={(date) => field.onChange(date)}
                          minDate={new Date('1900-01-01')}
                          maxDate={today}
                        />
                      </FormControl>
                      <FormDescription>Fecha en la que se dio de baja</FormDescription>
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

      {/* Dialog de activar */}
      <AlertDialog open={showActivateDialog} onOpenChange={setShowActivateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Activar equipo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción reactivará el equipo y volverá a figurar en el listado de equipamiento activo.
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
