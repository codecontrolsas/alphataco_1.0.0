'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { createSector, updateSector, type SectorRow } from '../../actions/sectors.server';
import { customerKey } from '../../lib/query-keys';
import { sectorFormSchema, type SectorFormValues } from '../../schemas/sector';

const logger = new Logger('features/Empresa/Clientes/SectorFormDialog');

interface SectorFormDialogProps {
  /**
   * Cliente dueño del sector. Se INFIERE de la ficha en la que está abierto el formulario: el
   * usuario ya eligió el cliente al entrar, volver a preguntárselo con un combo de un solo item
   * es ruido y deja abierta la posibilidad de equivocarlo.
   */
  customerId: string;
  /** `null` para un alta. */
  sector?: SectorRow | null;
  triggerLabel: string;
  triggerVariant?: 'brand' | 'link';
}

function toFormValues(customerId: string, sector: SectorRow | null): SectorFormValues {
  if (!sector) return { name: '', descripcion_corta: '', customer_id: customerId };
  return {
    name: sector.sectors.name,
    descripcion_corta: sector.sectors.descripcion_corta ?? '',
    customer_id: sector.customer_id,
  };
}

/** Alta y edición de un sector del cliente, en un diálogo. */
export function SectorFormDialog({
  customerId,
  sector = null,
  triggerLabel,
  triggerVariant = 'brand',
}: SectorFormDialogProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const isEditing = !!sector;

  const form = useForm<SectorFormValues>({
    resolver: zodResolver(sectorFormSchema),
    defaultValues: toFormValues(customerId, sector),
  });

  const onSubmit = async (values: SectorFormValues) => {
    try {
      const response = isEditing ? await updateSector({ ...values, id: sector.sector_id }) : await createSector(values);

      if (!response.ok) {
        toast.error(response.error);
        return;
      }

      toast.success(isEditing ? 'Sector actualizado correctamente' : 'Sector creado correctamente');
      queryClient.invalidateQueries({ queryKey: ['preparte-sectors'] });
      queryClient.invalidateQueries({ queryKey: ['preparte-contratos'] });
      // La ficha lee por React Query: la pestaña Sectores y los contratos (usan los sectores).
      queryClient.invalidateQueries({ queryKey: customerKey(customerId) });
      setOpen(false);
      if (!isEditing) form.reset(toFormValues(customerId, null));
    } catch (error) {
      // La action puede rechazar (no devolver `ok: false`): sin este catch el usuario no ve nada.
      logger.error('Error al guardar el sector', { data: { error, sectorId: sector?.sector_id } });
      toast.error('Error al guardar el sector');
    }
  };

  return (
    <PermissionGuard module="comercial" tab="sectores-cliente" action={isEditing ? 'update' : 'create'}>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          // Reabrir con lo que quedó a medias de la vez anterior confunde: se descarta.
          if (!next) form.reset(toFormValues(customerId, sector));
        }}
      >
        <DialogTrigger asChild>
          <Button
            type="button"
            variant={triggerVariant}
            size={triggerVariant === 'link' ? 'sm' : 'default'}
            className={triggerVariant === 'link' ? 'hover:text-blue-400' : undefined}
          >
            {triggerLabel}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Editar sector' : 'Nuevo sector'}</DialogTitle>
            <DialogDescription>Los sectores pertenecen a este cliente.</DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del sector</FormLabel>
                    <FormControl>
                      <Input placeholder="Nombre del sector" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="descripcion_corta"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción corta</FormLabel>
                    <FormControl>
                      <Input placeholder="Descripción breve" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* `customer_id` no tiene control visible: lo fija la ficha. El FormField existe
                  igual para que un id rechazado por el schema se VEA — sin esto el submit no
                  haría nada y el usuario no sabría por qué. */}
              <FormField
                control={form.control}
                name="customer_id"
                render={() => (
                  <FormItem>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="submit" variant="brand" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </PermissionGuard>
  );
}
