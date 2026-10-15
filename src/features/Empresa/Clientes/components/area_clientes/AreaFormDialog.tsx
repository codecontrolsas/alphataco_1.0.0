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
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Info, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  createArea,
  getAreaLinkedContracts,
  linkAreaToContracts,
  updateArea,
  type AreaRow,
} from '../../actions/areas.server';
import { getActiveContractsByCustomer } from '../../actions/services.server';
import { customerKey } from '../../lib/query-keys';
import { areaFormSchema, type AreaFormValues } from '../../schemas/area';

const logger = new Logger('features/Empresa/Clientes/AreaFormDialog');

export interface ProvinceOption {
  id: number;
  name: string;
}

interface AreaFormDialogProps {
  /**
   * Cliente dueño del área. Se INFIERE de la ficha: el usuario ya eligió el cliente al entrar.
   * Además es lo que acota los contratos vinculables, así que preguntarlo de nuevo sólo abre la
   * puerta a vincular el área a los contratos de otro cliente.
   */
  customerId: string;
  provinces: ProvinceOption[];
  /** `null` para un alta. */
  area?: AreaRow | null;
  triggerLabel: string;
  triggerVariant?: 'brand' | 'link';
}

function toFormValues(customerId: string, area: AreaRow | null): AreaFormValues {
  if (!area) {
    return { name: '', descripcion_corta: '', customer_id: customerId, province_id: [], contract_ids: [] };
  }
  return {
    name: area.nombre,
    descripcion_corta: area.descripcion_corta ?? '',
    customer_id: area.customers.id,
    province_id: area.area_province.map((prov) => prov.provinces.id),
    contract_ids: [],
  };
}

/**
 * Alta y edición de un área del cliente, en un diálogo.
 *
 * Mantiene el form único con secciones (área + vínculo opcional a contratos) en vez de encadenar
 * un segundo modal: un solo submit crea el área y la vincula.
 */
export function AreaFormDialog({
  customerId,
  provinces,
  area = null,
  triggerLabel,
  triggerVariant = 'brand',
}: AreaFormDialogProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const isEditing = !!area;

  const form = useForm<AreaFormValues>({
    resolver: zodResolver(areaFormSchema),
    defaultValues: toFormValues(customerId, area),
  });

  // Contratos activos del cliente de la ficha. `enabled: open` evita que cada fila de la tabla
  // dispare la consulta al renderizar su botón de editar.
  const contractsQuery = useQuery({
    queryKey: ['active-contracts-by-customer', customerId],
    queryFn: () => getActiveContractsByCustomer(customerId),
    enabled: open,
    staleTime: 2 * 60 * 1000,
  });

  // En edición: los contratos ya vinculados se filtran del selector.
  const linkedQuery = useQuery({
    queryKey: ['area-linked-contracts', area?.id ?? ''],
    queryFn: () => getAreaLinkedContracts(area?.id ?? ''),
    enabled: open && isEditing && !!area?.id,
    staleTime: 2 * 60 * 1000,
  });

  const availableContracts = useMemo(() => {
    const all = contractsQuery.data ?? [];
    const linked = new Set(linkedQuery.data ?? []);
    return all.filter((contract) => !linked.has(contract.id));
  }, [contractsQuery.data, linkedQuery.data]);

  const isLoadingContracts = contractsQuery.isLoading || (isEditing && linkedQuery.isLoading);
  const hasNoContracts = !isLoadingContracts && availableContracts.length === 0;

  const onSubmit = async (values: AreaFormValues) => {
    try {
      const response = isEditing ? await updateArea({ ...values, id: area.id }) : await createArea(values);

      if (!response.ok) {
        toast.error(response.error);
        return;
      }

      const contractIds = values.contract_ids ?? [];
      if (contractIds.length > 0) {
        const link = await linkAreaToContracts(response.data.areaId, contractIds);
        if (!link.ok) {
          toast.error(`Área guardada pero falló el vínculo: ${link.error}`);
        } else {
          toast.success(
            `${isEditing ? 'Área actualizada' : 'Área creada'} y vinculada a ${link.linked} contrato${link.linked === 1 ? '' : 's'}`
          );
        }
      } else {
        toast.success(isEditing ? 'Área actualizada correctamente' : 'Área creada correctamente');
      }

      queryClient.invalidateQueries({ queryKey: ['area-linked-contracts'] });
      // La ficha lee por React Query: la pestaña Áreas, los contratos (usan las áreas) y el resumen.
      queryClient.invalidateQueries({ queryKey: customerKey(customerId) });
      setOpen(false);
      if (!isEditing) form.reset(toFormValues(customerId, null));
    } catch (error) {
      logger.error('Error al guardar el área', { data: { error, areaId: area?.id } });
      toast.error('Error inesperado al procesar la solicitud');
    }
  };

  return (
    <PermissionGuard module="comercial" tab="areas-cliente" action={isEditing ? 'update' : 'create'}>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) form.reset(toFormValues(customerId, area));
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
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Editar área' : 'Nueva área'}</DialogTitle>
            <DialogDescription>Las áreas pertenecen a este cliente.</DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del área</FormLabel>
                    <FormControl>
                      <Input placeholder="Nombre del área" {...field} />
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

              <FormField
                control={form.control}
                name="province_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provincias</FormLabel>
                    <FormControl>
                      <MultiSelectCombobox
                        options={provinces.map((province) => ({ label: province.name, value: String(province.id) }))}
                        emptyMessage="No hay provincias disponibles"
                        selectedValues={field.value.map(String)}
                        onChange={(values) => field.onChange(values.map(Number))}
                        placeholder="Selecciona provincias"
                      />
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

              <Separator />

              <div className="space-y-2">
                <div>
                  <h3 className="text-foreground text-sm font-semibold">Vincular a contratos</h3>
                  <p className="text-muted-foreground text-xs">
                    Opcional — contratos activos de este cliente que querés vincular con el área.
                  </p>
                </div>

                {isLoadingContracts && (
                  <div className="space-y-2">
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                )}

                {hasNoContracts && (
                  <div className="text-muted-foreground flex items-start gap-2 rounded-md border border-dashed p-3 text-xs">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <p>Este cliente no tiene contratos activos disponibles para vincular.</p>
                  </div>
                )}

                {!isLoadingContracts && !hasNoContracts && (
                  <FormField
                    control={form.control}
                    name="contract_ids"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <MultiSelectCombobox
                            options={availableContracts.map((contract) => ({
                              label: `${contract.contract_number || 'Sin número'} — ${contract.service_name || 'Sin nombre'}`,
                              value: contract.id,
                            }))}
                            selectedValues={field.value ?? []}
                            onChange={field.onChange}
                            placeholder="Seleccionar contratos"
                            emptyMessage="Sin contratos"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              <DialogFooter>
                <Button type="submit" variant="brand" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isEditing ? 'Actualizar' : 'Crear'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </PermissionGuard>
  );
}
