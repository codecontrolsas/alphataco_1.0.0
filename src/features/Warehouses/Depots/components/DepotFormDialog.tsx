'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { createWarehouse, searchDepotManagerOptions, updateWarehouse, type DepotForEdit } from '../../actions/catalog.server';
import { SearchCombobox } from '../../components/SearchCombobox';
import { WAREHOUSE_QUERY_KEYS } from '../../lib/query-keys';
import { unwrapAction } from '../../lib/unwrap-action';
import { warehouseFormSchema, type WarehouseFormValues } from '../../schemas/catalog';

const logger = new Logger('Warehouses/DepotFormDialog');

function toFormValues(depot: DepotForEdit | null): WarehouseFormValues {
  return {
    code: depot?.code ?? '',
    name: depot?.name ?? '',
    address: depot?.address ?? '',
    managerEmployeeId: depot?.manager_employee_id ?? '',
  };
}

interface DepotFormDialogProps {
  /** Para editar; sin esto es un alta con su propio boton. */
  depot?: DepotForEdit | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function DepotFormDialog({ depot = null, open: controlledOpen, onOpenChange }: DepotFormDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);
  const [managerLabel, setManagerLabel] = useState<string | null>(depot?.managerLabel ?? null);
  const open = controlledOpen ?? internalOpen;
  const isEdit = depot !== null;

  const form = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseFormSchema),
    defaultValues: toFormValues(depot),
  });

  const setOpen = (next: boolean) => {
    if (next) {
      form.reset(toFormValues(depot));
      setManagerLabel(depot?.managerLabel ?? null);
    }
    if (onOpenChange) onOpenChange(next);
    else setInternalOpen(next);
  };

  const mutation = useMutation({
    mutationFn: async (values: WarehouseFormValues) =>
      unwrapAction(isEdit ? await updateWarehouse(depot.id, values) : await createWarehouse(values)),
    onSuccess: (_data, values) => {
      toast.success(isEdit ? `Se actualizó "${values.name}"` : `Se creó el depósito "${values.name}"`);
      queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.depots });
      queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.stock });
      router.refresh();
      setOpen(false);
    },
    onError: (error) => {
      logger.error('Error al guardar el depósito', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el depósito');
    },
  });

  return (
    <>
      {!isEdit && (
        <Button type="button" variant="brand" size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo depósito
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEdit ? `Editar ${depot.name}` : 'Nuevo depósito'}</DialogTitle>
            <DialogDescription>Un lugar físico donde se guarda material: base, obra, pañol, camioneta.</DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Código</FormLabel>
                      <FormControl>
                        <Input placeholder="BASE" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre</FormLabel>
                      <FormControl>
                        <Input placeholder="Depósito Base Neuquén" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dirección</FormLabel>
                    <FormControl>
                      <Input placeholder="Opcional" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="managerEmployeeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Responsable</FormLabel>
                    <SearchCombobox
                      queryKey={['warehouse-depot-managers']}
                      search={searchDepotManagerOptions}
                      value={field.value}
                      selectedLabel={managerLabel}
                      onSelect={(option) => {
                        field.onChange(option?.id ?? '');
                        setManagerLabel(option?.label ?? null);
                      }}
                      placeholder="Sin responsable"
                      searchPlaceholder="Buscar por legajo o nombre"
                      noun="empleados"
                    />
                    <FormDescription>Opcional.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear depósito'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
