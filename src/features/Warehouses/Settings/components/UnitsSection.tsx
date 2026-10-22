'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InputFormField } from '@/shared/components/common/form-fields';
import { NameFormDialog } from '@/shared/components/common/name-catalog/NameFormDialog';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  createMeasurementUnit,
  reactivateMeasurementUnit,
  removeMeasurementUnit,
  updateMeasurementUnit,
  type WarehouseSettings,
} from '../../actions/catalog.server';
import { ConfirmRemovalDialog } from '../../components/ConfirmRemovalDialog';
import { WAREHOUSE_QUERY_KEYS } from '../../lib/query-keys';
import { measurementUnitFormSchema, type MeasurementUnitFormValues } from '../../schemas/catalog';
import { CatalogRow } from './CatalogRow';

type Unit = WarehouseSettings['units'][number];

interface UnitsSectionProps {
  units: Unit[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export function UnitsSection({ units, canCreate, canUpdate, canDelete }: UnitsSectionProps) {
  const queryClient = useQueryClient();
  // `null` = cerrado, `'new'` = alta, una unidad = edicion.
  const [editing, setEditing] = useState<Unit | 'new' | null>(null);
  const [removing, setRemoving] = useState<Unit | null>(null);

  const form = useForm<MeasurementUnitFormValues>({
    resolver: zodResolver(measurementUnitFormSchema),
    defaultValues: { name: '', abbreviation: '' },
  });

  const openForm = (target: Unit | 'new') => {
    form.reset(
      target === 'new' ? { name: '', abbreviation: '' } : { name: target.name, abbreviation: target.abbreviation }
    );
    setEditing(target);
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.settings });
    queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.materials });
  };

  const save = useMutation({
    mutationFn: async (values: MeasurementUnitFormValues) =>
      unwrapAction(
        editing && editing !== 'new'
          ? await updateMeasurementUnit(editing.id, values)
          : await createMeasurementUnit(values)
      ),
    onSuccess: (_data, values) => {
      toast.success(editing === 'new' ? `Unidad ${values.name} creada` : `Unidad ${values.name} actualizada`);
      setEditing(null);
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo guardar la unidad'),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => unwrapAction(await removeMeasurementUnit(id)),
    onSuccess: ({ mode }) => {
      toast.success(mode === 'delete' ? 'Unidad eliminada' : 'Unidad desactivada: tiene materiales asignados');
      setRemoving(null);
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo dar de baja la unidad'),
  });

  const reactivate = useMutation({
    mutationFn: async (id: string) => unwrapAction(await reactivateMeasurementUnit(id)),
    onSuccess: () => {
      toast.success('Unidad reactivada');
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo reactivar la unidad'),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>Unidades de medida</CardTitle>
          <CardDescription>En qué se cuenta cada material: unidad, litro, kilogramo…</CardDescription>
        </div>
        {canCreate && (
          <Button type="button" size="sm" variant="outline" onClick={() => openForm('new')}>
            <Plus className="mr-1 h-4 w-4" />
            Agregar
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {units.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No hay unidades de medida. Agregá al menos una para poder cargar materiales.
          </p>
        ) : (
          <ul className="divide-y">
            {units.map((c) => (
              <CatalogRow
                key={c.id}
                title={`${c.name} (${c.abbreviation})`}
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

      <NameFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === 'new' ? 'Nueva unidad' : 'Editar unidad'}
        form={form}
        onSubmit={(values) => save.mutate(values)}
        pending={save.isPending}
      >
        <InputFormField control={form.control} name="abbreviation" label="Abreviatura" placeholder="l, kg, u" />
      </NameFormDialog>

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
