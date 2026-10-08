'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { updateDirectExitLimitAction } from '../../actions/settings.server';
import { formatMoney } from '../../lib/format';
import { unwrapAction } from '../../lib/unwrap-action';
import { directExitLimitSchema, type DirectExitLimitFormValues } from '../../schemas/requests';

const logger = new Logger('Warehouses/DirectExitSection');

/** Monto maximo de una salida directa: por encima, la salida va por pedido de materiales. */
export function DirectExitSection({ amount, canUpdate }: { amount: string | null; canUpdate: boolean }) {
  const router = useRouter();
  const form = useForm<DirectExitLimitFormValues>({
    resolver: zodResolver(directExitLimitSchema),
    defaultValues: { amount: amount ?? '' },
  });

  const mutation = useMutation({
    mutationFn: async (values: DirectExitLimitFormValues) => unwrapAction(await updateDirectExitLimitAction(values)),
    onSuccess: (_, values) => {
      toast.success(values.amount ? 'Monto máximo de salida directa guardado' : 'La salida directa queda sin límite de monto');
      form.reset(values);
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al guardar el monto de salida directa', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar');
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Salida directa</CardTitle>
        <CardDescription>
          Una salida desde &quot;Nuevo movimiento&quot; que supere este monto se rechaza y tiene que hacerse por pedido de
          materiales. Los materiales que requieren aprobación siempre van por pedido.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {canUpdate ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} className="flex flex-wrap items-end gap-3">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem className="w-56">
                    <FormLabel>Monto máximo ($)</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="Sin límite" className="tabular-nums" {...field} />
                    </FormControl>
                    <FormDescription>Vacío = sin límite.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={mutation.isPending || !form.formState.isDirty} className="mb-7">
                {mutation.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </form>
          </Form>
        ) : (
          <p className="text-sm tabular-nums">{amount ? `Máximo ${formatMoney(amount)}` : 'Sin límite de monto'}</p>
        )}
      </CardContent>
    </Card>
  );
}
