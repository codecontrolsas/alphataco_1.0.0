'use client';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useCatalogSheetBusy, useCatalogSheetClose } from '@/shared/components/common/CatalogFormSheet';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  createAptitudTecnicaPrisma,
  getAptitudePositionIds,
  updateAptitudTecnicaPrisma,
  type CompanyPositionOption,
} from './actions.server';
import { useAptitudesStore } from './store/aptitudes.store';

// ============================================================================
// SCHEMA
// ============================================================================

const AptitudSchema = z.object({
  id: z.string().optional(),
  nombre: z.string().min(2, { message: 'El nombre debe tener al menos 2 caracteres.' }),
  is_active: z.boolean().default(true),
});

type AptitudFormValues = z.infer<typeof AptitudSchema>;

// ============================================================================
// PROPS
// ============================================================================

interface AptitudesFormProps {
  positions: CompanyPositionOption[];
  queryKey: readonly string[];
}

// ============================================================================
// COMPONENT
// ============================================================================

export function AptitudesForm({ positions, queryKey }: AptitudesFormProps) {
  const editingAptitud = useAptitudesStore((state) => state.aptitud);
  const setAptitud = useAptitudesStore((state) => state.setAptitud);
  const queryClient = useQueryClient();
  const closeSheet = useCatalogSheetClose();
  const setBusy = useCatalogSheetBusy();

  const isEditing = !!editingAptitud;

  const form = useForm<AptitudFormValues>({
    resolver: zodResolver(AptitudSchema),
    defaultValues: {
      nombre: '',
      is_active: true,
    },
  });

  // ── Puestos (M:M): baseline leído del servidor al abrir el form ─────────────
  // La selección es `null` hasta que el usuario toca el combo; mientras tanto se muestra el baseline.
  const [positionSelection, setPositionSelection] = useState<string[] | null>(null);
  const baselineQuery = useQuery({
    queryKey: ['aptitude-position-ids', editingAptitud?.id],
    queryFn: () => getAptitudePositionIds(editingAptitud!.id),
    enabled: isEditing,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const baseline = useMemo(() => (isEditing ? baselineQuery.data ?? null : []), [isEditing, baselineQuery.data]);
  const baselineReady = baseline !== null;
  const selectedPositions = positionSelection ?? baseline ?? [];
  const positionDelta = useMemo(() => {
    const base = baseline ?? [];
    return {
      add: selectedPositions.filter((id) => !base.includes(id)),
      remove: base.filter((id) => !selectedPositions.includes(id)),
    };
  }, [baseline, selectedPositions]);

  // Sincronizar form cuando cambia el item a editar (store externo — useEffect válido)
  useEffect(() => {
    if (editingAptitud) {
      form.reset({
        id: editingAptitud.id,
        nombre: editingAptitud.nombre,
        is_active: editingAptitud.is_active ?? true,
      });
    } else {
      form.reset({ id: undefined, nombre: '', is_active: true });
    }
    setPositionSelection(null);
  }, [editingAptitud]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ────────────────────────────────────────────────────────────────

  const resetForm = () => {
    setAptitud(null);
    form.reset({ id: undefined, nombre: '', is_active: true });
    setPositionSelection(null);
    closeSheet();
  };

  const invalidateTable = () => {
    queryClient.invalidateQueries({ queryKey: [...queryKey] });
  };

  // ── Submit handlers ────────────────────────────────────────────────────────

  const handleCreate = async (values: AptitudFormValues) => {
    setBusy(true);
    toast.promise(
      createAptitudTecnicaPrisma({
        nombre: values.nombre,
        puestos: selectedPositions,
        is_active: values.is_active,
      }),
      {
        loading: 'Creando aptitud técnica...',
        success: () => {
          invalidateTable();
          resetForm();
          return 'Aptitud técnica creada correctamente';
        },
        error: () => {
          setBusy(false);
          return 'Error al crear la aptitud técnica';
        },
      }
    );
  };

  const handleUpdate = async (values: AptitudFormValues) => {
    if (!values.id) return;
    setBusy(true);
    toast.promise(
      updateAptitudTecnicaPrisma({
        id: values.id,
        nombre: values.nombre,
        puestos: positionDelta,
        is_active: values.is_active,
      }),
      {
        loading: 'Actualizando aptitud técnica...',
        success: (result) => {
          invalidateTable();
          resetForm();
          return `Aptitud técnica actualizada. Puestos: ${result.added} agregados, ${result.removed} quitados.`;
        },
        error: () => {
          setBusy(false);
          return 'Error al actualizar la aptitud técnica';
        },
      }
    );
  };

  const handleSubmit = (values: AptitudFormValues) => {
    if (isEditing) {
      if (!baselineReady) return;
      handleUpdate(values);
    } else {
      handleCreate(values);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="nombre"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  {...field}
                  className="input w-full"
                  placeholder="Nombre de la aptitud"
                  disabled={form.formState.isSubmitting}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-2">
          <Label>Puestos</Label>
          <MultiSelectCombobox
            options={positions.map((p) => ({
              label: p.name ?? '',
              value: p.id,
            }))}
            selectedValues={selectedPositions}
            onChange={setPositionSelection}
            placeholder={baselineReady ? 'Selecciona los puestos...' : 'Cargando puestos de la aptitud...'}
            emptyMessage="No se encontraron puestos"
            disabled={!baselineReady}
          />
          <p className="text-sm text-muted-foreground">Selecciona los puestos que requieren esta aptitud</p>
          {baselineQuery.isError && (
            <p role="alert" className="text-sm text-danger">
              No se pudieron cargar los puestos actuales de la aptitud; no se puede guardar.
            </p>
          )}
          {isEditing && baselineReady && (
            <p role="status" className="text-sm text-muted-foreground tabular-nums">
              {baseline?.length ?? 0} {(baseline?.length ?? 0) === 1 ? 'puesto actual' : 'puestos actuales'}. Se agregan{' '}
              {positionDelta.add.length}.{' '}
              <span className={positionDelta.remove.length > 0 ? 'text-danger' : undefined}>
                Se quitan {positionDelta.remove.length}.
              </span>
            </p>
          )}
        </div>

        <FormField
          control={form.control}
          name="is_active"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <FormLabel>Estado</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={(value) => field.onChange(value === 'true')}
                  value={field.value ? 'true' : 'false'}
                  className="flex space-x-1"
                >
                  <FormItem className="flex items-center space-x-3 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="true" />
                    </FormControl>
                    <FormLabel className="font-normal">Activo</FormLabel>
                  </FormItem>
                  <FormItem className="flex items-center space-x-3 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="false" />
                    </FormControl>
                    <FormLabel className="font-normal">Inactivo</FormLabel>
                  </FormItem>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2 mt-6">
          <Button type="submit" variant="brand" disabled={form.formState.isSubmitting || (isEditing && !baselineReady)}>
            {form.formState.isSubmitting
              ? isEditing
                ? 'Actualizando...'
                : 'Creando...'
              : isEditing
                ? 'Actualizar'
                : 'Crear'}
          </Button>
          <Button type="button" onClick={resetForm} variant="outline" disabled={form.formState.isSubmitting}>
            Cancelar
          </Button>
        </div>
      </form>
    </Form>
  );
}
