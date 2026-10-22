'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { NameFormDialog } from '@/shared/components/common/name-catalog/NameFormDialog';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useForm, type DefaultValues, type FieldValues, type Resolver, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import { ConfirmRemovalDialog } from '../../components/ConfirmRemovalDialog';
import type { RemovalMode } from '../../lib/catalog-rules';
import { WAREHOUSE_QUERY_KEYS } from '../../lib/query-keys';
import { CatalogRow } from './CatalogRow';

type CatalogItem = { id: string; name: string; is_active: boolean; materialCount: number };

interface MaterialCatalogSectionProps<Item extends CatalogItem, Values extends FieldValues & { name: string }> {
  title: string;
  description: string;
  /** Sustantivo en singular y minúscula, femenino ("categoría", "unidad"): arma los avisos. */
  noun: string;
  emptyMessage: string;
  removalDescription: string;
  items: Item[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  resolver: Resolver<Values, unknown, Values>;
  emptyValues: Values;
  toFormValues: (item: Item) => Values;
  itemTitle: (item: Item) => ReactNode;
  create: (values: Values) => Promise<ActionResult<unknown>>;
  update: (id: string, values: Values) => Promise<ActionResult<unknown>>;
  remove: (id: string) => Promise<ActionResult<{ mode: RemovalMode }>>;
  reactivate: (id: string) => Promise<ActionResult<unknown>>;
  /** Campos extra del formulario debajo del nombre. */
  renderExtraFields?: (form: UseFormReturn<Values, unknown, Values>) => ReactNode;
}

/**
 * Catálogo de Almacenes con alta, edición, baja (borra o desactiva según tenga materiales) y reactivación
 * (categorías de materiales y unidades de medida). Refresca la configuración y el catálogo tras cada cambio.
 */
export function MaterialCatalogSection<Item extends CatalogItem, Values extends FieldValues & { name: string }>({
  title,
  description,
  noun,
  emptyMessage,
  removalDescription,
  items,
  canCreate,
  canUpdate,
  canDelete,
  resolver,
  emptyValues,
  toFormValues,
  itemTitle,
  create,
  update,
  remove: removeItem,
  reactivate: reactivateItem,
  renderExtraFields,
}: MaterialCatalogSectionProps<Item, Values>) {
  const queryClient = useQueryClient();
  const label = `${noun.charAt(0).toUpperCase()}${noun.slice(1)}`;
  // `null` = cerrado, `'new'` = alta, un ítem = edicion.
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const [removing, setRemoving] = useState<Item | null>(null);

  const form = useForm<Values, unknown, Values>({ resolver, defaultValues: emptyValues as DefaultValues<Values> });

  const openForm = (target: Item | 'new') => {
    form.reset(target === 'new' ? emptyValues : toFormValues(target));
    setEditing(target);
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.settings });
    queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.materials });
  };

  const save = useMutation({
    mutationFn: async (values: Values) =>
      unwrapAction(editing && editing !== 'new' ? await update(editing.id, values) : await create(values)),
    onSuccess: (_data, values) => {
      toast.success(editing === 'new' ? `${label} ${values.name} creada` : `${label} ${values.name} actualizada`);
      setEditing(null);
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : `No se pudo guardar la ${noun}`),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => unwrapAction(await removeItem(id)),
    onSuccess: ({ mode }) => {
      toast.success(mode === 'delete' ? `${label} eliminada` : `${label} desactivada: tiene materiales asignados`);
      setRemoving(null);
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : `No se pudo dar de baja la ${noun}`),
  });

  const reactivate = useMutation({
    mutationFn: async (id: string) => unwrapAction(await reactivateItem(id)),
    onSuccess: () => {
      toast.success(`${label} reactivada`);
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : `No se pudo reactivar la ${noun}`),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {canCreate && (
          <Button type="button" size="sm" variant="outline" onClick={() => openForm('new')}>
            <Plus className="mr-1 h-4 w-4" />
            Agregar
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <ul className="divide-y">
            {items.map((item) => (
              <CatalogRow
                key={item.id}
                title={itemTitle(item)}
                materialCount={item.materialCount}
                isActive={item.is_active}
                canUpdate={canUpdate}
                canDelete={canDelete}
                busy={reactivate.isPending}
                onEdit={() => openForm(item)}
                onRemove={() => setRemoving(item)}
                onReactivate={() => reactivate.mutate(item.id)}
              />
            ))}
          </ul>
        )}
      </CardContent>

      <NameFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === 'new' ? `Nueva ${noun}` : `Editar ${noun}`}
        form={form}
        onSubmit={(values) => save.mutate(values)}
        pending={save.isPending}
      >
        {renderExtraFields?.(form)}
      </NameFormDialog>

      <ConfirmRemovalDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`¿Dar de baja "${removing?.name ?? ''}"?`}
        description={removalDescription}
        pending={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </Card>
  );
}
