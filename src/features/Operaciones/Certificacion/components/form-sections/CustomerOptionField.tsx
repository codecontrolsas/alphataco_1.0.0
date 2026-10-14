import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';
import type { DailyReportRowFormValues } from '../form-types';
import type { CustomerNamedOption } from './customer-options';

type CustomerOptionFieldProps = {
  form: UseFormReturn<DailyReportRowFormValues>;
  name: 'sector_service_id' | 'areas_service_id';
  label: string;
  options: CustomerNamedOption[];
  /** Texto del botón cuando no hay valor (ej. `Seleccionar sector`). */
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  /** Nombre ya resuelto de la fila en edición, si la opción no está en la lista. */
  fallbackName?: string | null;
  /** El cliente no tiene opciones de este tipo: el combo queda inhabilitado y atenuado. */
  isLocked: boolean;
  disabled?: boolean;
};

/** Combo de una opción del cliente (sector o área) elegida entre las del servicio seleccionado. */
export function CustomerOptionField({
  form,
  name,
  label,
  options,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  fallbackName,
  isLocked,
  disabled,
}: CustomerOptionFieldProps) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-col">
          <FormLabel>{label}</FormLabel>
          <Popover>
            <PopoverTrigger asChild>
              <FormControl>
                <Button
                  variant="outline"
                  role="combobox"
                  disabled={isLocked || disabled}
                  className={cn(
                    'w-full justify-between',
                    !field.value && 'text-muted-foreground',
                    isLocked && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {field.value ? options.find((option) => option.id === field.value)?.name || fallbackName : placeholder}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </FormControl>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-full p-0">
              <Command>
                <CommandInput placeholder={searchPlaceholder} className="h-9" disabled={isLocked || disabled} />
                <CommandList>
                  <CommandEmpty>{emptyMessage}</CommandEmpty>
                  {options.length > 0 && (
                    <CommandGroup>
                      {options.map((option) => (
                        <CommandItem
                          value={option.name || ''}
                          key={option.id}
                          onSelect={() => form.setValue(name, option.id)}
                          disabled={disabled}
                        >
                          {option.name || 'Sin nombre'}
                          <Check
                            className={cn('ml-auto h-4 w-4', option.id === field.value ? 'opacity-100' : 'opacity-0')}
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
  );
}
