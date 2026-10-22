'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { defaultFilter } from 'cmdk';
import { Check, ChevronsUpDown } from 'lucide-react';
import { UseFormReturn } from 'react-hook-form';
import type { OtherEquipmentItem } from '../../../form-data.server';
import type { DailyReportRowFormValues } from '../schema';
import { ChipBadge, EquipmentChip, toggleId } from './EquipmentChip';
import type { SavedOtherEquipment } from './types';

interface OtherEquipmentFieldProps {
  form: UseFormReturn<DailyReportRowFormValues>;
  otherEquipment: OtherEquipmentItem[];
  /** Otros equipos ya guardados en la fila que se edita (incluye dados de baja / no operativos). */
  savedOtherEquipment: SavedOtherEquipment[];
  selectedCustomerId: string | null;
  disabled?: boolean;
}

/** Selector múltiple de otros equipos operativos de la línea. */
export function OtherEquipmentField({
  form,
  otherEquipment,
  savedOtherEquipment,
  selectedCustomerId,
  disabled = false,
}: OtherEquipmentFieldProps) {
  return (
    <FormField
      control={form.control}
      name="other_equipment"
      render={({ field }) => (
        <FormItem className="flex flex-col">
          <FormLabel>Otros Equipos Operativos</FormLabel>
          <Popover>
            <PopoverTrigger asChild>
              <FormControl>
                <Button
                  variant="outline"
                  role="combobox"
                  disabled={!selectedCustomerId || disabled}
                  className={cn(
                    'w-full justify-between',
                    !field.value?.length && 'text-muted-foreground',
                    !selectedCustomerId && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {field.value?.length
                    ? `${field.value.length} otro${field.value.length > 1 ? 's' : ''} equipo${field.value.length > 1 ? 's' : ''} seleccionado${field.value.length > 1 ? 's' : ''}`
                    : selectedCustomerId
                      ? 'Seleccionar otros equipos'
                      : 'Seleccione un cliente primero'}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </FormControl>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-full p-0">
              {/* Cada item se identifica por id (dos equipos pueden compartir interno). La búsqueda
                  usa el mismo puntaje difuso de cmdk, pero solo sobre interno/serie: así el uuid
                  del value no ensucia los resultados y "pl53" sigue encontrando "GH-PL-53". */}
              <Command filter={(_value, search, keywords) => defaultFilter((keywords ?? []).join(' '), search)}>
                <CommandInput placeholder="Buscar otros equipos..." />
                <CommandList>
                  <CommandEmpty>
                    {!selectedCustomerId
                      ? 'Seleccione un cliente primero.'
                      : otherEquipment.length === 0
                        ? 'No hay otros equipos operativos disponibles.'
                        : 'No se encontraron otros equipos.'}
                  </CommandEmpty>
                  {selectedCustomerId && (
                    <div className="px-3 py-1.5 text-xs text-muted-foreground">
                      Los equipos en <span className="text-warn-subtle-foreground font-medium">naranja</span> no están
                      asignados al cliente.
                    </div>
                  )}
                  {selectedCustomerId &&
                    (() => {
                      const typesMap: Record<string, OtherEquipmentItem[]> = {};
                      otherEquipment.forEach((eq) => {
                        const type = eq.type?.name ?? 'Sin tipo';
                        if (!typesMap[type]) typesMap[type] = [];
                        typesMap[type].push(eq);
                      });

                      return Object.keys(typesMap)
                        .sort()
                        .map((type) => (
                          <CommandGroup key={type} heading={type.charAt(0).toUpperCase() + type.slice(1)}>
                            {typesMap[type].map((eq) => {
                              const isAssigned = eq.contractor_other_equipment?.some(
                                (ce) => ce.customers?.id === selectedCustomerId
                              );
                              return (
                                <CommandItem
                                  value={eq.id}
                                  keywords={[eq.intern_number, eq.serial_number].filter((k): k is string => !!k)}
                                  key={eq.id}
                                  onSelect={() => field.onChange(toggleId(field.value, eq.id))}
                                  className={cn(
                                    !isAssigned && 'bg-warn-subtle text-warn-subtle-foreground hover:bg-warn-subtle'
                                  )}
                                >
                                  <div className="flex items-center justify-between w-full">
                                    <div className="flex items-center">
                                      <Check
                                        className={cn(
                                          'mr-2 h-4 w-4',
                                          !isAssigned && 'text-warn-subtle-foreground',
                                          field.value?.includes(eq.id) ? 'opacity-100' : 'opacity-0'
                                        )}
                                      />
                                      {eq.intern_number ?? eq.serial_number ?? 'Sin número'}
                                    </div>
                                    <div className="flex gap-1">
                                      <Badge
                                        variant="outline"
                                        className="ml-2 border-brand/30 bg-brand-subtle text-brand-subtle-foreground text-[10px]"
                                      >
                                        Otro Equipo
                                      </Badge>
                                      {!isAssigned && (
                                        <Badge
                                          variant="outline"
                                          className="ml-1 border-warn/40 bg-warn-subtle text-warn-subtle-foreground"
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

          {/* Selected other equipment badges */}
          {(field.value?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {field.value?.map((eqId) => {
                const eq = otherEquipment.find((e) => e.id === eqId);
                const remove = () => field.onChange((field.value ?? []).filter((id) => id !== eqId));
                if (!eq) {
                  // Ya guardado en la fila pero fuera de la lista de opciones (dado de baja o no
                  // operativo): se muestra igual para que se vea y se pueda quitar.
                  const saved = savedOtherEquipment.find((s) => s.id === eqId);
                  if (!saved) return null;
                  return (
                    <EquipmentChip
                      key={eqId}
                      className="border border-danger/40 bg-danger-subtle text-danger-subtle-foreground"
                      label={saved.intern_number ?? saved.serial_number ?? 'Sin número'}
                      removeName={saved.intern_number ?? saved.serial_number ?? 'equipo'}
                      onRemove={remove}
                      disabled={disabled}
                    >
                      <ChipBadge tone="danger">{saved.is_active ? 'No operativo' : 'Dado de baja'}</ChipBadge>
                    </EquipmentChip>
                  );
                }
                const isAssigned = eq.contractor_other_equipment?.some((ce) => ce.customers?.id === selectedCustomerId);
                return (
                  <EquipmentChip
                    key={eqId}
                    className={
                      isAssigned
                        ? 'border border-brand/30 bg-brand-subtle text-brand-subtle-foreground'
                        : 'border border-warn/40 bg-warn-subtle text-warn-subtle-foreground'
                    }
                    label={eq.intern_number ?? eq.serial_number ?? 'Sin número'}
                    removeName={eq.intern_number ?? eq.serial_number ?? 'equipo'}
                    onRemove={remove}
                  >
                    <ChipBadge tone="brand">Otro Equipo</ChipBadge>
                    {!isAssigned && <ChipBadge tone="warn">No asignado</ChipBadge>}
                  </EquipmentChip>
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
