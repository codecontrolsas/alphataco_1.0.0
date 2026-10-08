'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  createMaterialCategory,
  reactivateMaterialCategory,
  removeMaterialCategory,
  updateMaterialCategory,
  type WarehouseSettings,
} from '../../actions/catalog.server';
import { ConfirmRemovalDialog } from '../../components/ConfirmRemovalDialog';
import { WAREHOUSE_QUERY_KEYS } from '../../lib/query-keys';
import { unwrapAction } from '../../lib/unwrap-action';
import { materialCategoryFormSchema, type MaterialCategoryFormValues } from '../../schemas/catalog';
import { CatalogRow } from './CatalogRow';

type Category = WarehouseSettings['categories'][number];

interface CategoriesSectionProps {
  categories: Category[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export function CategoriesSection({ categories, canCreate, canUpdate, canDelete }: CategoriesSectionProps) {
  const queryClient = useQueryClient();
  // `null` = cerrado, `'new'` = alta, una categoria = edicion.
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [removing, setRemoving] = useState<Category | null>(null);

  const form = useForm<MaterialCategoryFormValues>({
    resolver: zodResolver(materialCategoryFormSchema),
    defaultValues: { name: '' },
  });

  const openForm = (target: Category | 'new') => {
    form.reset({ name: target === 'new' ? '' : target.name });
    setEditing(target);
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.settings });
    queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.materials });
  };

  const save = useMutation({
    mutationFn: async (values: MaterialCategoryFormValues) =>
      unwrapAction(
        editing && editing !== 'new'
          ? await updateMaterialCategory(editing.id, values)
          : await createMaterialCategory(values)
      ),
    onSuccess: (_data, values) => {
      toast.success(editing === 'new' ? `Categoría ${values.name} creada` : `Categoría ${values.name} actualizada`);
      setEditing(null);
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo guardar la categoría'),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => unwrapAction(await removeMaterialCategory(id)),
    onSuccess: ({ mode }) => {
      toast.success(mode === 'delete' ? 'Categoría eliminada' : 'Categoría desactivada: tiene materiales asignados');
      setRemoving(null);
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo dar de baja la categoría'),
  });

  const reactivate = useMutation({
    mutationFn: async (id: string) => unwrapAction(await reactivateMaterialCategory(id)),
    onSuccess: () => {
      toast.success('Categoría reactivada');
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo reactivar la categoría'),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>Categorías de materiales</CardTitle>
          <CardDescription>Agrupan el catálogo: Lubricantes, Herramientas, EPP…</CardDescription>
        </div>
        {canCreate && (
          <Button type="button" size="sm" variant="outline" onClick={() => openForm('new')}>
            <Plus className="mr-1 h-4 w-4" />
            Agregar
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {categories.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Todavía no hay categorías. Los materiales pueden cargarse sin categoría.
          </p>
        ) : (
          <ul className="divide-y">
            {categories.map((c) => (
              <CatalogRow
                key={c.id}
                title={c.name}
                materialCount={c.materialCount}
                isActive={c.is_active}
                canUpdate={canUpdate}
                canDelete={canDelete}
                busy={reactivate.isPending}
                onEdit={() => openForm(c)}
                onRemove={() => setRemoving(c)}
                onReactivate={() => reactivate.mutate(c.id)}
              />
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? 'Nueva categoría' : 'Editar categoría'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input autoFocus {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
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

      <ConfirmRemovalDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`¿Dar de baja "${removing?.name ?? ''}"?`}
        description="Si algún material la usa, se desactiva y deja de ofrecerse; si no, se elimina."
        pending={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </Card>
  );
}
