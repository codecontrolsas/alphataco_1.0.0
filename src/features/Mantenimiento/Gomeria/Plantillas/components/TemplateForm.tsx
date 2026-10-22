'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import type { DiagramAxle } from '@/features/Mantenimiento/Gomeria/shared/tire-diagram-utils';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import type { AxleInput, TemplateListItem } from '../actions/actions.server';
import { createTemplate, getTemplateById, updateTemplate } from '../actions/template-crud.server';
import { AxleConfigurator } from './AxleConfigurator';
import { TemplatePreview } from './TemplatePreview';

const logger = new Logger('TemplateForm');

// ============================================================================
// SCHEMA
// ============================================================================

const templateFormSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  description: z.string().optional(),
});

type TemplateFormValues = z.infer<typeof templateFormSchema>;

// ============================================================================
// PROPS
// ============================================================================

interface TemplateFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: TemplateListItem;
  queryKey: (string | boolean | undefined)[];
}

// ============================================================================
// COMPONENT
// ============================================================================

export function TemplateForm({ open, onOpenChange, template, queryKey }: TemplateFormProps) {
  const queryClient = useQueryClient();
  const isEditing = !!template;

  // ─── Axles state (managed separately from the zod form) ──────────────────
  const [axles, setAxles] = useState<AxleInput[]>([]);

  // ─── Load full template data for editing ─────────────────────────────────
  const { data: templateDetail } = useQuery({
    queryKey: ['tire-template-detail', template?.id],
    queryFn: () => getTemplateById(template!.id),
    enabled: open && isEditing && !!template?.id,
    staleTime: 0,
  });

  // ─── Form ─────────────────────────────────────────────────────────────────
  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  });

  // ─── Sync form + axles when templateDetail arrives (edit mode async load) ──
  useEffect(() => {
    if (templateDetail && isEditing) {
      form.reset({
        name: templateDetail.name,
        description: templateDetail.description ?? '',
      });
      setAxles(
        (templateDetail.axles ?? []).map((axle) => ({
          axle_number: axle.axle_number,
          tires_per_side: axle.tires_per_side,
          tire_size: axle.tire_size,
          is_drive_axle: axle.is_drive_axle,
          is_spare: axle.is_spare,
        }))
      );
    }
  }, [templateDetail]);

  // ─── Mutation ─────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: async (values: TemplateFormValues) => {
      if (isEditing && template) {
        return updateTemplate(template.id, {
          name: values.name,
          description: values.description || undefined,
          axles,
        });
      } else {
        return createTemplate({
          name: values.name,
          description: values.description || undefined,
          axles,
        });
      }
    },
    onSuccess: () => {
      toast.success(isEditing ? 'Plantilla actualizada correctamente' : 'Plantilla creada correctamente');
      queryClient.invalidateQueries({ queryKey });
      onOpenChange(false);
    },
    onError: (error) => {
      logger.error('Error saving template', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'Error al guardar la plantilla');
    },
  });

  // ─── Submit handler ───────────────────────────────────────────────────────
  function onSubmit(values: TemplateFormValues) {
    if (axles.length === 0) {
      toast.error('Debe configurar al menos un eje');
      return;
    }
    mutation.mutate(values);
  }

  // ─── Build preview axles ──────────────────────────────────────────────────
  const previewAxles: DiagramAxle[] = axles.map((axle, index) => ({
    id: `preview-${index}`,
    axle_number: axle.axle_number,
    tires_per_side: axle.tires_per_side,
    tire_size: axle.tire_size,
    is_drive_axle: axle.is_drive_axle,
    is_spare: axle.is_spare,
  }));

  // ─── Render ───────────────────────────────────────────────────────────────
  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen && !isEditing) {
      form.reset({ name: '', description: '' });
      setAxles([]);
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar plantilla' : 'Nueva plantilla'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* Basic info */}
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: Camión 6x4 estándar" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción (opcional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Descripción de la plantilla..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            {/* Axle configurator */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Configuración de ejes</h3>
              <AxleConfigurator value={axles} onChange={setAxles} />
              <p className="text-xs text-muted-foreground italic">
                Si no cargás la medida de un eje, se podrá configurar por vehículo en la tab Cubiertas del equipo.
              </p>
            </div>

            <Separator />

            {/* Template preview */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Vista previa</h3>
              <div className="rounded-md border bg-muted/30 p-4">
                <TemplatePreview axles={previewAxles} />
              </div>
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear plantilla'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
