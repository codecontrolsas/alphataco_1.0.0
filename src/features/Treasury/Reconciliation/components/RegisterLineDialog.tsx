'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { unwrapAction } from '@/features/Warehouses/lib/unwrap-action';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import moment from 'moment';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { getReconciliationConcepts, registerLine } from '../../actions/reconciliation.server';
import { formatInCurrency } from '../../lib/currency-format';
import { invalidateTreasury } from '../../lib/invalidate';
import { TREASURY_QUERY_KEYS } from '../../lib/query-keys';
import { registerLineSchema, type RegisterLineValues } from '../../schemas/reconciliation';

const logger = new Logger('Treasury/RegisterLineDialog');

interface RegisterLineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: { id: string; date: string; description: string; amount: string };
}

/** Registrar una línea del extracto (gasto, interés, impuesto): crea su movimiento manual ya conciliado (spec etapa 4 §3.5). */
export function RegisterLineDialog({ open, onOpenChange, line }: RegisterLineDialogProps) {
  const queryClient = useQueryClient();
  const direction = line.amount.startsWith('-') ? 'OUT' : 'IN';
  const { data: concepts, isLoading } = useQuery({
    queryKey: [...TREASURY_QUERY_KEYS.reconciliation, 'concepts'],
    queryFn: () => getReconciliationConcepts(),
    enabled: open,
  });
  const options = (concepts ?? []).filter((c) => c.direction === 'BOTH' || c.direction === direction);
  const form = useForm<RegisterLineValues>({
    resolver: zodResolver(registerLineSchema),
    defaultValues: { lineId: line.id, conceptId: '', description: line.description },
  });

  const save = useMutation({
    mutationFn: async (values: RegisterLineValues) => unwrapAction(await registerLine(values)),
    onSuccess: () => {
      toast.success('Movimiento registrado y conciliado');
      invalidateTreasury(queryClient);
      onOpenChange(false);
    },
    onError: (error) => {
      logger.error('Error al registrar la línea', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo registrar la línea');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar en el libro</DialogTitle>
          <DialogDescription>
            {moment(line.date, 'YYYY-MM-DD').format('DD/MM/YYYY')} · {formatInCurrency(line.amount, 'ARS')}. Se crea un movimiento manual en esa fecha, ya conciliado con la línea.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
            <FormField
              control={form.control}
              name="conceptId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Concepto</FormLabel>
                  <Select key={options.length} value={field.value} onValueChange={field.onChange} disabled={isLoading}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={isLoading ? 'Cargando conceptos…' : 'Elegí el concepto'} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {options.length === 0 && (
                        <p className="px-2 py-1.5 text-sm text-muted-foreground">No hay conceptos de {direction === 'IN' ? 'ingresos' : 'egresos'}: crealos en Configuración</p>
                      )}
                      {options.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
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
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? 'Registrando…' : 'Registrar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
