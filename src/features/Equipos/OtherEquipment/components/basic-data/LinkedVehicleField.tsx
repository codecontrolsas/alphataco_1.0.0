'use client';

import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown } from 'lucide-react';
import { use } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { OtherEquipmentFormData } from '../OtherEquipmentForm';

interface LinkedVehicleFieldProps {
  form: UseFormReturn<OtherEquipmentFormData>;
  readOnly: boolean;
  vehiclesPromise: Promise<Array<{ id: string; domain: string | null }>>;
}

/** Vehículo al que se vincula el equipo (opcional). */
export function LinkedVehicleField({ form, readOnly, vehiclesPromise }: LinkedVehicleFieldProps) {
  const vehicles = use(vehiclesPromise);

  return (
    <>
      {/* Vehículo vinculado */}
      <FormField
        control={form.control}
        name="linked_vehicle_id"
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>Vehículo Vinculado</FormLabel>
            <Popover>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button
                    disabled={readOnly}
                    variant="outline"
                    role="combobox"
                    className={cn('justify-between', !field.value && 'text-muted-foreground')}
                  >
                    {vehicles.find((v) => v.id === field.value)?.domain || 'Vincular a un vehículo (opcional)'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput placeholder="Buscar por dominio..." />
                  <CommandList>
                    <CommandEmpty>No se encontraron vehículos</CommandEmpty>
                    <CommandGroup>
                      {/* Opción para desvincular */}
                      <CommandItem value="ninguno" onSelect={() => form.setValue('linked_vehicle_id', null)}>
                        <Check className={cn('mr-2 h-4 w-4', !field.value ? 'opacity-100' : 'opacity-0')} />
                        Sin vincular
                      </CommandItem>
                      {vehicles.map((vehicle) => (
                        <CommandItem
                          key={vehicle.id}
                          value={vehicle.domain || ''}
                          onSelect={() => form.setValue('linked_vehicle_id', vehicle.id)}
                        >
                          <Check
                            className={cn('mr-2 h-4 w-4', vehicle.id === field.value ? 'opacity-100' : 'opacity-0')}
                          />
                          {vehicle.domain}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <FormDescription>Vincula este equipo a un vehículo (opcional)</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}
