'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { ChevronsUpDown } from 'lucide-react';
import { UseFormReturn } from 'react-hook-form';
import type { EmployeeDeviation } from '../../../actions/validation.server';
import type { EmployeeForForm } from '../../form-data.server';
import { getSavedDeviationLabels, type DeviationContext } from './employee/deviation';
import { EmployeeCommandList } from './employee/EmployeeCommandList';
import { EmployeeRoleMultiSelect, EmployeeRoleSelect } from './employee/EmployeeRoleSelects';
import { SelectedEmployeeItem } from './employee/SelectedEmployeeItem';
import { isAssignedToCustomer } from './employee/useEmployeeOptions';
import type { DailyReportRowFormValues } from './schema';

interface EmployeeSectionProps {
  form: UseFormReturn<DailyReportRowFormValues>;
  employees: EmployeeForForm[];
  selectedCustomerId: string | null;
  disabled?: boolean;
  /** Fila que se edita. Sin ella (alta) no hay avisos de desvío. */
  rowId?: string | null;
  /** Empleados ya guardados en la fila: solo de ellos se muestran avisos de desvío. */
  savedEmployeeIds?: string[];
  getEmployeeDeviation?: (employeeId: string, rowId: string) => EmployeeDeviation | null;
}

export function EmployeeSection({
  form,
  employees,
  selectedCustomerId,
  disabled = false,
  rowId = null,
  savedEmployeeIds = [],
  getEmployeeDeviation,
}: EmployeeSectionProps) {
  const deviation: DeviationContext = { rowId, savedEmployeeIds, getEmployeeDeviation };
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
      <section aria-labelledby="row-form-personnel" className="space-y-4 rounded-lg border bg-card p-4">
        <h3 id="row-form-personnel" className="text-sm font-semibold text-foreground">
          Personal
          <span className="text-muted-foreground font-normal">
            {is12Hours ? ' · Jornada 12 horas' : ' · Jornada 24 horas'}
          </span>
        </h3>

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
                    deviation={deviation}
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
                    itemRoleLabel="Ayudante de día"
                    disabledEmployeeIds={
                      [choferDiaId, choferNocheId, ...ayudanteNocheIds].filter(Boolean) as string[]
                    }
                    selectedCustomerId={selectedCustomerId}
                    deviation={deviation}
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
                    deviation={deviation}
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
                    itemRoleLabel="Ayudante de noche"
                    disabledEmployeeIds={
                      [choferDiaId, choferNocheId, ...ayudanteDiaIds].filter(Boolean) as string[]
                    }
                    selectedCustomerId={selectedCustomerId}
                    deviation={deviation}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

      </section>
    );
  }

  // Standard multi-select for other shift types
  return (
    <section aria-labelledby="row-form-personnel" className="space-y-4 rounded-lg border bg-card p-4">
      <h3 id="row-form-personnel" className="text-sm font-semibold text-foreground">
        Personal
      </h3>
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
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
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
          </div>

          {/* Personas elegidas */}
          {selectedEmployeeIds.length > 0 && (
            <ul className="mt-2 space-y-2">
              {selectedEmployeeIds.map((employeeId) => {
                const employee = employees.find((e) => e.id === employeeId);
                if (!employee) return null;
                return (
                  <SelectedEmployeeItem
                    key={employeeId}
                    employee={employee}
                    roleLabel={employee.company_positions?.name ?? 'Sin posición'}
                    isAssigned={isAssignedToCustomer(employee, selectedCustomerId)}
                    deviationLabels={getSavedDeviationLabels(employeeId, deviation)}
                    onRemove={() => field.onChange((field.value ?? []).filter((id) => id !== employeeId))}
                  />
                );
              })}
            </ul>
          )}

          <FormMessage />
        </FormItem>
      )}
    />
    </section>
  );
}
