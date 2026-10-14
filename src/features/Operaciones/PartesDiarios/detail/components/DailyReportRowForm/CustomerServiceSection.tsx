'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useMemo } from 'react';
import { UseFormReturn } from 'react-hook-form';
import type { CustomerForForm } from '../../form-data.server';
import type { DailyReportRowFormValues } from './schema';

interface CustomerServiceSectionProps {
  form: UseFormReturn<DailyReportRowFormValues>;
  customers: CustomerForForm[];
  isEditMode?: boolean;
  disabled?: boolean;
}

export function CustomerServiceSection({
  form,
  customers,
  isEditMode = false,
  disabled = false,
}: CustomerServiceSectionProps) {
  const selectedCustomerId = form.watch('customer');
  const selectedServiceId = form.watch('services');
  const selectedItemId = form.watch('item');

  const activeCustomers = useMemo(() => customers.filter((c) => c.is_active), [customers]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId]
  );

  // Filtered active services for selected customer
  const customerServices = useMemo(() => {
    if (!selectedCustomer?.customer_services?.length) return [];
    return selectedCustomer.customer_services.filter(
      (service) => service.is_active && (!service.service_validity || new Date(service.service_validity) >= new Date())
    );
  }, [selectedCustomer]);

  // Items for selected service
  const serviceItems = useMemo(() => {
    if (!selectedServiceId || !selectedCustomer?.customer_services?.length) return [];
    const service = selectedCustomer.customer_services.find((s) => s.id === selectedServiceId);
    return service?.service_items?.filter((item) => item.is_active) ?? [];
  }, [selectedCustomer, selectedServiceId]);

  // Sectors for selected service
  const customerSectors = useMemo(() => {
    if (!selectedServiceId || !selectedCustomer?.customer_services?.length) return [];
    const serviceSectors = selectedCustomer.customer_services
      .flatMap((svc) => svc.service_sectors ?? [])
      .filter((s) => s.sectors && s.service_id === selectedServiceId);

    const seen = new Set<string>();
    return serviceSectors
      .filter((s) => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      })
      .map((s) => ({
        id: s.id,
        name: s.sectors?.name ?? '',
        description: s.sectors?.descripcion_corta ?? '',
      }));
  }, [selectedCustomer, selectedServiceId]);

  // Areas for selected service
  const customerAreas = useMemo(() => {
    if (!selectedServiceId || !selectedCustomer?.customer_services?.length) return [];
    const serviceAreas = selectedCustomer.customer_services
      .flatMap((svc) => svc.service_areas ?? [])
      .filter((a) => a.areas_cliente && a.service_id === selectedServiceId);

    const seen = new Set<string>();
    return serviceAreas
      .filter((a) => {
        if (seen.has(a.id)) return false;
        seen.add(a.id);
        return true;
      })
      .map((a) => ({
        id: a.id,
        name: a.areas_cliente?.nombre ?? '',
        description: a.areas_cliente?.descripcion_corta ?? '',
      }));
  }, [selectedCustomer, selectedServiceId]);

  // Customer equipment
  const customerEquipment = useMemo(() => selectedCustomer?.equipos_clientes ?? [], [selectedCustomer]);

  const handleCustomerChange = (customerId: string) => {
    form.setValue('customer', customerId);
    form.setValue('services', '');
    form.setValue('item', '');
    form.setValue('sector_service_id', undefined);
    form.setValue('areas_service_id', undefined);
    form.setValue('equipos_cliente', []);
  };

  const handleServiceChange = (serviceId: string) => {
    form.setValue('services', serviceId);
    form.setValue('item', '');
    form.setValue('sector_service_id', undefined);
    form.setValue('areas_service_id', undefined);
  };

  const isServiceDisabled = !selectedCustomerId;
  const isItemDisabled = !selectedServiceId;
  const isSectorDisabled = customerSectors.length === 0;
  const isAreaDisabled = customerAreas.length === 0;

  return (
    <div className="w-full space-y-4">
      <div className="grid w-full grid-cols-1 gap-4">
        {/* Cliente */}
        <FormField
          control={form.control}
          name="customer"
          render={({ field }) => (
            <FormItem className="flex flex-col w-full">
              <FormLabel>Cliente</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant="outline"
                      role="combobox"
                      disabled={disabled || isEditMode}
                      className={cn('w-full justify-between', !field.value && 'text-muted-foreground')}
                      data-testid="customer-select-button"
                    >
                      {field.value ? customers.find((c) => c.id === field.value)?.name : 'Seleccionar cliente'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent align="start" className="max-w-[400px] p-0">
                  <Command>
                    <CommandInput placeholder="Buscar cliente..." className="h-9" />
                    <CommandList>
                      <CommandEmpty>No se encontraron clientes.</CommandEmpty>
                      <div className="px-3 py-1.5 text-xs text-muted-foreground">
                        Nota: Los clientes dados de baja no se muestran en la lista.
                      </div>
                      <CommandGroup heading="Clientes activos">
                        {activeCustomers.map((customer) => (
                          <CommandItem
                            value={customer.name}
                            key={customer.id}
                            data-testid={`customer-option-${customer.id}`}
                            onSelect={() => handleCustomerChange(customer.id)}
                          >
                            {customer.name}
                            <Check
                              className={cn(
                                'ml-auto h-4 w-4',
                                customer.id === field.value ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Servicio */}
        <FormField
          control={form.control}
          name="services"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Servicio</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant="outline"
                      role="combobox"
                      disabled={isServiceDisabled || disabled}
                      className={cn(
                        'w-full justify-between',
                        !field.value && 'text-muted-foreground',
                        isServiceDisabled && 'opacity-50 cursor-not-allowed'
                      )}
                      data-testid="service-select-button"
                    >
                      {field.value
                        ? customerServices.find((s) => s.id === field.value)?.service_name
                        : selectedCustomerId
                          ? 'Seleccionar servicio'
                          : 'Seleccione un cliente primero'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent align="start" className="max-w-[400px] p-0">
                  <Command>
                    <CommandInput placeholder="Buscar servicio..." className="h-9" disabled={isServiceDisabled} />
                    <CommandList>
                      <CommandEmpty>
                        {!selectedCustomerId
                          ? 'Seleccione un cliente primero.'
                          : customerServices.length === 0
                            ? 'No hay servicios activos para este cliente.'
                            : 'No se encontraron servicios que coincidan.'}
                      </CommandEmpty>
                      {selectedCustomerId && (
                        <div className="px-3 py-1.5 text-xs text-muted-foreground">
                          Nota: Los servicios vencidos o de baja no se muestran en la lista.
                        </div>
                      )}
                      {selectedCustomerId && customerServices.length > 0 && (
                        <CommandGroup>
                          {customerServices.map((service) => (
                            <CommandItem
                              value={service.service_name ?? ''}
                              key={service.id}
                              data-testid={`service-option-${service.id}`}
                              onSelect={() => handleServiceChange(service.id)}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span>{service.service_name}</span>
                              </div>
                              <Check
                                className={cn(
                                  'ml-auto h-4 w-4',
                                  service.id === field.value ? 'opacity-100' : 'opacity-0'
                                )}
                              />
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Ítem */}
        <FormField
          control={form.control}
          name="item"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Ítem</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant="outline"
                      role="combobox"
                      disabled={isItemDisabled || disabled}
                      className={cn(
                        'w-full justify-between',
                        !field.value && 'text-muted-foreground',
                        isItemDisabled && 'opacity-50 cursor-not-allowed'
                      )}
                      data-testid="item-select-button"
                    >
                      {field.value
                        ? serviceItems.find((i) => i.id === field.value)?.item_name ?? 'Ítem no encontrado'
                        : selectedServiceId
                          ? 'Seleccionar ítem'
                          : 'Seleccione un servicio primero'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-full p-0">
                  <Command>
                    <CommandInput
                      placeholder={isItemDisabled ? 'Seleccione un servicio primero' : 'Buscar ítem...'}
                      className="h-9"
                      disabled={isItemDisabled}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {!selectedServiceId
                          ? 'Seleccione un servicio primero.'
                          : serviceItems.length === 0
                            ? 'No hay ítems disponibles para este servicio.'
                            : 'No se encontraron ítems que coincidan.'}
                      </CommandEmpty>
                      {selectedServiceId && serviceItems.length > 0 && (
                        <CommandGroup>
                          {serviceItems.map((item) => {
                            const isSelected = item.id === field.value;
                            return (
                              <CommandItem
                                value={`${item.id}-${item.item_name}`}
                                key={item.id}
                                data-testid={`item-option-${item.id}`}
                                onSelect={() => {
                                  form.setValue('item', item.id);
                                  if (!item.needs_personnel) {
                                    form.setValue('employees', []);
                                    form.setValue('chofer_dia', '');
                                    form.setValue('chofer_noche', '');
                                    form.setValue('ayudante_dia', []);
                                    form.setValue('ayudante_noche', []);
                                  }
                                  if (!item.needs_equipment) {
                                    form.setValue('equipment', []);
                                  }
                                }}
                              >
                                <div className="flex items-center justify-between w-full">
                                  <span>{item.item_name}</span>
                                  {item.measure_units?.unit && (
                                    <Badge variant="outline" className="ml-2">
                                      {item.measure_units.unit}
                                    </Badge>
                                  )}
                                </div>
                                <Check className={cn('ml-2 h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')} />
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Sector del Cliente (opcional) */}
        <FormField
          control={form.control}
          name="sector_service_id"
          render={({ field }) => {
            const selectedSector = customerSectors.find((s) => s.id === field.value);
            return (
              <FormItem className="flex flex-col">
                <FormLabel>Sector del Cliente (Opcional)</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        role="combobox"
                        disabled={isSectorDisabled || disabled}
                        className={cn(
                          'w-full justify-between',
                          !field.value && 'text-muted-foreground',
                          isSectorDisabled && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        {selectedSector?.name ??
                          (selectedCustomer
                            ? customerSectors.length > 0
                              ? 'Seleccionar sector (opcional)'
                              : 'No hay sectores disponibles'
                            : 'Seleccione un cliente primero')}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-full p-0">
                    <Command>
                      <CommandInput placeholder="Buscar sector..." className="h-9" />
                      <CommandList>
                        <CommandEmpty>
                          {!selectedCustomerId
                            ? 'Seleccione un cliente primero.'
                            : customerSectors.length === 0
                              ? 'No hay sectores disponibles.'
                              : 'No se encontraron sectores.'}
                        </CommandEmpty>
                        {customerSectors.length > 0 && (
                          <CommandGroup>
                            {customerSectors.map((sector) => (
                              <CommandItem
                                value={sector.name}
                                key={sector.id}
                                onSelect={() =>
                                  form.setValue('sector_service_id', sector.id, {
                                    shouldDirty: true,
                                  })
                                }
                              >
                                {sector.name || 'Sin nombre'}
                                <Check
                                  className={cn(
                                    'ml-auto h-4 w-4',
                                    sector.id === field.value ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        {/* Área del Cliente */}
        <FormField
          control={form.control}
          name="areas_service_id"
          render={({ field }) => {
            const selectedArea = customerAreas.find((a) => a.id === field.value);
            return (
              <FormItem className="flex flex-col">
                <FormLabel>Área del Cliente (Opcional)</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        role="combobox"
                        disabled={isAreaDisabled || disabled}
                        className={cn(
                          'w-full justify-between',
                          !field.value && 'text-muted-foreground',
                          isAreaDisabled && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        {selectedArea?.name ??
                          (selectedCustomer
                            ? customerAreas.length > 0
                              ? 'Seleccionar área'
                              : 'No hay áreas disponibles'
                            : 'Seleccione un cliente primero')}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-full p-0">
                    <Command>
                      <CommandInput placeholder="Buscar área..." className="h-9" />
                      <CommandList>
                        <CommandEmpty>
                          {!selectedCustomerId
                            ? 'Seleccione un cliente primero.'
                            : customerAreas.length === 0
                              ? 'No hay áreas disponibles.'
                              : 'No se encontraron áreas.'}
                        </CommandEmpty>
                        {customerAreas.length > 0 && (
                          <CommandGroup>
                            {customerAreas.map((area) => (
                              <CommandItem
                                value={area.name}
                                key={area.id}
                                onSelect={() => form.setValue('areas_service_id', area.id, { shouldDirty: true })}
                              >
                                {area.name || 'Sin nombre'}
                                <Check
                                  className={cn(
                                    'ml-auto h-4 w-4',
                                    area.id === field.value ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        {/* Equipos del Cliente */}
        <FormField
          control={form.control}
          name="equipos_cliente"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Equipos del Cliente</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant="outline"
                      role="combobox"
                      disabled={disabled || customerEquipment.length === 0}
                      className={cn('w-full justify-between', !field.value?.length && 'text-muted-foreground')}
                    >
                      {field.value && field.value.length > 0
                        ? `${field.value.length} equipo${field.value.length > 1 ? 's' : ''} del cliente seleccionado${field.value.length > 1 ? 's' : ''}`
                        : customerEquipment.length === 0
                          ? 'No hay equipos del cliente'
                          : 'Seleccionar equipos del cliente'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0">
                  <Command>
                    <CommandInput placeholder="Buscar equipos..." />
                    <CommandEmpty>No se encontraron equipos.</CommandEmpty>
                    <CommandGroup className="max-h-[200px] overflow-y-auto">
                      {customerEquipment.map((equipo) => {
                        const isSelected = field.value?.includes(equipo.id) ?? false;
                        const maxSelected = (field.value?.length ?? 0) >= 2;
                        const isDisabled = !isSelected && maxSelected;

                        return (
                          <CommandItem
                            value={equipo.name ?? equipo.type ?? ''}
                            key={equipo.id}
                            disabled={isDisabled}
                            onSelect={() => {
                              if (isDisabled) return;
                              const newValue = isSelected
                                ? field.value?.filter((v: string) => v !== equipo.id) ?? []
                                : [...(field.value ?? []), equipo.id];
                              field.onChange(newValue);
                            }}
                            className={cn(isDisabled && 'opacity-50 cursor-not-allowed', isSelected && 'bg-accent/50')}
                          >
                            <Check className={cn('mr-2 h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')} />
                            {equipo.name} ({equipo.type})
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
