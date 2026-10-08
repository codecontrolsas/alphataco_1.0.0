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
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { SearchCombobox, type SearchOption } from '../../components/SearchCombobox';
import { unwrapAction } from '../../lib/unwrap-action';
import {
  maintenanceMaterialRequestSchema,
  type MaintenanceMaterialRequestFormValues,
} from '../../schemas/requests';

const logger = new Logger('Warehouses/MaintenanceMaterialRequestDialog');

/** Valor del Select para "a nivel orden" (un SelectItem no admite value vacio). */
const ORDER_LEVEL = '__order__';

export interface MaterialSearchOption extends SearchOption {
  code: string;
  name: string;
  unit: string;
}

interface MaintenanceMaterialRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Subtitulo: a que orden/OT va el pedido. */
  description: string;
  /** OT fija (panel del operario). Si no hay, se elige de `workOrderOptions` o queda a nivel orden. */
  workOrderId?: string;
  workOrderOptions?: { id: string; label: string }[];
  search: (query: string) => Promise<{ items: MaterialSearchOption[]; total: number }>;
  searchQueryKey: readonly unknown[];
  submit: (values: MaintenanceMaterialRequestFormValues) => Promise<ActionResult<{ number: string }>>;
  onCreated: (number: string) => void;
}

const emptyLine = () => ({ materialId: '', quantity: '' });

/**
 * Pedido de materiales desde Mantenimiento (Almacenes etapa 4): solo materiales y cantidades.
 * Deposito, lote y serie los elige el almacen al entregar. Lo usan el panel del operario (OT
 * fija) y el detalle de la orden (elige la OT o la deja a nivel orden).
 */
export function MaintenanceMaterialRequestDialog({
  open,
  onOpenChange,
  description,
  workOrderId,
  workOrderOptions,
  search,
  searchQueryKey,
  submit,
  onCreated,
}: MaintenanceMaterialRequestDialogProps) {
  const [materials, setMaterials] = useState<Record<string, MaterialSearchOption>>({});
  const form = useForm<MaintenanceMaterialRequestFormValues>({
    resolver: zodResolver(maintenanceMaterialRequestSchema),
    defaultValues: { workOrderId: workOrderId ?? '', notes: '', lines: [emptyLine()] },
  });
  const lines = useFieldArray({ control: form.control, name: 'lines' });

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      form.reset({ workOrderId: workOrderId ?? '', notes: '', lines: [emptyLine()] });
      setMaterials({});
    }
  };

  const mutation = useMutation({
    mutationFn: async (values: MaintenanceMaterialRequestFormValues) => unwrapAction(await submit(values)),
    onSuccess: (result) => {
      toast.success(`${result.number} enviado: queda pendiente de aprobación`);
      onCreated(result.number);
      close(false);
    },
    onError: (error) => {
      logger.error('Error al enviar el pedido de materiales', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo enviar el pedido');
    },
  });

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pedir materiales</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
            {workOrderOptions && (
              <FormField
                control={form.control}
                name="workOrderId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Orden de trabajo</FormLabel>
                    <Select value={field.value || ORDER_LEVEL} onValueChange={(v) => field.onChange(v === ORDER_LEVEL ? '' : v)}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={ORDER_LEVEL}>Toda la orden (sin OT)</SelectItem>
                        {workOrderOptions.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="space-y-2">
              {lines.fields.map((line, index) => {
                const material = materials[line.id] ?? null;
                return (
                  <div key={line.id} className="flex items-start gap-2">
                    <FormField
                      control={form.control}
                      name={`lines.${index}.materialId`}
                      render={({ field }) => (
                        <FormItem className="min-w-0 flex-1">
                          <FormLabel className="sr-only">Material</FormLabel>
                          <SearchCombobox<MaterialSearchOption>
                            queryKey={searchQueryKey}
                            search={search}
                            value={field.value}
                            selectedLabel={material?.label ?? null}
                            onSelect={(option) => {
                              if (option) setMaterials((prev) => ({ ...prev, [line.id]: option }));
                              field.onChange(option?.id ?? '');
                            }}
                            placeholder="Elegí un material"
                            searchPlaceholder="Buscar por código o nombre"
                            noun="materiales"
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`lines.${index}.quantity`}
                      render={({ field }) => (
                        <FormItem className="w-36">
                          <FormLabel className="sr-only">Cantidad</FormLabel>
                          <div className="flex items-center gap-1">
                            <FormControl>
                              <Input inputMode="decimal" placeholder="Cantidad" className="tabular-nums" {...field} />
                            </FormControl>
                            <span className="w-8 shrink-0 text-sm text-muted-foreground">{material?.unit ?? ''}</span>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Quitar línea ${index + 1}`}
                      disabled={lines.fields.length === 1}
                      onClick={() => lines.remove(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
              <Button type="button" variant="outline" size="sm" onClick={() => lines.append(emptyLine())}>
                <Plus className="mr-1 h-4 w-4" />
                Agregar material
              </Button>
              {form.formState.errors.lines?.root?.message && (
                <p className="text-sm font-medium text-destructive">{form.formState.errors.lines.root.message}</p>
              )}
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nota</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="Para qué es, urgencia… (opcional)" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => close(false)} disabled={mutation.isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Enviando…' : 'Enviar pedido'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
