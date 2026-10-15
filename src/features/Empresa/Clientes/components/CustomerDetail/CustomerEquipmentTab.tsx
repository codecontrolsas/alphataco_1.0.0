'use client';

import { useQueryClient } from '@tanstack/react-query';
import { getCustomerEquipmentAssignments, updateCustomerEquipmentAssignments } from '../../actions/assignments.server';
import { _CustomerEquipmentDataTable } from '../../equipment/_CustomerEquipmentDataTable';
import { getAssignableEquipmentOptions } from '../../equipment/actions.server';
import type { AssignmentChanges } from '../../lib/assignment-diff';
import { customerTabKey } from '../../lib/query-keys';
import { AssignmentDialog } from './AssignmentDialog';

interface CustomerEquipmentTabProps {
  customer: { id: string; name: string };
  canUpdate: boolean;
}

/**
 * Pestaña "Equipos afectados": equipos DE LA EMPRESA asignados a este cliente (tabla paginada en el
 * servidor) y el modal de altas/bajas. Mismo patrón que Empleados.
 */
export function CustomerEquipmentTab({ customer, canUpdate }: CustomerEquipmentTabProps) {
  const queryClient = useQueryClient();

  const loadOptions = async () => {
    const equipment = await getAssignableEquipmentOptions();
    return equipment.map((vehicle) => ({
      value: vehicle.id,
      label:
        [vehicle.intern_number, vehicle.domain].filter(Boolean).join(' - ') +
          (vehicle.type_vehicles_typeTotype?.name ? ` (${vehicle.type_vehicles_typeTotype.name})` : '') || vehicle.id,
    }));
  };

  const saveAssignments = (changes: AssignmentChanges) => updateCustomerEquipmentAssignments(customer.id, changes);

  const refreshAfterSave = () => {
    queryClient.invalidateQueries({ queryKey: customerTabKey(customer.id, 'equipment') });
    queryClient.invalidateQueries({ queryKey: customerTabKey(customer.id, 'summary') });
  };

  return (
    <div className="space-y-4 rounded-lg border p-4 sm:p-6">
      <h3 className="text-xl font-semibold">Equipos afectados al cliente</h3>
      <_CustomerEquipmentDataTable
        customerId={customer.id}
        toolbarActions={
          canUpdate ? (
            <AssignmentDialog
              triggerLabel="Asignar equipos"
              title="Seleccionar equipos"
              description={`Asigná los equipos que trabajan para ${customer.name}.`}
              fieldLabel="Equipos"
              placeholder="Buscar equipos..."
              emptyMessage="No se encontraron equipos"
              loadOptions={loadOptions}
              nouns={{ singular: 'equipo', plural: 'equipos' }}
              loadBaseline={() => getCustomerEquipmentAssignments(customer.id)}
              save={saveAssignments}
              onSaved={refreshAfterSave}
            />
          ) : undefined
        }
      />
    </div>
  );
}
