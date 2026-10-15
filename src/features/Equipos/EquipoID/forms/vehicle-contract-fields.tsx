'use client';

import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown } from 'lucide-react';
import moment from 'moment';
import { use, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { getVehicleOwnersType } from '../lib/actions/vehicle-catalog-actions';
import type { VEHICLE_CONTRACT_TYPES, VehicleFormValues } from '../schemas/vehicle';

const DATE_FORMAT = 'DD/MM/YYYY';

/** Orden en que se ofrecen los tipos de contrato (los valores válidos viven en `VEHICLE_CONTRACT_TYPES`). */
const CONTRACT_OPTIONS = ['Leasing', 'Alquiler', 'Prendado', 'Propio'] as const satisfies ReadonlyArray<
  (typeof VEHICLE_CONTRACT_TYPES)[number]
>;

interface VehicleContractFieldsProps {
  form: UseFormReturn<VehicleFormValues>;
  readOnly?: boolean;
  ownersPromise: Promise<getVehicleOwnersType>;
}

/** Régimen del equipo: tipo de contrato, titular, vigencia y número de contrato. */
export function VehicleContractFields({ form, readOnly = false, ownersPromise }: VehicleContractFieldsProps) {
  const ownersInitial = use(ownersPromise);
  const [owners, setOwners] = useState<typeof ownersInitial>(ownersInitial);
  const typeOfContract = form.watch('type_of_contract');
  const startDate = form.watch('contract_start_date');
  const expirationDate = form.watch('contract_expiration_date');
  const hasContractDetails = !!typeOfContract && typeOfContract !== 'Propio';

  const handleTypeOfContractChange = (type: string) => {
    form.setValue('owner_id', null);

    if (type === 'Leasing' || type === 'Alquiler' || type === 'Prendado') {
      // Filtrar titulares que tengan el tipo de contrato seleccionado en su relación
      const filtered = ownersInitial.filter((owner) => {
        const contractTypes = owner.equipment_owner_contract_types;

        return contractTypes?.some((ct: { contract_type: string }) => {
          return ct.contract_type === type;
        });
      });

      setOwners(filtered);
    } else {
      // Si es "Propio", mostrar todos los titulares
      setOwners(ownersInitial);
    }
  };

  return (
    <>
      <FormField
        control={form.control}
        name="type_of_contract"
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>Tipo de Contrato</FormLabel>
            <Popover>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button
                    disabled={readOnly}
                    variant="outline"
                    role="combobox"
                    className={cn('justify-between', !field.value && 'text-muted-foreground')}
                  >
                    {field.value || 'Seleccionar tipo de contrato'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput placeholder="Buscar tipo de contrato..." />
                  <CommandList>
                    <CommandEmpty>No se encontró ningún tipo de contrato</CommandEmpty>
                    <CommandGroup>
                      {CONTRACT_OPTIONS.map((type) => (
                        <CommandItem
                          key={type}
                          value={type}
                          onSelect={() => {
                            handleTypeOfContractChange(type);
                            form.setValue('type_of_contract', type);
                          }}
                        >
                          <Check className={cn('mr-2 h-4 w-4', type === field.value ? 'opacity-100' : 'opacity-0')} />
                          {type}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <FormDescription>Selecciona el tipo de contrato del equipo</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      {typeOfContract !== 'Propio' && (
        <FormField
          control={form.control}
          name="owner_id"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Propietario</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      disabled={readOnly}
                      variant="outline"
                      role="combobox"
                      className={cn('justify-between', !field.value && 'text-muted-foreground')}
                    >
                      {owners.find((owner) => owner.id.toString() === field.value)?.name || 'Seleccionar propietario'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                  <Command>
                    <CommandInput placeholder="Buscar propietario..." />
                    <CommandList>
                      <CommandEmpty>No se encontró ningún propietario</CommandEmpty>
                      <CommandGroup>
                        {owners.map((owner) => (
                          <CommandItem
                            key={owner.id}
                            value={owner?.name || ''}
                            onSelect={() => {
                              const ownerId = owner.id?.toString() || '';
                              form.setValue('owner_id', ownerId);
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                owner.id.toString() === field.value ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            {owner.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <FormDescription>Selecciona el propietario del equipo</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
      {hasContractDetails && (
        <FormField
          control={form.control}
          name="contract_start_date"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Fecha de inicio del {typeOfContract}</FormLabel>
              <FormControl>
                {readOnly ? (
                  <Input disabled value={field.value ? moment(field.value).format(DATE_FORMAT) : ''} />
                ) : (
                  <EnhancedDatePicker
                    date={field.value ?? undefined}
                    setDate={(date) => field.onChange(date ?? null)}
                    maxDate={expirationDate ?? undefined}
                    placeholder="DD/MM/AAAA"
                  />
                )}
              </FormControl>
              <FormDescription>Escribí la fecha o elegila en el calendario</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
      {hasContractDetails && (
        <FormField
          control={form.control}
          name="contract_expiration_date"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Fecha de vencimiento del {typeOfContract}</FormLabel>
              <FormControl>
                {readOnly ? (
                  <Input disabled value={field.value ? moment(field.value).format(DATE_FORMAT) : ''} />
                ) : (
                  <EnhancedDatePicker
                    date={field.value ?? undefined}
                    setDate={(date) => field.onChange(date ?? null)}
                    minDate={startDate ?? undefined}
                    placeholder="DD/MM/AAAA"
                  />
                )}
              </FormControl>
              <FormDescription>Escribí la fecha o elegila en el calendario</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {hasContractDetails && (
        <FormField
          control={form.control}
          name="contract_number"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Número de Contrato</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? ''}
                  disabled={readOnly}
                  placeholder="Ingrese el número de contrato"
                />
              </FormControl>
              <FormDescription>Ingrese el número de contrato del equipo</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </>
  );
}
