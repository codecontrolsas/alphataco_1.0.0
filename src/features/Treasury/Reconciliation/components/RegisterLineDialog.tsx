'use client';

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Logger } from '@/lib/logger';
import { InputFormField } from '@/shared/components/common/form-fields';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { getReconciliationConcepts, registerLine } from '../../actions/reconciliation.server';
import { formatInCurrency } from '../../lib/currency-format';
import { formatDay } from '../../lib/dates';
import { TREASURY_QUERY_KEYS } from '../../lib/query-keys';
import { useTreasuryMutation } from '../../lib/use-treasury-mutation';
import { registerLineSchema, type RegisterLineValues } from '../../schemas/reconciliation';

const logger = new Logger('Treasury/RegisterLineDialog');

interface RegisterLineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: { id: string; date: string; description: string; amount: string };
}

/** Registrar una línea del extracto (gasto, interés, impuesto): crea su movimiento manual ya conciliado (spec etapa 4 §3.5). */
export function RegisterLineDialog({ open, onOpenChange, line }: RegisterLineDialogProps) {
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

  const save = useTreasuryMutation({
    action: (values: RegisterLineValues) => registerLine(values),
    onSuccess: () => {
      toast.success('Movimiento registrado y conciliado');
      onOpenChange(false);
    },
    logger,
    logError: 'Error al registrar la línea',
    errorFallback: 'No se pudo registrar la línea',
    refreshRoute: false,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar en el libro</DialogTitle>
          <DialogDescription>
            {formatDay(line.date)} · {formatInCurrency(line.amount, 'ARS')}. Se crea un movimiento manual en esa fecha,
            ya conciliado con la línea.
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
                        <p className="px-2 py-1.5 text-sm text-muted-foreground">
                          No hay conceptos de {direction === 'IN' ? 'ingresos' : 'egresos'}: crealos en Configuración
                        </p>
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
            <InputFormField control={form.control} name="description" label="Descripción" />
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
