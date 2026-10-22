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
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { createCheckbook, getCheckbookFormData } from '../../actions/own-checks.server';
import { TREASURY_QUERY_KEYS } from '../../lib/query-keys';
import { useTreasuryMutation } from '../../lib/use-treasury-mutation';
import { checkbookSchema, type CheckbookValues } from '../../schemas/own-checks';

const logger = new Logger('Treasury/NewCheckbookDialog');

/** Alta de una chequera: cuenta bancaria y rango de números (spec Tesorería etapa 3b §2.1). */
export function NewCheckbookDialog() {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: [...TREASURY_QUERY_KEYS.checkbooks, 'form'],
    queryFn: () => getCheckbookFormData(),
    enabled: open,
    staleTime: 0,
  });
  const accounts = data?.accounts ?? [];
  const form = useForm<CheckbookValues>({
    resolver: zodResolver(checkbookSchema),
    defaultValues: { accountId: '', firstNumber: '', lastNumber: '' },
  });

  const save = useTreasuryMutation({
    action: (values: CheckbookValues) => createCheckbook(values),
    onSuccess: () => {
      toast.success('Chequera creada');
      form.reset({ accountId: '', firstNumber: '', lastNumber: '' });
      setOpen(false);
    },
    logger,
    logError: 'Error al crear la chequera',
    errorFallback: 'No se pudo crear la chequera',
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" />
        Nueva chequera
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva chequera</DialogTitle>
          <DialogDescription>
            Los números de los cheques físicos que te entregó el banco. Al pagar con cheque se propone el próximo libre.
          </DialogDescription>
        </DialogHeader>
        {!isLoading && accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay cuentas bancarias activas: creala en Tesorería → Configuración.
          </p>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
              <FormField
                control={form.control}
                name="accountId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cuenta bancaria</FormLabel>
                    <Select
                      key={accounts.length}
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isLoading}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={isLoading ? 'Cargando cuentas…' : 'Elegí la cuenta'} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <InputFormField
                  control={form.control}
                  name="firstNumber"
                  label="Desde el Nº"
                  inputMode="numeric"
                  className="tabular-nums"
                />
                <InputFormField
                  control={form.control}
                  name="lastNumber"
                  label="Hasta el Nº"
                  inputMode="numeric"
                  className="tabular-nums"
                />
              </div>
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending ? 'Creando…' : 'Crear chequera'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
