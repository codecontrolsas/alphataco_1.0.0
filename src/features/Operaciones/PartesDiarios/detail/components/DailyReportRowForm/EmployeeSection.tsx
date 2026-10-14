'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, Users, X } from 'lucide-react';
import { useState } from 'react';
import { UseFormReturn } from 'react-hook-form';
import type { EmployeeForForm } from '../../form-data.server';
import type { DailyReportRowFormValues } from './schema';

interface EmployeeSectionProps {
  form: UseFormReturn<DailyReportRowFormValues>;
  employees: EmployeeForForm[];
  selectedCustomerId: string | null;
  onOpenEmployeeSelector: () => void;
  disabled?: boolean;
}

interface EmployeeCommandListProps {
  employees: EmployeeForForm[];
  selectedCustomerId: string | null;
  disabledEmployeeIds: string[];
  emptyMessage?: string;
  isSelected: (employeeId: string) => boolean;
  onToggle: (employeeId: string) => void;
}

/** Lista de empleados agrupada por puesto, compartida por todos los selectores de la sección */
function EmployeeCommandList({
  employees,
  selectedCustomerId,
  disabledEmployeeIds,
  emptyMessage = 'No se encontraron empleados.',
  isSelected,
  onToggle,
}: EmployeeCommandListProps) {
  return (
    <Command>
      <CommandInput placeholder="Buscar por legajo o nombre..." className="h-9" />
      <CommandList>
        <CommandEmpty>{emptyMessage}</CommandEmpty>
        {selectedCustomerId && (
          <div className="px-3 py-1.5 text-xs text-muted-foreground">
            Los empleados en naranja no están asignados al cliente seleccionado.
          </div>
        )}
        {(() => {
          const positionsMap: Record<string, EmployeeForForm[]> = {};
          employees.forEach((employee) => {
            const position = employee.company_positions?.name ?? 'Sin posición';
            if (!positionsMap[position]) positionsMap[position] = [];
            positionsMap[position].push(employee);
          });

          return Object.keys(positionsMap)
            .sort()
            .map((position) => (
              <CommandGroup key={position} heading={position.charAt(0).toUpperCase() + position.slice(1)}>
                {positionsMap[position].map((employee) => {
                  const isDisabled = disabledEmployeeIds.includes(employee.id);
                  const isAssigned = employee.contractor_employee?.some(
                    (ce) => ce.customers?.id === selectedCustomerId
                  );
                  return (
                    <CommandItem
                      value={`${employee.file} ${employee.lastname} ${employee.firstname}`}
                      key={employee.id}
                      disabled={isDisabled}
                      onSelect={() => {
                        if (isDisabled) return;
                        onToggle(employee.id);
                      }}
                      className={cn(
                        isDisabled && 'opacity-50 cursor-not-allowed',
                        !isAssigned && 'text-orange-700 bg-orange-50 hover:bg-orange-100'
                      )}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center">
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              !isAssigned && 'text-orange-600',
                              isSelected(employee.id) ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          [{employee.file}] {employee.lastname} {employee.firstname}
                        </div>
                        {!isAssigned && (
                          <Badge variant="outline" className="ml-2 bg-orange-100 text-orange-800 border-orange-300">
                            No asignado
                          </Badge>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ));
        })()}
      </CommandList>
    </Command>
  );
}

interface EmployeeRoleSelectProps {
  employees: EmployeeForForm[];
  value: string | undefined;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  disabledEmployeeIds?: string[];
  selectedCustomerId: string | null;
}

function EmployeeRoleSelect({
  employees,
  value,
  onChange,
  label,
  placeholder,
  disabledEmployeeIds = [],
  selectedCustomerId,
}: EmployeeRoleSelectProps) {
  const [open, setOpen] = useState(false);

  const selected = employees.find((e) => e.id === value);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            className={cn('w-full justify-between', !value && 'text-muted-foreground')}
          >
            {selected ? `[${selected.file}] ${selected.lastname} ${selected.firstname}` : placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-full p-0">
          <EmployeeCommandList
            employees={employees}
            selectedCustomerId={selectedCustomerId}
            disabledEmployeeIds={disabledEmployeeIds}
            isSelected={(id) => id === value}
            onToggle={(id) => {
              onChange(id);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

interface EmployeeRoleMultiSelectProps {
  employees: EmployeeForForm[];
  value: string[];
  onChange: (value: string[]) => void;
  label: string;
  placeholder: string;
  disabledEmployeeIds?: string[];
  selectedCustomerId: string | null;
}

/** Selector múltiple para roles que admiten varios empleados (ayudantes/ATG) */
function EmployeeRoleMultiSelect({
  employees,
  value,
  onChange,
  label,
  placeholder,
  disabledEmployeeIds = [],
  selectedCustomerId,
}: EmployeeRoleMultiSelectProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            className={cn('w-full justify-between', value.length === 0 && 'text-muted-foreground')}
          >
            {value.length > 0 ? `${value.length} ayudante${value.length > 1 ? 's' : ''} seleccionado${value.length > 1 ? 's' : ''}` : placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-full p-0">
          <EmployeeCommandList
            employees={employees}
            selectedCustomerId={selectedCustomerId}
            disabledEmployeeIds={disabledEmployeeIds}
            isSelected={(id) => value.includes(id)}
            onToggle={(id) => {
              onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
            }}
          />
        </PopoverContent>
      </Popover>

      {/* Badges de empleados seleccionados */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-1">
          {value.map((employeeId) => {
            const employee = employees.find((e) => e.id === employeeId);
            if (!employee) return null;
            const isAssigned = employee.contractor_employee?.some((ce) => ce.customers?.id === selectedCustomerId);
            return (
              <div
                key={employeeId}
                className={cn(
                  'text-xs px-2 py-1 rounded-md flex items-center gap-1',
                  isAssigned ? 'bg-primary/10 text-primary' : 'bg-orange-100 text-orange-800 border border-orange-300'
                )}
              >
                [{employee.file}] {employee.lastname} {employee.firstname}
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
                  onClick={() => onChange(value.filter((id) => id !== employeeId))}
                  className="ml-1 hover:opacity-80"
                >
                  <X className="h-3 w-3 text-danger-subtle-foreground" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function EmployeeSection({
  form,
  employees,
  selectedCustomerId,
  onOpenEmployeeSelector,
  disabled = false,
}: EmployeeSectionProps) {
  // El turno (Día/Noche) de la jornada 12h se persiste como campo propio del form
  // (`shift_12h`), por lo que se recuerda aunque la fila no tenga personal asignado.
  // El valor lo carga el form al editar (ver index.tsx); acá solo lo leemos/escribimos.
  const shiftSelection: 'dia' | 'noche' = form.watch('shift_12h') ?? 'dia';
  const setShiftSelection = (value: 'dia' | 'noche') => form.setValue('shift_12h', value);

  const workingDayValue = form.watch('working_day')?.toLowerCase() ?? '';
  const is12Hours = workingDayValue === 'jornada 12 horas';
  const is24Hours = workingDayValue === 'jornada 24 horas';
  const hasRoleFields = is12Hours || is24Hours;

  const choferDiaId = form.watch('chofer_dia');
  const choferNocheId = form.watch('chofer_noche');
  const ayudanteDiaIds = form.watch('ayudante_dia') ?? [];
  const ayudanteNocheIds = form.watch('ayudante_noche') ?? [];

  const selectedEmployeeIds = form.watch('employees') ?? [];

  if (hasRoleFields) {
    return (
      <div className="space-y-4">
        <div className="text-sm font-medium text-muted-foreground mb-2">
          {is12Hours ? 'Asignación de Personal — Jornada 12 Horas' : 'Asignación de Personal — Jornada 24 Horas'}
        </div>

        {/* Selector Día/Noche para Jornada 12h */}
        {is12Hours && (
          <div className="flex flex-row gap-4 items-center">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={shiftSelection === 'dia'}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setShiftSelection('dia');
                    form.setValue('chofer_noche', '');
                    form.setValue('ayudante_noche', []);
                  }
                }}
              />
              <span className="text-sm font-normal">Día</span>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={shiftSelection === 'noche'}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setShiftSelection('noche');
                    form.setValue('chofer_dia', '');
                    form.setValue('ayudante_dia', []);
                  }
                }}
              />
              <span className="text-sm font-normal">Noche</span>
            </div>
          </div>
        )}

        {/* Turno Día */}
        {(!is12Hours || shiftSelection === 'dia') && (
          <>
            <FormField
              control={form.control}
              name="chofer_dia"
              render={({ field }) => (
                <FormItem>
                  <EmployeeRoleSelect
                    employees={employees}
                    value={field.value}
                    onChange={field.onChange}
                    label="Chofer de Día"
                    placeholder="Seleccionar chofer de día"
                    disabledEmployeeIds={
                      [choferNocheId, ...ayudanteDiaIds, ...ayudanteNocheIds].filter(Boolean) as string[]
                    }
                    selectedCustomerId={selectedCustomerId}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="ayudante_dia"
              render={({ field }) => (
                <FormItem>
                  <EmployeeRoleMultiSelect
                    employees={employees}
                    value={field.value ?? []}
                    onChange={field.onChange}
                    label="Ayudantes de Día (opcional)"
                    placeholder="Seleccionar ayudantes de día"
                    disabledEmployeeIds={
                      [choferDiaId, choferNocheId, ...ayudanteNocheIds].filter(Boolean) as string[]
                    }
                    selectedCustomerId={selectedCustomerId}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

        {/* Turno Noche */}
        {(is24Hours || (is12Hours && shiftSelection === 'noche')) && (
          <>
            <FormField
              control={form.control}
              name="chofer_noche"
              render={({ field }) => (
                <FormItem>
                  <EmployeeRoleSelect
                    employees={employees}
                    value={field.value}
                    onChange={field.onChange}
                    label="Chofer de Noche"
                    placeholder="Seleccionar chofer de noche"
                    disabledEmployeeIds={
                      [choferDiaId, ...ayudanteDiaIds, ...ayudanteNocheIds].filter(Boolean) as string[]
                    }
                    selectedCustomerId={selectedCustomerId}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="ayudante_noche"
              render={({ field }) => (
                <FormItem>
                  <EmployeeRoleMultiSelect
                    employees={employees}
                    value={field.value ?? []}
                    onChange={field.onChange}
                    label="Ayudantes de Noche (opcional)"
                    placeholder="Seleccionar ayudantes de noche"
                    disabledEmployeeIds={
                      [choferDiaId, choferNocheId, ...ayudanteDiaIds].filter(Boolean) as string[]
                    }
                    selectedCustomerId={selectedCustomerId}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={onOpenEmployeeSelector}>
          <Users className="h-4 w-4" />
          Seleccionar por característica
        </Button>
      </div>
    );
  }

  // Standard multi-select for other shift types
  return (
    <FormField
      control={form.control}
      name="employees"
      render={({ field }) => (
        <FormItem className="flex flex-col">
          <FormLabel>Empleados</FormLabel>
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
                      ? `${field.value.length} empleado${field.value.length > 1 ? 's' : ''} seleccionado${field.value.length > 1 ? 's' : ''}`
                      : selectedCustomerId
                        ? 'Seleccionar empleados'
                        : 'Seleccione un cliente primero'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-full p-0">
                <EmployeeCommandList
                  employees={selectedCustomerId ? employees : []}
                  selectedCustomerId={selectedCustomerId}
                  disabledEmployeeIds={[]}
                  emptyMessage={
                    !selectedCustomerId
                      ? 'Seleccione un cliente primero.'
                      : employees.length === 0
                        ? 'No hay empleados activos disponibles.'
                        : 'No se encontraron empleados que coincidan.'
                  }
                  isSelected={(id) => field.value?.includes(id) ?? false}
                  onToggle={(id) => {
                    const currentValues = field.value ?? [];
                    const newValues = currentValues.includes(id)
                      ? currentValues.filter((v) => v !== id)
                      : [...currentValues, id];
                    field.onChange(newValues);
                  }}
                />
              </PopoverContent>
            </Popover>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1 shrink-0"
              onClick={onOpenEmployeeSelector}
              disabled={!selectedCustomerId}
              title="Seleccionar por característica"
            >
              <Users className="h-4 w-4" />
            </Button>
          </div>

          {/* Selected employees badges */}
          {selectedEmployeeIds.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {selectedEmployeeIds.map((employeeId) => {
                const employee = employees.find((e) => e.id === employeeId);
                if (!employee) return null;
                const isAssigned = employee.contractor_employee?.some((ce) => ce.customers?.id === selectedCustomerId);
                return (
                  <div
                    key={employeeId}
                    className={cn(
                      'text-xs px-2 py-1 rounded-md flex items-center gap-1',
                      isAssigned
                        ? 'bg-primary/10 text-primary'
                        : 'bg-orange-100 text-orange-800 border border-orange-300'
                    )}
                  >
                    [{employee.file}] {employee.lastname} {employee.firstname}
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
                        const newValues = (field.value ?? []).filter((id) => id !== employeeId);
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
  );
}
