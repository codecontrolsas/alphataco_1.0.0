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
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Logger } from '@/lib/logger';
import { DateFormField } from '@/shared/components/common/form-fields';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { createOpeningBalance, updateOpeningBalance } from '../../actions/movements.server';
import { invalidateTreasury } from '../../lib/invalidate';
import { treasuryToday } from '../../lib/today';
import { openingBalanceFormSchema, type OpeningBalanceFormValues } from '../../schemas/movements';

const logger = new Logger('Treasury/OpeningBalanceDialog');

interface OpeningBalanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: { id: string; name: string };
  /** Saldo inicial vigente: si existe, se edita. */
  current: { id: string; date: string; amount: string } | null;
}

/**
 * Saldo inicial de una cuenta (spec Tesorería etapa 1 §3): uno vigente, con fecha e importe (puede
 * ser negativo: un banco en descubierto). Se monta al abrirse.
 */
export function OpeningBalanceDialog({ open, onOpenChange, account, current }: OpeningBalanceDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<OpeningBalanceFormValues>({
    resolver: zodResolver(openingBalanceFormSchema),
    defaultValues: { accountId: account.id, date: current?.date ?? treasuryToday(), amount: current?.amount ?? '' },
  });

  const save = useMutation({
    mutationFn: async (values: OpeningBalanceFormValues) =>
      unwrapAction(current ? await updateOpeningBalance(current.id, values) : await createOpeningBalance(values)),
    onSuccess: () => {
      toast.success(`Saldo inicial de ${account.name} guardado`);
      onOpenChange(false);
      invalidateTreasury(queryClient);
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al guardar el saldo inicial', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el saldo inicial');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Saldo inicial · {account.name}</DialogTitle>
          <DialogDescription>
            Lo que había en la cuenta o caja el día que se empieza a usar Tesorería.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
            <DateFormField control={form.control} name="date" label="Fecha" />
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Importe</FormLabel>
                  <FormControl>
                    <Input inputMode="decimal" placeholder="0,00" {...field} />
                  </FormControl>
                  <FormDescription>Negativo si la cuenta arranca en descubierto.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
