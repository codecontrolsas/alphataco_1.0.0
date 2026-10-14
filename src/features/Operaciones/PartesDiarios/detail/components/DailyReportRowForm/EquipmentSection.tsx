'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { defaultFilter } from 'cmdk';
import { Check, ChevronsUpDown, Info, Truck, X } from 'lucide-react';
import { UseFormReturn } from 'react-hook-form';
import type { DailyReportRowForForm, OtherEquipmentItem, VehicleForForm } from '../../form-data.server';
import type { DailyReportRowFormValues } from './schema';

export type SavedOtherEquipment = NonNullable<
  NonNullable<DailyReportRowForForm>['dailyreportequipmentrelations'][number]['other_equipment']
>;

interface EquipmentSectionProps {
  form: UseFormReturn<DailyReportRowFormValues>;
  vehicles: VehicleForForm[];
  otherEquipment: OtherEquipmentItem[];
  /** Otros equipos ya guardados en la fila que se edita (incluye dados de baja / no operativos). */
  savedOtherEquipment?: SavedOtherEquipment[];
  selectedCustomerId: string | null;
  itemNeedsEquipment: boolean;
  selectedItemName: string;
  onOpenEquipmentSelector: () => void;
  disabled?: boolean;
}

export function EquipmentSection({
  form,
  vehicles,
  otherEquipment,
  savedOtherEquipment = [],
  selectedCustomerId,
  itemNeedsEquipment,
  selectedItemName,
  onOpenEquipmentSelector,
  disabled = false,
}: EquipmentSectionProps) {
  if (!itemNeedsEquipment) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Equipos propios</span>
        <div className="flex items-center gap-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
          <Info className="h-4 w-4 shrink-0" />
          <span>{selectedItemName} no requiere equipos</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Equipos propios (vehículos) */}
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
                            Los equipos en <span className="text-orange-600 font-medium">naranja</span> no están
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
                                        hasConditionIssue && 'text-danger-subtle-foreground bg-danger-subtle hover:bg-danger-subtle/80',
                                        !isAssigned &&
                                          !hasConditionIssue &&
                                          'text-orange-700 bg-orange-50 hover:bg-orange-100'
                                      )}
                                    >
                                      <div className="flex items-center justify-between w-full">
                                        <div className="flex items-center">
                                          <Check
                                            className={cn(
                                              'mr-2 h-4 w-4',
                                              hasConditionIssue && 'text-danger-subtle-foreground',
                                              !isAssigned && !hasConditionIssue && 'text-orange-600',
                                              field.value?.includes(vehicle.id) ? 'opacity-100' : 'opacity-0'
                                            )}
                                          />
                                          {vehicle.domain ?? vehicle.serie}
                                        </div>
                                        <div className="flex gap-1">
                                          {hasConditionIssue && (
                                            <Badge
                                              variant="outline"
                                              className="ml-2 bg-danger-subtle text-danger-subtle-foreground border-danger/30"
                                            >
                                              {conditionLabel}
                                            </Badge>
                                          )}
                                          {!isAssigned && (
                                            <Badge
                                              variant="outline"
                                              className="ml-2 bg-orange-100 text-orange-800 border-orange-300"
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1 shrink-0"
                onClick={onOpenEquipmentSelector}
                disabled={!selectedCustomerId}
                title="Seleccionar por característica"
              >
                <Truck className="h-4 w-4" />
              </Button>
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
                          ? 'bg-danger-subtle text-danger-subtle-foreground border border-danger/30'
                          : isAssigned
                            ? 'bg-primary/10 text-primary'
                            : 'bg-orange-100 text-orange-800 border border-orange-300'
                      )}
                    >
                      {vehicle.domain ?? vehicle.serie}
                      {hasConditionIssue && (
                        <Badge
                          variant="outline"
                          className="ml-1 bg-danger/20 text-danger-subtle-foreground border-danger/40 text-[10px] px-1 py-0"
                        >
                          {conditionLabel}
                        </Badge>
                      )}
                      {!isAssigned && (
                        <Badge
                          variant="outline"
                          className="ml-1 bg-orange-200 text-orange-900 border-orange-400 text-[10px] px-1 py-0"
                        >
                          No asignado
                        </Badge>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const newValues = (field.value ?? []).filter((id) => id !== vehicleId);
                          field.onChange(newValues);
                        }}
                        className="ml-1 hover:opacity-80"
                      >
                        <X className="h-3 w-3 text-danger-subtle-foreground" />
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

      {/* Otros Equipos Operativos */}
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
                        Los equipos en <span className="text-orange-600 font-medium">naranja</span> no están asignados
                        al cliente.
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
                                    onSelect={() => {
                                      const currentValues = field.value ?? [];
                                      const newValues = currentValues.includes(eq.id)
                                        ? currentValues.filter((id) => id !== eq.id)
                                        : [...currentValues, eq.id];
                                      field.onChange(newValues);
                                    }}
                                    className={cn(!isAssigned && 'text-orange-700 bg-orange-50 hover:bg-orange-100')}
                                  >
                                    <div className="flex items-center justify-between w-full">
                                      <div className="flex items-center">
                                        <Check
                                          className={cn(
                                            'mr-2 h-4 w-4',
                                            !isAssigned && 'text-orange-600',
                                            field.value?.includes(eq.id) ? 'opacity-100' : 'opacity-0'
                                          )}
                                        />
                                        {eq.intern_number ?? eq.serial_number ?? 'Sin número'}
                                      </div>
                                      <div className="flex gap-1">
                                        <Badge
                                          variant="outline"
                                          className="ml-2 bg-info-subtle text-info-subtle-foreground border-info/30 text-[10px]"
                                        >
                                          Otro Equipo
                                        </Badge>
                                        {!isAssigned && (
                                          <Badge
                                            variant="outline"
                                            className="ml-1 bg-orange-100 text-orange-800 border-orange-300"
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
                  if (!eq) {
                    // Ya guardado en la fila pero fuera de la lista de opciones (dado de baja o no
                    // operativo): se muestra igual para que se vea y se pueda quitar.
                    const saved = savedOtherEquipment.find((s) => s.id === eqId);
                    if (!saved) return null;
                    return (
                      <div
                        key={eqId}
                        className="text-xs px-2 py-1 rounded-md flex items-center gap-1 bg-danger-subtle text-danger-subtle-foreground border border-danger/30"
                      >
                        {saved.intern_number ?? saved.serial_number ?? 'Sin número'}
                        <Badge
                          variant="outline"
                          className="ml-1 bg-danger/20 text-danger-subtle-foreground border-danger/40 text-[10px] px-1 py-0"
                        >
                          {saved.is_active ? 'No operativo' : 'Dado de baja'}
                        </Badge>
                        <button
                          type="button"
                          aria-label={`Quitar ${saved.intern_number ?? saved.serial_number ?? 'equipo'}`}
                          onClick={() => field.onChange((field.value ?? []).filter((id) => id !== eqId))}
                          disabled={disabled}
                          className="ml-1 hover:opacity-80"
                        >
                          <X className="h-3 w-3 text-danger-subtle-foreground" />
                        </button>
                      </div>
                    );
                  }
                  const isAssigned = eq.contractor_other_equipment?.some(
                    (ce) => ce.customers?.id === selectedCustomerId
                  );
                  return (
                    <div
                      key={eqId}
                      className={cn(
                        'text-xs px-2 py-1 rounded-md flex items-center gap-1',
                        isAssigned
                          ? 'bg-info-subtle text-info-subtle-foreground border border-info/30'
                          : 'bg-orange-100 text-orange-800 border border-orange-300'
                      )}
                    >
                      {eq.intern_number ?? eq.serial_number ?? 'Sin número'}
                      <Badge
                        variant="outline"
                        className="ml-1 bg-blue-200 text-blue-900 border-blue-400 text-[10px] px-1 py-0"
                      >
                        Otro Equipo
                      </Badge>
                      {!isAssigned && (
                        <Badge
                          variant="outline"
                          className="ml-1 bg-orange-200 text-orange-900 border-orange-400 text-[10px] px-1 py-0"
                        >
                          No asignado
                        </Badge>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const newValues = (field.value ?? []).filter((id) => id !== eqId);
                          field.onChange(newValues);
                        }}
                        className="ml-1 hover:opacity-80"
                      >
                        <X className="h-3 w-3 text-danger-subtle-foreground" />
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
    </div>
  );
}
