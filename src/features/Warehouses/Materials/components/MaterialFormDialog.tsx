'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  createMaterial,
  updateMaterial,
  type MaterialForEdit,
  type MaterialFormLookups,
} from '../../actions/catalog.server';
import { TRACKING_TYPE_LABELS } from '../../lib/labels';
import { WAREHOUSE_QUERY_KEYS } from '../../lib/query-keys';
import { unwrapAction } from '../../lib/unwrap-action';
import { materialFormSchema, type MaterialFormValues } from '../../schemas/catalog';
import { MATERIAL_TRACKING_TYPES } from '../../schemas/stock-movement';

const logger = new Logger('Warehouses/MaterialFormDialog');

/** Valor del Select para "sin categoria" (un SelectItem no admite value vacio). */
const NO_CATEGORY = '__none__';

function toFormValues(material: MaterialForEdit | null): MaterialFormValues {
  return {
    code: material?.code ?? '',
    name: material?.name ?? '',
    description: material?.description ?? '',
    categoryId: material?.category_id ?? '',
    unitId: material?.unit_id ?? '',
    trackingType: material?.tracking_type ?? 'QUANTITY',
    requiresApproval: material?.requires_approval ?? false,
    minStock: material?.min_stock ?? '',
  };
}

interface MaterialFormDialogProps {
  lookups: MaterialFormLookups;
  /** Para editar; sin esto es un alta con su propio boton. */
  material?: MaterialForEdit | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function MaterialFormDialog({ lookups, material = null, open: controlledOpen, onOpenChange }: MaterialFormDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const isEdit = material !== null;
  const isManaged = !!material?.managedNotice;

  const form = useForm<MaterialFormValues>({
    resolver: zodResolver(materialFormSchema),
    defaultValues: toFormValues(material),
  });

  const setOpen = (next: boolean) => {
    if (next) form.reset(toFormValues(material));
    if (onOpenChange) onOpenChange(next);
    else setInternalOpen(next);
  };

  const mutation = useMutation({
    mutationFn: async (values: MaterialFormValues) =>
      unwrapAction(isEdit ? await updateMaterial(material.id, values) : await createMaterial(values)),
    onSuccess: (_data, values) => {
      toast.success(isEdit ? `Material ${values.code} actualizado` : `Material ${values.code} creado`);
      queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.materials });
      queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.stock });
      router.refresh();
      setOpen(false);
    },
    onError: (error) => {
      logger.error('Error al guardar el material', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el material');
    },
  });

  return (
    <>
      {!isEdit && (
        <Button type="button" variant="brand" size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo material
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{isEdit ? `Editar ${material.code}` : 'Nuevo material'}</DialogTitle>
            <DialogDescription>
              {isEdit ? 'Los cambios no alteran los movimientos ya registrados.' : 'Lo que se guarda en los depósitos.'}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
              {isManaged && (
                <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  {material?.managedNotice}: el código, el nombre, la unidad y el tipo de control salen de ese catálogo.
                  Acá se pueden cambiar la categoría, el mínimo y la descripción.
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Código</FormLabel>
                      <FormControl>
                        <Input placeholder="ACE-15W40" readOnly={isManaged} {...field} />
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
                        <Input placeholder="Aceite 15W40" readOnly={isManaged} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="categoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Categoría</FormLabel>
                      <Select
                        value={field.value || NO_CATEGORY}
                        onValueChange={(v) => field.onChange(v === NO_CATEGORY ? '' : v)}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={NO_CATEGORY}>Sin categoría</SelectItem>
                          {lookups.categories.map((c) => (
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
                  name="unitId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unidad de medida</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange} disabled={material?.hasMovements || isManaged}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Elegí una unidad" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {lookups.units.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.name} ({u.abbreviation})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="trackingType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Control de stock</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange} disabled={material?.hasMovements || isManaged}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {MATERIAL_TRACKING_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {TRACKING_TYPE_LABELS[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {material?.hasMovements
                          ? 'No se puede cambiar: el material ya tiene movimientos.'
                          : 'Por serie: herramientas que se identifican de a una. Por lote: con vencimiento.'}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="minStock"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stock mínimo</FormLabel>
                      <FormControl>
                        <Input inputMode="decimal" placeholder="Opcional" className="tabular-nums" {...field} />
                      </FormControl>
                      <FormDescription>Suma de todos los depósitos.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción</FormLabel>
                    <FormControl>
                      <Textarea rows={2} placeholder="Opcional" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="requiresApproval"
                render={({ field }) => (
                  <FormItem className="flex items-start gap-3 space-y-0 rounded-md border p-3">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                    </FormControl>
                    <div className="space-y-1">
                      <FormLabel>Requiere aprobación</FormLabel>
                      <FormDescription>
                        Las salidas de este material van a necesitar un pedido aprobado (cuando se habiliten los pedidos).
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear material'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
