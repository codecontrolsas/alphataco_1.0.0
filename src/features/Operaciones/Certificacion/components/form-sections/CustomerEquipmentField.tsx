import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';
import type { DailyReportRowFormValues } from '../form-types';

/** Máximo de equipos de cliente por línea (lo valida también el schema). */
const MAX_CUSTOMER_EQUIPMENT = 2;

type CustomerEquipmentFieldProps = {
  form: UseFormReturn<DailyReportRowFormValues>;
  customerEquipments: Array<{ id: string; name: string }>;
  disabled?: boolean;
};

/** Combo multi-selección de equipos del cliente (máx. 2) con chips. */
export function CustomerEquipmentField({ form, customerEquipments, disabled }: CustomerEquipmentFieldProps) {
  const selectedCustomerEquipment = form.watch('equipos_cliente') || [];

  return (
    <FormField
      control={form.control}
      name="equipos_cliente"
      render={() => {
        return (
          <FormItem className="flex flex-col">
            <FormLabel>Equipos de Cliente (Máx. 2)</FormLabel>
            <Popover>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button
                    variant="outline"
                    role="combobox"
                    disabled={disabled || customerEquipments.length === 0}
                    className="w-full justify-between"
                  >
                    {selectedCustomerEquipment.length > 0
                      ? `${selectedCustomerEquipment.length} equipo(s) seleccionado(s)`
                      : 'Seleccionar equipos'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar equipo..." />
                  <CommandList>
                    <CommandEmpty>No hay equipos disponibles.</CommandEmpty>
                    <CommandGroup>
                      {customerEquipments.map((equipment) => {
                        const isSelected = selectedCustomerEquipment.includes(equipment.id);
                        return (
                          <CommandItem
                            key={equipment.id}
                            onSelect={() => {
                              const newValue = isSelected
                                ? selectedCustomerEquipment.filter((id) => id !== equipment.id)
                                : selectedCustomerEquipment.length < MAX_CUSTOMER_EQUIPMENT
                                  ? [...selectedCustomerEquipment, equipment.id]
                                  : selectedCustomerEquipment;
                              form.setValue('equipos_cliente', newValue);
                            }}
                            disabled={!isSelected && selectedCustomerEquipment.length >= MAX_CUSTOMER_EQUIPMENT}
                          >
                            <Check className={cn('mr-2 h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')} />
                            {equipment.name}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {selectedCustomerEquipment.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {selectedCustomerEquipment.map((eqId) => {
                  const eq = customerEquipments.find((item) => item.id === eqId);
                  return (
                    <Badge key={eqId} variant="secondary" className="gap-1">
                      {eq?.name}
                      <button
                        type="button"
                        aria-label="Quitar equipo"
                        className="ml-1 inline-flex cursor-pointer rounded hover:bg-muted-foreground/20"
                        onClick={() => {
                          form.setValue(
                            'equipos_cliente',
                            selectedCustomerEquipment.filter((id) => id !== eqId)
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
        );
      }}
    />
  );
}
