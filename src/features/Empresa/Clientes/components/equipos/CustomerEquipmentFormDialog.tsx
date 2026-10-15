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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  createCustomerEquipment,
  updateCustomerEquipment,
  type CustomerEquipmentRow,
} from '../../actions/customer-equipment.server';
import { customerKey } from '../../lib/query-keys';
import {
  CUSTOMER_EQUIPMENT_TYPES,
  customerEquipmentFormSchema,
  type CustomerEquipmentFormValues,
} from '../../schemas/customer-equipment';

const logger = new Logger('features/Empresa/Clientes/CustomerEquipmentFormDialog');

interface CustomerEquipmentFormDialogProps {
  /** Cliente dueño del equipo. Se INFIERE de la ficha en la que está abierto el formulario. */
  customerId: string;
  /** `null` para un alta. */
  equipment?: CustomerEquipmentRow | null;
  triggerLabel: string;
  triggerVariant?: 'brand' | 'link';
}

function toFormValues(customerId: string, equipment: CustomerEquipmentRow | null): CustomerEquipmentFormValues {
  if (!equipment) return { name: '', customer_id: customerId, type: 'Perforador' };
  return { name: equipment.name, customer_id: equipment.customer_id, type: equipment.type };
}

/**
 * Alta y edición de un equipo DEL CLIENTE (`equipos_clientes`), en un diálogo.
 *
 * No confundir con los equipos de la empresa afectados al cliente (`contractor_equipment`), que
 * se administran en la pestaña "Equipos afectados": estos son los del cliente (su perforador, su
 * work over) y son los que después se eligen al cargar una línea del parte diario.
 */
export function CustomerEquipmentFormDialog({
  customerId,
  equipment = null,
  triggerLabel,
  triggerVariant = 'brand',
}: CustomerEquipmentFormDialogProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const isEditing = !!equipment;

  const form = useForm<CustomerEquipmentFormValues>({
    resolver: zodResolver(customerEquipmentFormSchema),
    defaultValues: toFormValues(customerId, equipment),
  });

  const onSubmit = async (values: CustomerEquipmentFormValues) => {
    try {
      const response = isEditing
        ? await updateCustomerEquipment({ ...values, id: equipment.id })
        : await createCustomerEquipment(values);

      if (!response.ok) {
        toast.error(response.error);
        return;
      }

      toast.success(isEditing ? 'Equipo actualizado correctamente' : 'Equipo creado correctamente');
      // La tabla de esta pestaña lee por React Query: `router.refresh()` solo refresca los
      // Server Components, así que sin invalidar el equipo se guarda y la tabla no lo muestra.
      queryClient.invalidateQueries({ queryKey: customerKey(customerId) });
      setOpen(false);
      if (!isEditing) form.reset(toFormValues(customerId, null));
    } catch (error) {
      // La action puede rechazar (no devolver `ok: false`): sin este catch el usuario no ve nada.
      logger.error('Error al guardar el equipo del cliente', { data: { error, equipmentId: equipment?.id } });
      toast.error('Error al guardar el equipo');
    }
  };

  return (
    <PermissionGuard module="comercial" tab="equipos-cliente" action={isEditing ? 'update' : 'create'}>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) form.reset(toFormValues(customerId, equipment));
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
            <DialogTitle>{isEditing ? 'Editar equipo' : 'Nuevo equipo del cliente'}</DialogTitle>
            <DialogDescription>Los equipos que este cliente aporta a la operación.</DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del equipo</FormLabel>
                    <FormControl>
                      <Input placeholder="Nombre del equipo" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de equipo</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un tipo de equipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CUSTOMER_EQUIPMENT_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
