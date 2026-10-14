import {
  getActiveEmployeesForRowForm,
  getActiveEquipmentsForRowForm,
} from '@/features/Operaciones/PartesDiarios/actions/comercial-rows.server';
import { useQuery } from '@tanstack/react-query';
import { Info, Users } from 'lucide-react';
import { useMemo } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { DailyReportRowFormValues } from '../form-types';
import { ResourceMultiSelectField, type ResourceOption } from './ResourceMultiSelectField';

type ResourcesSectionProps = {
  form: UseFormReturn<DailyReportRowFormValues>;
  isCreating: boolean;
  /** La sección no lee la fila; se acepta para mantener la firma del formulario. */
  selectedRow: { id?: string; status?: string | null } | null;
  disabled?: boolean;
  itemNeedsPersonnel?: boolean;
  itemNeedsEquipment?: boolean;
  itemName?: string;
};

/** Aviso de que el ítem seleccionado no requiere ese tipo de recurso. */
function NotRequiredNotice({ label, message }: { label: string; message: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
        <Info className="h-4 w-4 shrink-0" />
        <span>{message}</span>
      </div>
    </div>
  );
}

export function ResourcesSection({
  form,
  disabled,
  itemNeedsPersonnel,
  itemNeedsEquipment,
  itemName,
}: ResourcesSectionProps) {
  const needsPersonnel = itemNeedsPersonnel ?? true;
  const needsEquipment = itemNeedsEquipment ?? true;

  // Fetch employees con useQuery (solo si el item requiere personal)
  const { data: employees = [], isLoading: isLoadingEmployees } = useQuery({
    queryKey: ['active-employees'],
    queryFn: getActiveEmployeesForRowForm,
    staleTime: 5 * 60 * 1000, // 5 minutos
    enabled: needsPersonnel,
  });

  // Fetch equipments con useQuery (solo si el item requiere equipos)
  const { data: equipments = [], isLoading: isLoadingEquipments } = useQuery({
    queryKey: ['active-equipments'],
    queryFn: getActiveEquipmentsForRowForm,
    staleTime: 5 * 60 * 1000, // 5 minutos
    enabled: needsEquipment,
  });

  const employeeOptions = useMemo<ResourceOption[]>(
    () =>
      employees.map((employee) => ({
        id: employee.id,
        label: `${employee.firstname} ${employee.lastname}`,
        isActive: employee.is_active !== false,
      })),
    [employees]
  );

  const equipmentOptions = useMemo<ResourceOption[]>(
    () =>
      equipments.map((equipment) => ({
        id: equipment.id,
        label: equipment.domain || equipment.intern_number || 'Sin identificación',
        isActive: equipment.is_active !== false,
      })),
    [equipments]
  );

  const sectionTitle =
    needsPersonnel && needsEquipment
      ? 'Recursos Empresa (Al menos 1 empleado O 1 equipo)'
      : needsPersonnel
        ? 'Recursos Empresa (Personal requerido)'
        : needsEquipment
          ? 'Recursos Empresa (Equipo requerido)'
          : 'Recursos Empresa';

  const displayItemName = itemName || 'El item seleccionado';

  return (
    <div className="space-y-4 rounded-lg dark:bg-slate-900 bg-slate-50 p-4 w-full">
      <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
        <Users className="h-4 w-4" />
        {sectionTitle}
      </h4>
      <div className="grid grid-cols-1 gap-4 w-full">
        {needsPersonnel ? (
          <ResourceMultiSelectField
            form={form}
            name="employees"
            label="Empleados"
            noun={{ singular: 'empleado', plural: 'empleados' }}
            options={employeeOptions}
            isLoading={isLoadingEmployees}
            disabled={disabled}
          />
        ) : (
          <NotRequiredNotice label="Empleados" message={`${displayItemName} no requiere personal`} />
        )}

        {needsEquipment ? (
          <ResourceMultiSelectField
            form={form}
            name="equipment"
            label="Equipos Empresa"
            noun={{ singular: 'equipo', plural: 'equipos' }}
            options={equipmentOptions}
            isLoading={isLoadingEquipments}
            disabled={disabled}
          />
        ) : (
          <NotRequiredNotice label="Equipos Empresa" message={`${displayItemName} no requiere equipos`} />
        )}
      </div>
    </div>
  );
}
