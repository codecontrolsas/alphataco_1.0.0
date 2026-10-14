'use client';

import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PriceCurrencyInput } from '@/components/ui/price-currency-input';
import { getVehicleOwners } from '@/features/Equipos/EquipoID/lib/actions/vehicle-catalog-actions';
import { cn } from '@/lib/utils';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { Check, ChevronsUpDown } from 'lucide-react';
import moment from 'moment';
import { use, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { OtherEquipmentFormData } from '../OtherEquipmentForm';
import { DateField } from './DateField';

interface PurchaseContractSectionProps {
  form: UseFormReturn<OtherEquipmentFormData>;
  readOnly: boolean;
  ownersPromise: ReturnType<typeof getVehicleOwners>;
}

/** Compra y régimen: factura, valor, fecha de compra, tipo de contrato, propietario y datos del contrato. */
export function PurchaseContractSection({ form, readOnly, ownersPromise }: PurchaseContractSectionProps) {
  const ownersInitial = use(ownersPromise);
  const [owners, setOwners] = useState<typeof ownersInitial>(ownersInitial);

  const watchedCurrency = form.watch('currency');
  const typeOfContract = form.watch('type_of_contract');

  // Hoy en hora argentina (el navegador puede estar en otra zona)
  const today = moment(argentinaDate(), 'YYYY-MM-DD').toDate();

  const handleTypeOfContractChange = (type: string) => {
    form.setValue('type_of_contract', type as OtherEquipmentFormData['type_of_contract']);
    form.setValue('owner_id', null);

    if (type === 'Leasing' || type === 'Alquiler' || type === 'Prendado') {
      const filtered = ownersInitial.filter((owner) =>
        owner.equipment_owner_contract_types?.some((ct: { contract_type: string }) => ct.contract_type === type)
      );
      setOwners(filtered);
    } else {
      setOwners(ownersInitial);
    }
  };

  return (
    <>
      {/* N° de Factura */}
      <FormField
        control={form.control}
        name="invoice_number"
        render={({ field }) => (
          <FormItem>
            <FormLabel>N° de Factura</FormLabel>
            <FormControl>
              <Input
                {...field}
                value={field.value ?? ''}
                disabled={readOnly}
                placeholder="Ingrese el número de factura"
              />
            </FormControl>
            <FormDescription>Número de factura de compra</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Valor inicial */}
      <FormField
        control={form.control}
        name="initial_value"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Valor Inicial</FormLabel>
            <FormControl>
              <PriceCurrencyInput
                price={field.value?.toString() ?? ''}
                currency={watchedCurrency ?? 'ARS'}
                onPriceChange={(price) => {
                  field.onChange(price ? parseFloat(price) : null);
                }}
                onCurrencyChange={(currency) => {
                  form.setValue('currency', currency as OtherEquipmentFormData['currency']);
                }}
                placeholder="0.00"
                disabled={readOnly}
              />
            </FormControl>
            <FormDescription>Valor de adquisición del equipo</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Fecha de compra */}
      <FormField
        control={form.control}
        name="purchase_date"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Fecha de Compra</FormLabel>
            <FormControl>
              <DateField value={field.value} onChange={field.onChange} readOnly={readOnly} maxDate={today} />
            </FormControl>
            <FormDescription>Fecha de adquisición del equipo</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Tipo de Contrato */}
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
                  <CommandInput placeholder="Buscar tipo..." />
                  <CommandList>
                    <CommandEmpty>No se encontró</CommandEmpty>
                    <CommandGroup>
                      {['Leasing', 'Alquiler', 'Prendado', 'Propio'].map((type) => (
                        <CommandItem key={type} value={type} onSelect={() => handleTypeOfContractChange(type)}>
                          <Check className={cn('mr-2 h-4 w-4', type === field.value ? 'opacity-100' : 'opacity-0')} />
                          {type}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <FormDescription>Tipo de contrato del equipo</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Propietario — solo visible si tipo de contrato NO es "Propio" */}
      {typeOfContract && typeOfContract !== 'Propio' && (
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
                      {owners.find((o) => o.id.toString() === field.value)?.name || 'Seleccionar propietario'}
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
                            value={owner.name || ''}
                            onSelect={() => form.setValue('owner_id', owner.id.toString())}
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
              <FormDescription>Propietario del equipo según tipo de contrato</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* Fecha de inicio del contrato — solo si NO es "Propio" y hay tipo seleccionado */}
      {typeOfContract && typeOfContract !== 'Propio' && (
        <FormField
          control={form.control}
          name="contract_start_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fecha de Inicio del Contrato</FormLabel>
              <FormControl>
                <DateField value={field.value} onChange={field.onChange} readOnly={readOnly} />
              </FormControl>
              <FormDescription>Fecha de inicio del contrato</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* Fecha de vencimiento del contrato */}
      {typeOfContract && typeOfContract !== 'Propio' && (
        <FormField
          control={form.control}
          name="contract_expiration_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fecha de Vencimiento del Contrato</FormLabel>
              <FormControl>
                <DateField value={field.value} onChange={field.onChange} readOnly={readOnly} />
              </FormControl>
              <FormDescription>Fecha de vencimiento del contrato</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* Número de Contrato */}
      {typeOfContract && typeOfContract !== 'Propio' && (
        <FormField
          control={form.control}
          name="contract_number"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Número de Contrato</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? ''}
                  disabled={readOnly}
                  placeholder="Ingrese el número de contrato"
                />
              </FormControl>
              <FormDescription>Número identificador del contrato</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </>
  );
}
