import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';
import type { DailyReportRowFormValues } from '../form-types';

/** Recurso elegible (empleado o equipo) ya con el texto a mostrar. */
export type ResourceOption = {
  id: string;
  label: string;
  isActive: boolean;
};

type ResourceMultiSelectFieldProps = {
  form: UseFormReturn<DailyReportRowFormValues>;
  /** Campo del form que guarda los ids elegidos. */
  name: 'employees' | 'equipment';
  label: string;
  /** Sustantivo en singular y plural, en minúscula (ej. `empleado` / `empleados`). */
  noun: { singular: string; plural: string };
  options: ResourceOption[];
  isLoading: boolean;
  disabled?: boolean;
};

/** Combo multi-selección de recursos con chips; marca los recursos dados de baja. */
export function ResourceMultiSelectField({
  form,
  name,
  label,
  noun,
  options,
  isLoading,
  disabled,
}: ResourceMultiSelectFieldProps) {
  const selectedIds = form.watch(name) || [];

  return (
    <FormField
      control={form.control}
      name={name}
      render={() => (
        <FormItem className="flex flex-col">
          <FormLabel>{label}</FormLabel>
          <Popover>
            <PopoverTrigger asChild>
              <FormControl>
                <Button
                  variant="outline"
                  role="combobox"
                  disabled={disabled || isLoading}
                  className="w-full justify-between"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Cargando {noun.plural}...
                    </>
                  ) : selectedIds.length > 0 ? (
                    `${selectedIds.length} ${noun.singular}(s) seleccionado(s)`
                  ) : (
                    `Seleccionar ${noun.plural}`
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </FormControl>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0" align="start">
              <Command>
                <CommandInput placeholder={`Buscar ${noun.singular}...`} />
                <CommandList>
                  {isLoading ? (
                    <div className="p-4 text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      <p className="text-sm text-muted-foreground mt-2">Cargando {noun.plural}...</p>
                    </div>
                  ) : (
                    <>
                      <CommandEmpty>No se encontraron {noun.plural}.</CommandEmpty>
                      <CommandGroup>
                        {options.map((option) => {
                          const isSelected = selectedIds.includes(option.id);
                          return (
                            <CommandItem
                              key={option.id}
                              onSelect={() => {
                                form.setValue(
                                  name,
                                  isSelected ? selectedIds.filter((id) => id !== option.id) : [...selectedIds, option.id]
                                );
                              }}
                              className={cn(!option.isActive && 'bg-danger-subtle')}
                            >
                              <Check className={cn('mr-2 h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')} />
                              <div className="flex items-center gap-2 flex-1">
                                <span className={cn(!option.isActive && 'text-danger-subtle-foreground')}>
                                  {option.label}
                                </span>
                                {!option.isActive && (
                                  <Badge variant="destructive" className="text-[10px] h-5">
                                    Inactivo
                                  </Badge>
                                )}
                              </div>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {selectedIds.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {selectedIds.map((selectedId) => {
                const option = options.find((item) => item.id === selectedId);
                const isInactive = option?.isActive === false;
                return (
                  <Badge
                    key={selectedId}
                    variant={isInactive ? 'destructive' : 'secondary'}
                    className={cn('gap-1', isInactive && 'bg-danger-subtle text-danger-subtle-foreground border-danger')}
                  >
                    {option?.label}
                    {isInactive && <span className="text-[10px]">(Inactivo)</span>}
                    <button
                      type="button"
                      aria-label={`Quitar ${noun.singular}`}
                      className="ml-1 inline-flex cursor-pointer rounded hover:bg-muted-foreground/20"
                      onClick={() => {
                        form.setValue(
                          name,
                          selectedIds.filter((id) => id !== selectedId)
                        );
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
