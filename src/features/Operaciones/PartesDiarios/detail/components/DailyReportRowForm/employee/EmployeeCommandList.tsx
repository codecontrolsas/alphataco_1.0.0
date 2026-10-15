import { Badge } from '@/components/ui/badge';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import type { EmployeeForForm } from '../../../form-data.server';
import { isAssignedToCustomer, useEmployeePositionGroups } from './useEmployeeOptions';

interface EmployeeCommandListProps {
  employees: EmployeeForForm[];
  selectedCustomerId: string | null;
  disabledEmployeeIds: string[];
  emptyMessage?: string;
  isSelected: (employeeId: string) => boolean;
  onToggle: (employeeId: string) => void;
}

/** Lista de empleados agrupada por puesto, compartida por todos los selectores de la sección */
export function EmployeeCommandList({
  employees,
  selectedCustomerId,
  disabledEmployeeIds,
  emptyMessage = 'No se encontraron empleados.',
  isSelected,
  onToggle,
}: EmployeeCommandListProps) {
  const groups = useEmployeePositionGroups(employees);

  return (
    <Command>
      <CommandInput placeholder="Buscar por legajo o nombre..." className="h-9" />
      <CommandList>
        <CommandEmpty>{emptyMessage}</CommandEmpty>
        {selectedCustomerId && (
          <div className="px-3 py-1.5 text-xs text-muted-foreground">
            Los empleados resaltados con el aviso "No asignado" no están asignados al cliente seleccionado.
          </div>
        )}
        {groups.map((group) => (
          <CommandGroup key={group.position} heading={group.heading}>
            {group.employees.map((employee) => {
              const isDisabled = disabledEmployeeIds.includes(employee.id);
              const isAssigned = isAssignedToCustomer(employee, selectedCustomerId);
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
                    !isAssigned && 'bg-warn-subtle text-warn-subtle-foreground hover:bg-warn-subtle'
                  )}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center">
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          !isAssigned && 'text-warn-subtle-foreground',
                          isSelected(employee.id) ? 'opacity-100' : 'opacity-0'
                        )}
                        aria-hidden="true"
                      />
                      [{employee.file}] {employee.lastname} {employee.firstname}
                    </div>
                    {!isAssigned && (
                      <Badge variant="outline" className="ml-2 border-warn/40 bg-warn-subtle text-warn-subtle-foreground">
                        No asignado
                      </Badge>
                    )}
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
}
