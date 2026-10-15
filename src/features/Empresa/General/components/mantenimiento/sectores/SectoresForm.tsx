'use client';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCatalogSheetBusy, useCatalogSheetClose } from '@/shared/components/common/CatalogFormSheet';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { createWorkshopSector, updateWorkshopSector } from '../../../actions/workshops.server';
import { useSectoresStore } from './store/sectores.store';

const SectoresSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, { message: 'Debe ingresar el nombre del sector' }),
  description: z.string().optional().nullable(),
  workshop_id: z.string().min(1, { message: 'Debe seleccionar un taller' }),
  is_active: z.boolean().optional(),
  max_capacity: z.number().int().min(1, { message: 'El cupo debe ser al menos 1' }).optional().nullable(),
});

type SectoresFormValues = z.infer<typeof SectoresSchema>;

interface SectoresFormProps {
  internalWorkshops: Promise<{ id: string; name: string }[]>;
}

function SectoresForm({ internalWorkshops }: SectoresFormProps) {
  const workshops = use(internalWorkshops);
  const editingSector = useSectoresStore((state) => state.sector);
  const setSector = useSectoresStore((state) => state.setSector);
  const router = useRouter();
  const closeSheet = useCatalogSheetClose();
  const setBusy = useCatalogSheetBusy();

  const [isEditing, setIsEditing] = useState(!!editingSector);

  const form = useForm<SectoresFormValues>({
    resolver: zodResolver(SectoresSchema),
    defaultValues: {
      name: '',
      description: '',
      workshop_id: '',
      is_active: true,
      max_capacity: null,
    },
  });

  const { reset } = form;

  // Populate form when editing
  useEffect(() => {
    if (editingSector) {
      reset({
        id: editingSector.id,
        name: editingSector.name,
        description: editingSector.description || '',
        workshop_id: editingSector.workshop_id,
        is_active: editingSector.is_active ?? true,
        max_capacity: editingSector.max_capacity ?? null,
      });
      setIsEditing(true);
    } else {
      resetValues();
    }
  }, [editingSector, reset]);

  const onSubmit = async (values: SectoresFormValues) => {
    setBusy(true);
    await toast
      .promise(
        async () => {
          const result = await createWorkshopSector({
            name: values.name,
            description: values.description || null,
            workshop_id: values.workshop_id,
            is_active: values.is_active!,
            max_capacity: values.max_capacity || null,
          });
          // El motivo viaja como dato y se relanza aca, ya en el cliente: un Error
          // lanzado dentro de la server action pierde su mensaje en produccion.
          if (!result.ok) throw new Error(result.error);
        },
        {
          loading: 'Creando sector...',
          success: () => {
            resetForm();
            router.refresh();
            return 'Sector creado correctamente';
          },
          error: (error) => {
            setBusy(false);
            // El mensaje del servidor (ej: sector duplicado) tiene que llegar al usuario
            return error instanceof Error ? error.message : 'Error al crear el sector';
          },
        }
      )
      .unwrap()
      .catch(() => {
        // el error ya se informa en el toast
      });
  };

  const onUpdate = async (values: SectoresFormValues) => {
    setBusy(true);
    await toast
      .promise(
        async () => {
          await updateWorkshopSector({
            id: values.id!,
            name: values.name,
            description: values.description || null,
            workshop_id: values.workshop_id,
            is_active: values.is_active!,
            max_capacity: values.max_capacity || null,
          });
        },
        {
          loading: 'Actualizando sector...',
          success: () => {
            resetForm();
            router.refresh();
            return 'Sector actualizado correctamente';
          },
          error: () => {
            setBusy(false);
            return 'Error al actualizar el sector';
          },
        }
      )
      .unwrap()
      .catch(() => {
        // el error ya se informa en el toast
      });
  };

  const handleSubmit = (values: SectoresFormValues) => {
    if (isEditing) {
      onUpdate(values);
    } else {
      onSubmit(values);
    }
  };

  const resetValues = () => {
    reset({
      id: '',
      name: '',
      description: '',
      workshop_id: '',
      is_active: true,
      max_capacity: null,
    });
    setIsEditing(false);
    setSector(null);
  };

  // Éxito / cancelar: limpia el form y cierra el Sheet (antes del router.refresh()).
  const resetForm = () => {
    resetValues();
    closeSheet();
  };

  const handleCancel = () => {
    resetForm();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        {/* Taller */}
        <FormField
          control={form.control}
          name="workshop_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Taller *</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar taller" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {workshops.map((workshop) => (
                    <SelectItem key={workshop.id} value={workshop.id}>
                      {workshop.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Nombre */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre del Sector *</FormLabel>
              <FormControl>
                <Input type="text" {...field} className="input w-full" placeholder="Nombre del sector" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Descripcion */}
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descripcion</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  value={field.value || ''}
                  className="w-full min-h-[100px]"
                  placeholder="Descripcion del sector (opcional)"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Cupo Máximo */}
        <FormField
          control={form.control}
          name="max_capacity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cupo Máximo (opcional)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  {...field}
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                  className="input w-full"
                  placeholder="Cantidad máxima de equipos"
                  min={1}
                />
              </FormControl>
              <FormMessage />
              <p className="text-xs text-muted-foreground">
                Cantidad máxima de equipos/dominios que puede atender el sector simultáneamente
              </p>
            </FormItem>
          )}
        />

        {/* Estado Activo */}
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
                  className="flex flex-wrap gap-4"
                >
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

        {/* Botones */}
        <div className="flex gap-2 mt-6">
          <Button type="submit" variant="brand" disabled={form.formState.isSubmitting}>
            {isEditing ? 'Actualizar' : 'Crear'}
          </Button>
          <Button type="button" onClick={handleCancel} variant="outline">
            Cancelar
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default SectoresForm;
