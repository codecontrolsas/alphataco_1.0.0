'use client';

import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown } from 'lucide-react';
import { UseFormReturn } from 'react-hook-form';
import type { DailyReportRowFormValues } from './schema';

const WORKING_DAY_OPTIONS = [
  { label: 'Jornada 8 horas', value: 'Jornada 8 horas' },
  { label: 'Jornada 12 horas', value: 'Jornada 12 horas' },
  { label: 'Jornada 24 horas', value: 'Jornada 24 horas' },
  { label: 'Por horario', value: 'por horario' },
];

interface JornadaSectionProps {
  form: UseFormReturn<DailyReportRowFormValues>;
  disabled?: boolean;
}

export function JornadaSection({ form, disabled = false }: JornadaSectionProps) {
  return (
    <section aria-labelledby="row-form-jornada" className="space-y-4 rounded-lg border bg-card p-4">
      <h3 id="row-form-jornada" className="text-sm font-semibold text-foreground">
        Jornada
      </h3>
    <FormField
      control={form.control}
      name="working_day"
      render={({ field }) => (
        <FormItem className="flex flex-col">
          <FormLabel>Tipo de jornada</FormLabel>
          <Popover>
            <PopoverTrigger asChild>
              <FormControl>
                <Button
                  variant="outline"
                  role="combobox"
                  disabled={disabled}
                  className={cn('w-full justify-between', !field.value && 'text-muted-foreground')}
                  data-testid="working-day-select-button"
                >
                  {field.value
                    ? WORKING_DAY_OPTIONS.find((d) => d.value.toLowerCase() === field.value.toLowerCase())?.label
                    : 'Seleccionar jornada'}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </FormControl>
            </PopoverTrigger>
            <PopoverContent align="start" className="max-w-[400px] p-0">
              <Command>
                <CommandInput placeholder="Buscar jornada..." className="h-9" />
                <CommandList>
                  <CommandEmpty>No se encontraron jornadas.</CommandEmpty>
                  <CommandGroup>
                    {WORKING_DAY_OPTIONS.map((day) => (
                      <CommandItem
                        value={day.label.toLocaleLowerCase()}
                        key={day.value.toLocaleLowerCase()}
                        data-testid={`working-day-option-${day.value.replace(/ /g, '-')}`}
                        onSelect={() => {
                          const previousValue = form.getValues('working_day');
                          form.setValue('working_day', day.value.toLowerCase());
                          if (
                            previousValue?.toLowerCase() === 'por horario' ||
                            day.value.toLowerCase() !== 'por horario'
                          ) {
                            form.setValue('start_time', '');
                            form.setValue('end_time', '');
                          }
                        }}
                      >
                        {day.label}
                        <Check
                          className={cn(
                            'ml-auto h-4 w-4',
                            day.value.toLowerCase() === field.value?.toLowerCase() ? 'opacity-100' : 'opacity-0'
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
    </section>
  );
}
