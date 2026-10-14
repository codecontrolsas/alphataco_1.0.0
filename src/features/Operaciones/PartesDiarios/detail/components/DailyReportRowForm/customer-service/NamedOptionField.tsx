import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';
import type { DailyReportRowFormValues } from '../schema';
import type { NamedOption } from './useCustomerServiceOptions';

interface NamedOptionFieldProps {
  form: UseFormReturn<DailyReportRowFormValues>;
  name: 'sector_service_id' | 'areas_service_id';
  label: string;
  options: NamedOption[];
  /** Hay un cliente elegido y existe en la lista */
  hasCustomer: boolean;
  selectedCustomerId: string | undefined;
  disabled: boolean;
  texts: {
    searchPlaceholder: string;
    selectPlaceholder: string;
    unavailable: string;
    notFound: string;
  };
}

/** Selector opcional de una opción nombrada del servicio (sector o área del cliente) */
export function NamedOptionField({
  form,
  name,
  label,
  options,
  hasCustomer,
  selectedCustomerId,
  disabled,
  texts,
}: NamedOptionFieldProps) {
  const isEmpty = options.length === 0;

  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => {
        const selected = options.find((option) => option.id === field.value);
        return (
          <FormItem className="flex flex-col">
            <FormLabel>{label}</FormLabel>
            <Popover>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button
                    variant="outline"
                    role="combobox"
                    disabled={isEmpty || disabled}
                    className={cn(
                      'w-full justify-between',
                      !field.value && 'text-muted-foreground',
                      isEmpty && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {selected?.name ??
                      (hasCustomer
                        ? isEmpty
                          ? texts.unavailable
                          : texts.selectPlaceholder
                        : 'Seleccione un cliente primero')}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-full p-0">
                <Command>
                  <CommandInput placeholder={texts.searchPlaceholder} className="h-9" />
                  <CommandList>
                    <CommandEmpty>
                      {!selectedCustomerId
                        ? 'Seleccione un cliente primero.'
                        : isEmpty
                          ? `${texts.unavailable}.`
                          : texts.notFound}
                    </CommandEmpty>
                    {!isEmpty && (
                      <CommandGroup>
                        {options.map((option) => (
                          <CommandItem
                            value={option.name}
                            key={option.id}
                            onSelect={() => form.setValue(name, option.id, { shouldDirty: true })}
                          >
                            {option.name || 'Sin nombre'}
                            <Check
                              className={cn('ml-auto h-4 w-4', option.id === field.value ? 'opacity-100' : 'opacity-0')}
                              aria-hidden="true"
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
  );
}
