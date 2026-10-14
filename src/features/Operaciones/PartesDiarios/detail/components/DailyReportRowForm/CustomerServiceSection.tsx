import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown } from 'lucide-react';
import { UseFormReturn } from 'react-hook-form';
import type { CustomerForForm } from '../../form-data.server';
import { CustomerEquipmentField } from './customer-service/CustomerEquipmentField';
import { NamedOptionField } from './customer-service/NamedOptionField';
import { useCustomerServiceOptions } from './customer-service/useCustomerServiceOptions';
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

  const {
    activeCustomers,
    selectedCustomer,
    customerServices,
    serviceItems,
    customerSectors,
    customerAreas,
    customerEquipment,
  } = useCustomerServiceOptions(customers, selectedCustomerId, selectedServiceId);

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

  return (
    <section aria-labelledby="row-form-customer-service" className="space-y-4 rounded-lg border bg-card p-4 w-full">
      <h3 id="row-form-customer-service" className="text-sm font-semibold text-foreground">
        Cliente y servicio
      </h3>
      <div className="grid grid-cols-1 gap-4 w-full">
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
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
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
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
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
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
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
        <NamedOptionField
          form={form}
          name="sector_service_id"
          label="Sector del Cliente (Opcional)"
          options={customerSectors}
          hasCustomer={selectedCustomer != null}
          selectedCustomerId={selectedCustomerId}
          disabled={disabled}
          texts={{
            searchPlaceholder: 'Buscar sector...',
            selectPlaceholder: 'Seleccionar sector (opcional)',
            unavailable: 'No hay sectores disponibles',
            notFound: 'No se encontraron sectores.',
          }}
        />

        {/* Área del Cliente */}
        <NamedOptionField
          form={form}
          name="areas_service_id"
          label="Área del Cliente (Opcional)"
          options={customerAreas}
          hasCustomer={selectedCustomer != null}
          selectedCustomerId={selectedCustomerId}
          disabled={disabled}
          texts={{
            searchPlaceholder: 'Buscar área...',
            selectPlaceholder: 'Seleccionar área',
            unavailable: 'No hay áreas disponibles',
            notFound: 'No se encontraron áreas.',
          }}
        />

        {/* Equipos del Cliente */}
        <CustomerEquipmentField form={form} equipment={customerEquipment} disabled={disabled} />
      </div>
    </section>
  );
}
