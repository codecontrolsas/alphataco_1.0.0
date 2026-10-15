import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Building, Check, ChevronsUpDown } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';
import type { DailyReportRowFormValues } from '../form-types';
import { CustomerEquipmentField } from './CustomerEquipmentField';
import { CustomerOptionField } from './CustomerOptionField';
import { getCustomerAreas, getCustomerSectors } from './customer-options';

import type { CustomerForRowForm } from '@/features/Operaciones/PartesDiarios/actions/comercial-rows.server';

type CustomerServiceForForm = CustomerForRowForm['customer_services'][number];
type ServiceItemForForm = CustomerServiceForForm['service_items'][number];

type CustomerDataSectionProps = {
  form: UseFormReturn<DailyReportRowFormValues>;
  customers: CustomerForRowForm[];
  isCreating: boolean;
  /** Fila en edición: sólo se leen los nombres ya resueltos para mostrarlos como valor inicial. */
  selectedRow: {
    id?: string;
    status?: string | null;
    customer?: string | null;
    services?: string | null;
    item?: string | null;
    sector?: string | null;
    area?: string | null;
  } | null;
  selectedCustomerId: string | null;
  selectedServiceId: string | null;
  selectedCustomer: CustomerForRowForm | null;
  customerServices: CustomerServiceForForm[];
  serviceItems: ServiceItemForForm[];
  isSectorDisabled: boolean;
  isAreaDisabled: boolean;
  handleCustomerChange: (id: string) => void;
  handleServiceChange: (id: string) => void;
  disabled?: boolean;
};

export function CustomerDataSection({
  form,
  customers,
  isCreating,
  selectedRow,
  selectedCustomerId,
  selectedServiceId,
  selectedCustomer,
  customerServices,
  serviceItems,
  isSectorDisabled,
  isAreaDisabled,
  handleCustomerChange,
  handleServiceChange,
  disabled,
}: CustomerDataSectionProps) {
  const activeCustomers = customers?.filter((c) => c.is_active) || [];
  const customerSectors = getCustomerSectors(selectedCustomer, selectedServiceId);
  const customerAreas = getCustomerAreas(selectedCustomer, selectedServiceId);

  return (
    <div className="space-y-4 rounded-lg dark:bg-slate-900 bg-slate-50 p-4 w-full">
      <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
        <Building className="h-4 w-4" />
        Datos del Cliente
      </h4>
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
                      disabled={!isCreating || disabled}
                      className={cn('w-full justify-between', !field.value && 'text-muted-foreground')}
                    >
                      {isCreating
                        ? field.value
                          ? activeCustomers.find((c) => c.id === field.value)?.name
                          : 'Seleccionar cliente'
                        : selectedRow?.customer}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent align="start" className="max-w-[400px] p-0">
                  <Command>
                    <CommandInput placeholder="Buscar cliente..." className="h-9" disabled={!isCreating} />
                    <CommandList>
                      <CommandEmpty>No se encontraron clientes.</CommandEmpty>
                      <CommandGroup heading="Clientes activos">
                        {activeCustomers.map((customer) => (
                          <CommandItem
                            value={customer.name}
                            key={customer.id}
                            onSelect={() => handleCustomerChange(customer.id)}
                            disabled={!isCreating}
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
                      disabled={disabled}
                      className={cn('w-full justify-between', !field.value && 'text-muted-foreground')}
                    >
                      {field.value
                        ? customerServices.find((s) => s.id === field.value)?.service_name || selectedRow?.services
                        : 'Seleccionar servicio'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent align="start" className="max-w-[400px] p-0">
                  <Command>
                    <CommandInput placeholder="Buscar servicio..." className="h-9" disabled={disabled} />
                    <CommandList>
                      <CommandEmpty>
                        {!selectedCustomerId
                          ? 'Seleccione un cliente primero.'
                          : customerServices.length === 0
                            ? 'No hay servicios activos para este cliente.'
                            : 'No se encontraron servicios que coincidan.'}
                      </CommandEmpty>
                      {customerServices.length > 0 && (
                        <CommandGroup>
                          {customerServices.map((service) => (
                            <CommandItem
                              value={service.service_name || ''}
                              key={service.id}
                              onSelect={() => handleServiceChange(service.id)}
                              disabled={disabled}
                            >
                              {service.service_name}
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
                      disabled={disabled}
                      className={cn('w-full justify-between', !field.value && 'text-muted-foreground')}
                    >
                      {field.value
                        ? serviceItems.find((i) => i.id === field.value)?.item_name || selectedRow?.item
                        : 'Seleccionar ítem'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-full p-0">
                  <Command>
                    <CommandInput
                      placeholder={!selectedServiceId ? 'Seleccione un servicio primero' : 'Buscar ítem...'}
                      className="h-9"
                      disabled={disabled}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {!selectedServiceId
                          ? 'Seleccione un servicio primero.'
                          : serviceItems.length === 0
                            ? 'No hay ítems disponibles para este servicio.'
                            : 'No se encontraron ítems que coincidan.'}
                      </CommandEmpty>
                      {serviceItems.length > 0 && (
                        <CommandGroup>
                          {serviceItems.map((item) => (
                            <CommandItem
                              value={`${item.id}-${item.item_name}`}
                              key={item.id}
                              onSelect={() => {
                                form.setValue('item', item.id);
                                // Limpiar recursos que el nuevo item no requiere
                                if (!item.needs_personnel) form.setValue('employees', []);
                                if (!item.needs_equipment) form.setValue('equipment', []);
                              }}
                              disabled={disabled}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span>{item.item_name}</span>
                                {item.measure_units?.unit && (
                                  <Badge variant="outline" className="ml-2">
                                    {item.measure_units.unit}
                                  </Badge>
                                )}
                              </div>
                              <Check
                                className={cn('ml-2 h-4 w-4', item.id === field.value ? 'opacity-100' : 'opacity-0')}
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

        {/* Sector del Cliente */}
        <CustomerOptionField
          form={form}
          name="sector_service_id"
          label="Sector del Cliente"
          options={customerSectors}
          placeholder="Seleccionar sector"
          searchPlaceholder="Buscar sector..."
          emptyMessage="No hay sectores disponibles."
          fallbackName={selectedRow?.sector}
          isLocked={isSectorDisabled}
          disabled={disabled}
        />

        {/* Área del Cliente */}
        <CustomerOptionField
          form={form}
          name="areas_service_id"
          label="Área del Cliente"
          options={customerAreas}
          placeholder="Seleccionar área"
          searchPlaceholder="Buscar área..."
          emptyMessage="No hay áreas disponibles."
          fallbackName={selectedRow?.area}
          isLocked={isAreaDisabled}
          disabled={disabled}
        />

        {/* Equipos de Cliente */}
        <CustomerEquipmentField
          form={form}
          customerEquipments={selectedCustomer?.equipos_clientes || []}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
