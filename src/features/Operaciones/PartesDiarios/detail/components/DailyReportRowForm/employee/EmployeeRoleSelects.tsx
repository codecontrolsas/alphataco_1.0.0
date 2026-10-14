import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';
import type { EmployeeForForm } from '../../../form-data.server';
import { DeviationNotice, getSavedDeviationLabels, type DeviationContext } from './deviation';
import { EmployeeCommandList } from './EmployeeCommandList';
import { SelectedEmployeeItem } from './SelectedEmployeeItem';
import { isAssignedToCustomer } from './useEmployeeOptions';

interface EmployeeRoleSelectProps {
  employees: EmployeeForForm[];
  value: string | undefined;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  disabledEmployeeIds?: string[];
  selectedCustomerId: string | null;
  deviation: DeviationContext;
}

/** Selector de un solo empleado para un rol (chofer de día / de noche) */
export function EmployeeRoleSelect({
  employees,
  value,
  onChange,
  label,
  placeholder,
  disabledEmployeeIds = [],
  selectedCustomerId,
  deviation,
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
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
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
      {selected && <DeviationNotice labels={getSavedDeviationLabels(selected.id, deviation)} />}
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
  /** Rol que se muestra en cada persona elegida (ej. "Ayudante de día") */
  itemRoleLabel: string;
  deviation: DeviationContext;
}

/** Selector múltiple para roles que admiten varios empleados (ayudantes/ATG) */
export function EmployeeRoleMultiSelect({
  employees,
  value,
  onChange,
  label,
  placeholder,
  disabledEmployeeIds = [],
  selectedCustomerId,
  itemRoleLabel,
  deviation,
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
            {value.length > 0
              ? `${value.length} ayudante${value.length > 1 ? 's' : ''} seleccionado${value.length > 1 ? 's' : ''}`
              : placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
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

      {/* Personas elegidas */}
      {value.length > 0 && (
        <ul className="mt-1 space-y-2">
          {value.map((employeeId) => {
            const employee = employees.find((e) => e.id === employeeId);
            if (!employee) return null;
            return (
              <SelectedEmployeeItem
                key={employeeId}
                employee={employee}
                roleLabel={itemRoleLabel}
                isAssigned={isAssignedToCustomer(employee, selectedCustomerId)}
                deviationLabels={getSavedDeviationLabels(employeeId, deviation)}
                onRemove={() => onChange(value.filter((id) => id !== employeeId))}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
