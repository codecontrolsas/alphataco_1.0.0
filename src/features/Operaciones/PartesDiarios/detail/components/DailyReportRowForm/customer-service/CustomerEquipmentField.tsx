import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';
import type { CustomerForForm } from '../../../form-data.server';
import type { DailyReportRowFormValues } from '../schema';

/** Máximo de equipos del cliente por línea (lo exige el schema). */
const MAX_CUSTOMER_EQUIPMENT = 2;

interface CustomerEquipmentFieldProps {
  form: UseFormReturn<DailyReportRowFormValues>;
  equipment: NonNullable<CustomerForForm['equipos_clientes']>;
  disabled: boolean;
}

/** Selector múltiple de equipos del cliente (hasta 2) */
export function CustomerEquipmentField({ form, equipment, disabled }: CustomerEquipmentFieldProps) {
  return (
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
                  disabled={disabled || equipment.length === 0}
                  className={cn('w-full justify-between', !field.value?.length && 'text-muted-foreground')}
                >
                  {field.value && field.value.length > 0
                    ? `${field.value.length} equipo${field.value.length > 1 ? 's' : ''} del cliente seleccionado${field.value.length > 1 ? 's' : ''}`
                    : equipment.length === 0
                      ? 'No hay equipos del cliente'
                      : 'Seleccionar equipos del cliente'}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
                </Button>
              </FormControl>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0">
              <Command>
                <CommandInput placeholder="Buscar equipos..." />
                <CommandEmpty>No se encontraron equipos.</CommandEmpty>
                <CommandGroup className="max-h-[200px] overflow-y-auto">
                  {equipment.map((equipo) => {
                    const isSelected = field.value?.includes(equipo.id) ?? false;
                    const maxSelected = (field.value?.length ?? 0) >= MAX_CUSTOMER_EQUIPMENT;
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
                        <Check className={cn('mr-2 h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
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
  );
}
