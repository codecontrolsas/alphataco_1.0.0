'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { UseFormReturn } from 'react-hook-form';
import type { VehicleForForm } from '../../../form-data.server';
import type { DailyReportRowFormValues } from '../schema';

interface VehicleFieldProps {
  form: UseFormReturn<DailyReportRowFormValues>;
  vehicles: VehicleForForm[];
  selectedCustomerId: string | null;
  disabled?: boolean;
}

/** Selector múltiple de equipos propios (vehículos) de la línea. */
export function VehicleField({ form, vehicles, selectedCustomerId, disabled = false }: VehicleFieldProps) {
  return (
    <FormField
      control={form.control}
      name="equipment"
      render={({ field }) => (
        <FormItem className="flex flex-col">
          <FormLabel>Equipos propios</FormLabel>
          <div className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button
                    variant="outline"
                    role="combobox"
                    disabled={!selectedCustomerId || disabled}
                    className={cn(
                      'flex-1 justify-between',
                      !field.value?.length && 'text-muted-foreground',
                      !selectedCustomerId && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {field.value?.length
                      ? `${field.value.length} equipo${field.value.length > 1 ? 's' : ''} seleccionado${field.value.length > 1 ? 's' : ''}`
                      : selectedCustomerId
                        ? 'Seleccionar equipos'
                        : 'Seleccione un cliente primero'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-full p-0">
                <Command>
                  <CommandInput placeholder="Buscar equipos..." />
                  <CommandList>
                    <CommandEmpty>
                      {!selectedCustomerId
                        ? 'Seleccione un cliente primero.'
                        : vehicles.length === 0
                          ? 'No hay equipos activos disponibles.'
                          : 'No se encontraron equipos que coincidan.'}
                    </CommandEmpty>
                    {selectedCustomerId && (
                      <div className="px-3 py-1.5 text-xs text-muted-foreground space-y-1">
                        <p>
                          Los equipos en <span className="text-warn-subtle-foreground font-medium">naranja</span> no están
                          asignados al cliente.
                        </p>
                        <p>
                          Los equipos en <span className="text-danger-subtle-foreground font-medium">rojo</span> tienen problemas de
                          condición.
                        </p>
                      </div>
                    )}
                    {selectedCustomerId &&
                      (() => {
                        const typesMap: Record<string, VehicleForForm[]> = {};
                        vehicles.forEach((v) => {
                          const typeName = v.type_vehicles_typeTotype?.name ?? 'Sin tipo';
                          if (!typesMap[typeName]) typesMap[typeName] = [];
                          typesMap[typeName].push(v);
                        });

                        return Object.keys(typesMap)
                          .sort()
                          .map((type) => (
                            <CommandGroup key={type} heading={type.charAt(0).toUpperCase() + type.slice(1)}>
                              {typesMap[type].map((vehicle) => {
                                const isAssigned = vehicle.contractor_equipment?.some(
                                  (ce) => ce.customers?.id === selectedCustomerId
                                );
                                const condition = (vehicle.condition ?? 'operativo') as string;
                                const hasConditionIssue = ['no operativo', 'en reparacion'].includes(condition);
                                const conditionLabel =
                                  condition === 'no operativo'
                                    ? 'No operativo'
                                    : condition === 'en reparacion'
                                      ? 'En reparación'
                                      : null;

                                return (
                                  <CommandItem
                                    value={vehicle.domain ?? ''}
                                    key={vehicle.id}
                                    onSelect={() => {
                                      const currentValues = field.value ?? [];
                                      const newValues = currentValues.includes(vehicle.id)
                                        ? currentValues.filter((id) => id !== vehicle.id)
                                        : [...currentValues, vehicle.id];
                                      field.onChange(newValues);
                                    }}
                                    className={cn(
                                      hasConditionIssue && 'bg-danger-subtle text-danger-subtle-foreground hover:bg-danger-subtle',
                                      !isAssigned &&
                                        !hasConditionIssue &&
                                        'bg-warn-subtle text-warn-subtle-foreground hover:bg-warn-subtle'
                                    )}
                                  >
                                    <div className="flex items-center justify-between w-full">
                                      <div className="flex items-center">
                                        <Check
                                          className={cn(
                                            'mr-2 h-4 w-4',
                                            hasConditionIssue && 'text-danger',
                                            !isAssigned && !hasConditionIssue && 'text-warn-subtle-foreground',
                                            field.value?.includes(vehicle.id) ? 'opacity-100' : 'opacity-0'
                                          )}
                                        />
                                        {vehicle.domain ?? vehicle.serie}
                                      </div>
                                      <div className="flex gap-1">
                                        {hasConditionIssue && (
                                          <Badge
                                            variant="outline"
                                            className="ml-2 border-danger/40 bg-danger-subtle text-danger-subtle-foreground"
                                          >
                                            {conditionLabel}
                                          </Badge>
                                        )}
                                        {!isAssigned && (
                                          <Badge
                                            variant="outline"
                                            className="ml-2 border-warn/40 bg-warn-subtle text-warn-subtle-foreground"
                                          >
                                            No asignado
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          ));
                      })()}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Selected vehicle badges */}
          {(field.value?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {field.value?.map((vehicleId) => {
                const vehicle = vehicles.find((v) => v.id === vehicleId);
                if (!vehicle) return null;
                const isAssigned = vehicle.contractor_equipment?.some(
                  (ce) => ce.customers?.id === selectedCustomerId
                );
                const condition = (vehicle.condition ?? 'operativo') as string;
                const hasConditionIssue = ['no operativo', 'en reparacion'].includes(condition);
                const conditionLabel =
                  condition === 'no operativo'
                    ? 'No operativo'
                    : condition === 'en reparacion'
                      ? 'En reparación'
                      : null;

                return (
                  <div
                    key={vehicleId}
                    className={cn(
                      'text-xs px-2 py-1 rounded-md flex items-center gap-1',
                      hasConditionIssue
                        ? 'border border-danger/40 bg-danger-subtle text-danger-subtle-foreground'
                        : isAssigned
                          ? 'bg-brand-subtle text-brand-subtle-foreground'
                          : 'border border-warn/40 bg-warn-subtle text-warn-subtle-foreground'
                    )}
                  >
                    {vehicle.domain ?? vehicle.serie}
                    {hasConditionIssue && (
                      <Badge
                        variant="outline"
                        className="ml-1 border-danger/40 bg-danger-subtle text-danger-subtle-foreground text-[10px] px-1 py-0"
                      >
                        {conditionLabel}
                      </Badge>
                    )}
                    {!isAssigned && (
                      <Badge
                        variant="outline"
                        className="ml-1 border-warn/40 bg-warn-subtle text-warn-subtle-foreground text-[10px] px-1 py-0"
                      >
                        No asignado
                      </Badge>
                    )}
                    <button
                      type="button"
                      aria-label={`Quitar ${vehicle.domain ?? vehicle.serie ?? 'equipo'}`}
                      onClick={() => {
                        const newValues = (field.value ?? []).filter((id) => id !== vehicleId);
                        field.onChange(newValues);
                      }}
                      className="ml-1 rounded-sm hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
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
