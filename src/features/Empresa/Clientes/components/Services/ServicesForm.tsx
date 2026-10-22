'use client';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { Logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Calendar as CalendarIcon } from 'lucide-react';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { AreaRow } from '../../actions/areas.server';
import type { SectorRow } from '../../actions/sectors.server';
import { createCustomerService, updateCustomerService, type CustomerServiceRow } from '../../actions/services.server';
import type { CustomerRef } from '../../lib/serializers';
import { dbDateToLocal, localDateToDb } from '../../lib/service-dates';
import { serviceFormSchema, type ServiceFormValues } from '../../schemas/service';

const logger = new Logger('features/Empresa/Clientes/ServicesForm');

interface ServicesFormProps {
  customers: CustomerRef[];
  areas: AreaRow[];
  sectors: SectorRow[];
  editingService?: CustomerServiceRow | null;
  /** En el detalle de un contrato el form arranca en solo lectura. */
  startReadOnly?: boolean;
  setOpen?: (open: boolean) => void;
}

function toFormValues(service: CustomerServiceRow | null | undefined): ServiceFormValues {
  if (!service) {
    return {
      customer_id: '',
      area_id: [],
      sector_id: [],
      service_name: '',
      contract_number: '',
      service_start: new Date(),
      service_validity: new Date(),
      is_active: true,
    };
  }
  return {
    customer_id: service.customer_id ?? '',
    area_id: service.service_areas.map((a) => a.area_id),
    sector_id: service.service_sectors.map((s) => s.sector_id),
    service_name: service.service_name ?? '',
    contract_number: service.contract_number ?? '',
    service_start: service.service_start ? dbDateToLocal(service.service_start) : new Date(),
    service_validity: service.service_validity ? dbDateToLocal(service.service_validity) : new Date(),
    is_active: service.is_active ?? true,
  };
}

export default function ServicesForm({
  customers,
  areas,
  sectors,
  editingService,
  startReadOnly = false,
  setOpen,
}: ServicesFormProps) {
  const isEditing = !!editingService;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [readOnly, setReadOnly] = useState(startReadOnly);

  const form = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: toFormValues(editingService),
    mode: 'onChange',
  });

  const customerId = form.watch('customer_id');

  const areaOptions = useMemo(
    () =>
      areas.filter((area) => area.customers.id === customerId).map((area) => ({ label: area.nombre, value: area.id })),
    [areas, customerId]
  );

  const sectorOptions = useMemo(
    () =>
      sectors
        .filter((sector) => sector.customer_id === customerId)
        .map((sector) => ({ label: sector.sectors.name, value: sector.sectors.id })),
    [sectors, customerId]
  );

  const resetForm = () => {
    form.reset(toFormValues(null));
  };

  const handleCancel = () => {
    resetForm();
    setOpen?.(false);
  };

  const onSubmit = async (values: ServiceFormValues) => {
    const payload: ServiceFormValues = {
      ...values,
      contract_number: values.contract_number || '',
      service_start: localDateToDb(values.service_start),
      service_validity: localDateToDb(values.service_validity),
    };

    try {
      const result = isEditing
        ? await updateCustomerService(editingService.id, payload)
        : await createCustomerService(payload);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(isEditing ? 'Contrato actualizado correctamente' : 'Contrato creado correctamente');
      queryClient.invalidateQueries({ queryKey: ['customer-services'] });
      // La pestaña Contratos de la ficha del cliente lee por React Query (['comercial', 'customer', id, 'contracts']).
      queryClient.invalidateQueries({ queryKey: ['comercial', 'customer'] });
      if (!isEditing) resetForm();
      setOpen?.(false);
      router.refresh();
    } catch (error) {
      // La action puede rechazar (no devolver `ok: false`): sin este catch el usuario no ve nada.
      logger.error('Error al guardar el contrato', { data: { error } });
      toast.error('Error al guardar el contrato');
    }
  };

  return (
    <div>
      {isEditing && (
        <div className="flex justify-end space-x-4 mr-2">
          <PermissionGuard module="comercial" tab="detalle-contrato" action="update">
            <Button type="button" onClick={() => setReadOnly((prev) => !prev)}>
              {readOnly ? 'Habilitar Edicion' : 'Ver'}
            </Button>
          </PermissionGuard>
        </div>
      )}
      <Card className="w-full mt-2 overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 w-full min-w-0">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="contents w-full">
              <FormField
                control={form.control}
                name="customer_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cliente</FormLabel>
                    <Select
                      disabled={readOnly}
                      onValueChange={(value) => {
                        field.onChange(value);
                        form.setValue('area_id', []);
                        form.setValue('sector_id', []);
                      }}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Elegir cliente" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {customers.map((customer) => (
                          <SelectItem value={customer.id} key={customer.id}>
                            {customer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="area_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Area</FormLabel>
                    <MultiSelectCombobox
                      options={areaOptions}
                      placeholder="Elegir areas"
                      emptyMessage="No se encontraron areas"
                      selectedValues={field.value}
                      onChange={field.onChange}
                      disabled={readOnly}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sector_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sectores</FormLabel>
                    <MultiSelectCombobox
                      options={sectorOptions}
                      placeholder="Seleccionar sectores"
                      emptyMessage="No se encontraron sectores"
                      selectedValues={field.value}
                      onChange={field.onChange}
                      disabled={readOnly}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="service_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título del Contrato</FormLabel>
                    <FormControl>
                      <Input disabled={readOnly} type="text" {...field} placeholder="Título del contrato" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {(['service_start', 'service_validity'] as const).map((name) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex gap-4 items-center w-full justify-between">
                        <FormLabel>
                          {name === 'service_start' ? 'Inicio del Contrato' : 'Validez del Contrato'}
                        </FormLabel>
                        <FormControl>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                disabled={readOnly}
                                variant="outline"
                                className={cn(
                                  'w-[240px] pl-3 text-left font-normal',
                                  !field.value && 'text-muted-foreground'
                                )}
                              >
                                {field.value ? moment(field.value).format('DD/MM/YYYY') : 'Elegir fecha'}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={(date) => date && field.onChange(date)}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
              <FormField
                control={form.control}
                name="contract_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número de Contrato</FormLabel>
                    <FormControl>
                      <Input disabled={readOnly} type="text" {...field} placeholder="Número de contrato" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel>Activo</FormLabel>
                    <FormControl>
                      <RadioGroup
                        disabled={readOnly}
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
              <PermissionGuard module="comercial" tab="detalle-contrato" action="update">
                <Button
                  disabled={readOnly || form.formState.isSubmitting}
                  className="mt-4"
                  type="submit"
                  variant="brand"
                >
                  {isEditing ? 'Editar' : 'Crear'}
                </Button>
              </PermissionGuard>
              <Button disabled={readOnly} className="mt-4 ml-2" type="button" onClick={handleCancel} variant="outline">
                Cancelar
              </Button>
            </form>
          </Form>
        </div>
      </Card>
    </div>
  );
}
