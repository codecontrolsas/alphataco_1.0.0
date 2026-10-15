'use client';

import { useQueryClient } from '@tanstack/react-query';
import { getCustomerEmployeeAssignments, updateCustomerEmployeeAssignments } from '../../actions/assignments.server';
import { _CustomerEmployeesDataTable } from '../../employees/_CustomerEmployeesDataTable';
import { getAssignableEmployeeOptions } from '../../employees/actions.server';
import type { AssignmentChanges } from '../../lib/assignment-diff';
import { customerTabKey } from '../../lib/query-keys';
import { AssignmentDialog } from './AssignmentDialog';

interface CustomerEmployeesTabProps {
  customer: { id: string; name: string };
  canUpdate: boolean;
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

/**
 * Pestaña "Empleados": los afectados al cliente (tabla paginada en el servidor) y el modal de altas/bajas.
 * Las opciones del modal son solo los empleados activos y se piden al abrirlo; el baseline sale de la base.
 */
export function CustomerEmployeesTab({ customer, canUpdate }: CustomerEmployeesTabProps) {
  const queryClient = useQueryClient();

  const loadOptions = async () => {
    const employees = await getAssignableEmployeeOptions();
    return employees.map((employee) => ({
      value: employee.id,
      label: `[${employee.file}] ${capitalize(employee.lastname)} ${capitalize(employee.firstname)}`,
    }));
  };

  const saveAssignments = (changes: AssignmentChanges) => updateCustomerEmployeeAssignments(customer.id, changes);

  const refreshAfterSave = () => {
    queryClient.invalidateQueries({ queryKey: customerTabKey(customer.id, 'employees') });
    queryClient.invalidateQueries({ queryKey: customerTabKey(customer.id, 'summary') });
  };

  return (
    <div className="space-y-4 rounded-lg border p-4 sm:p-6">
      <h3 className="text-xl font-semibold">Empleados del cliente</h3>
      <_CustomerEmployeesDataTable
        customerId={customer.id}
        toolbarActions={
          canUpdate ? (
            <AssignmentDialog
              triggerLabel="Cargar empleados"
              title="Seleccionar empleados"
              description={`Asigná los empleados que trabajan para ${customer.name}.`}
              fieldLabel="Empleados"
              placeholder="Buscar por legajo o nombre..."
              emptyMessage="No se encontraron empleados"
              loadOptions={loadOptions}
              nouns={{ singular: 'empleado', plural: 'empleados' }}
              loadBaseline={() => getCustomerEmployeeAssignments(customer.id)}
              save={saveAssignments}
              onSaved={refreshAfterSave}
            />
          ) : undefined
        }
      />
    </div>
  );
}
