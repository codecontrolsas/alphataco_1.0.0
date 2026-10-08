'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { getReturnWarehouses, returnLoanedUnitsAction } from '../../actions/loans.server';
import { WAREHOUSE_QUERY_KEYS } from '../../lib/query-keys';
import { unwrapAction } from '../../lib/unwrap-action';
import { returnLoanSchema, type ReturnLoanFormValues } from '../../schemas/loans';

const logger = new Logger('Warehouses/ReturnLoanDialog');

interface ReturnLoanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unitId: string;
  exitMovementId: string;
  serialNumber: string;
  materialName: string;
  holder: string | null;
}

/** Devolucion de una herramienta prestada al deposito que se elija. */
export function ReturnLoanDialog({
  open,
  onOpenChange,
  unitId,
  exitMovementId,
  serialNumber,
  materialName,
  holder,
}: ReturnLoanDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: warehouses = [], isLoading } = useQuery({
    queryKey: WAREHOUSE_QUERY_KEYS.returnWarehouses,
    queryFn: () => getReturnWarehouses(),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const form = useForm<ReturnLoanFormValues>({
    resolver: zodResolver(returnLoanSchema),
    defaultValues: { exitMovementId, unitIds: [unitId], warehouseId: '', occurredOn: new Date(), notes: '' },
  });

  const mutation = useMutation({
    mutationFn: async (values: ReturnLoanFormValues) => unwrapAction(await returnLoanedUnitsAction(values)),
    onSuccess: (result) => {
      toast.success(`${result.number}: ${result.serials.join(', ')} devuelto a ${result.warehouseName}`);
      queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.loans });
      queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.stock });
      queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.movements });
      router.refresh();
      onOpenChange(false);
    },
    onError: (error) => {
      logger.error('Error al registrar la devolución', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo registrar la devolución');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Devolver {serialNumber}</DialogTitle>
          <DialogDescription>
            {materialName}
            {holder ? ` · en poder de ${holder}` : ''}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
            <FormField
              control={form.control}
              name="warehouseId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vuelve al depósito</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={isLoading}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={isLoading ? 'Cargando…' : 'Elegí un depósito'} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {warehouses.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name} ({w.code})
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
              name="occurredOn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha</FormLabel>
                  <FormControl>
                    <EnhancedDatePicker date={field.value} setDate={field.onChange} placeholder="DD/MM/AAAA" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observaciones</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="Estado en que vuelve (opcional)" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Registrando…' : 'Registrar devolución'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
