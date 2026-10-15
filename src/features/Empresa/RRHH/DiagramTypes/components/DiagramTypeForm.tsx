'use client';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Logger } from '@/lib/logger';
import { useCatalogSheetBusy, useCatalogSheetClose } from '@/shared/components/common/CatalogFormSheet';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { createDiagramTypePrisma, updateDiagramTypePrisma } from '../actions.server';
import { useDiagramTypeStore } from '../store/diagramType.store';

// ============================================================================
// LOGGER
// ============================================================================

const logger = new Logger('DiagramTypeForm');

// ============================================================================
// SCHEMA
// ============================================================================

const DiagramTypeSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, { message: 'El nombre de la novedad no puede estar vacío' }),
  short_description: z
    .string()
    .min(1, { message: 'La descripción corta no puede estar vacía' })
    .max(3, { message: 'La descripción corta no debe tener más de 3 caracteres' }),
  color: z.string().min(1, { message: 'Por favor selecciona un color para la novedad' }),
  work_active: z.boolean().default(false),
  is_active: z.string().optional(),
  computes_absenteeism: z.boolean().default(false),
});

type DiagramTypeFormValues = z.infer<typeof DiagramTypeSchema>;

// ============================================================================
// COMPONENT
// ============================================================================

export default function DiagramTypeForm() {
  const editingDiagramType = useDiagramTypeStore((state) => state.diagramType);
  const setDiagramType = useDiagramTypeStore((state) => state.setDiagramType);
  const queryClient = useQueryClient();
  const closeSheet = useCatalogSheetClose();
  const setBusy = useCatalogSheetBusy();

  const isEditing = !!editingDiagramType;

  const form = useForm<DiagramTypeFormValues>({
    resolver: zodResolver(DiagramTypeSchema),
    defaultValues: {
      id: undefined,
      name: '',
      short_description: '',
      color: '#000000',
      work_active: false,
      is_active: 'true',
      computes_absenteeism: false,
    },
  });

  const watchWorkActive = form.watch('work_active');

  // Sincronizar form cuando cambia el item a editar
  // useEffect aquí es válido: sincronización con store externo (Zustand)
  // que puede cambiar desde fuera (click en botón "Editar" de la tabla)
  useEffect(() => {
    if (editingDiagramType) {
      form.reset({
        id: editingDiagramType.id,
        name: editingDiagramType.name || '',
        short_description: editingDiagramType.short_description || '',
        color: editingDiagramType.color || '#000000',
        work_active: editingDiagramType.work_active ?? false,
        is_active: editingDiagramType.is_active ? 'true' : 'false',
        computes_absenteeism: editingDiagramType.computes_absenteeism ?? false,
      });
    } else {
      form.reset({
        id: undefined,
        name: '',
        short_description: '',
        color: '#000000',
        work_active: false,
        is_active: 'true',
        computes_absenteeism: false,
      });
    }
  }, [editingDiagramType]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ──────────────────────────────────────────────────────────────

  const resetForm = () => {
    setDiagramType(null);
    form.reset({
      id: undefined,
      name: '',
      short_description: '',
      color: '#000000',
      work_active: false,
      is_active: 'true',
      computes_absenteeism: false,
    });
    closeSheet();
  };

  const invalidateTable = () => {
    queryClient.invalidateQueries({ queryKey: ['diagram-types'] });
  };

  // ── Submit ────────────────────────────────────────────────────────────────

  const onSubmit = async (values: DiagramTypeFormValues) => {
    const isActiveBoolean = values.is_active === 'true';
    const computesAbsenteeism = values.work_active ? false : values.computes_absenteeism ?? false;

    if (isEditing && editingDiagramType) {
      setBusy(true);
      toast.promise(
        updateDiagramTypePrisma({
          id: editingDiagramType.id,
          name: values.name,
          color: values.color,
          short_description: values.short_description,
          work_active: values.work_active,
          is_active: isActiveBoolean,
          computes_absenteeism: computesAbsenteeism,
        }),
        {
          loading: 'Actualizando novedad...',
          success: () => {
            invalidateTable();
            resetForm();
            return `Novedad ${values.name} editada con éxito`;
          },
          error: () => {
            setBusy(false);
            return 'No se pudo editar la novedad';
          },
        }
      );
    } else {
      setBusy(true);
      toast.promise(
        createDiagramTypePrisma({
          name: values.name,
          color: values.color,
          short_description: values.short_description,
          work_active: values.work_active,
          is_active: isActiveBoolean,
          computes_absenteeism: computesAbsenteeism,
        }),
        {
          loading: 'Creando novedad...',
          success: () => {
            invalidateTable();
            resetForm();
            return `Novedad ${values.name} cargada con éxito`;
          },
          error: () => {
            setBusy(false);
            return 'No se pudo crear la novedad';
          },
        }
      );
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre de la novedad</FormLabel>
              <FormControl>
                <Input type="text" {...field} className="w-full" placeholder="Ingresa un nombre para la novedad" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="short_description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descripción corta</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  {...field}
                  className="w-full"
                  placeholder="Máx. 3 caracteres, ej: TD"
                  maxLength={3}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex items-end gap-6">
          <FormField
            control={form.control}
            name="color"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Color</FormLabel>
                <FormControl>
                  <Input className="w-20 h-10 p-1 cursor-pointer" type="color" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-3">
            <FormField
              control={form.control}
              name="work_active"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center space-x-2">
                    <Switch id="work-active-switch" checked={field.value} onCheckedChange={field.onChange} />
                    <Label htmlFor="work-active-switch">Laboralmente Activo</Label>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="computes_absenteeism"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="computes-absenteeism-switch"
                      checked={!watchWorkActive ? field.value : false}
                      disabled={watchWorkActive}
                      onCheckedChange={(checked) => {
                        if (!watchWorkActive) {
                          field.onChange(checked);
                        }
                      }}
                    />
                    <Label
                      htmlFor="computes-absenteeism-switch"
                      className={watchWorkActive ? 'text-muted-foreground' : ''}
                    >
                      Computa para ausentismo
                    </Label>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <FormField
          control={form.control}
          name="is_active"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <FormLabel>Estado</FormLabel>
              <FormControl>
                <RadioGroup onValueChange={field.onChange} value={field.value ?? 'true'} className="flex space-x-4">
                  <FormItem className="flex items-center space-x-2 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="true" />
                    </FormControl>
                    <FormLabel className="font-normal">Activo</FormLabel>
                  </FormItem>
                  <FormItem className="flex items-center space-x-2 space-y-0">
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
          <Button type="submit" variant="brand" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? isEditing
                ? 'Actualizando...'
                : 'Creando...'
              : isEditing
                ? 'Actualizar'
                : 'Crear'}
          </Button>
          <Button type="button" onClick={resetForm} variant="outline">
            Cancelar
          </Button>
        </div>
      </form>
    </Form>
  );
}
