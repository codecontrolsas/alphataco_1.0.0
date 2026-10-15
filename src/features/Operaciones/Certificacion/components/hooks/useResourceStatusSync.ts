import { useEffect } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { DailyReportRowFormValues } from '../form-types';

type ServiceItemFlags = {
  id: string;
  needs_personnel?: boolean | null;
  needs_equipment?: boolean | null;
};

/**
 * Cambio automático de estado según los recursos asignados (sólo en edición):
 * "sin_recursos_asignados" <-> "pendiente" cuando se completan o se quitan los recursos
 * que exige el ítem. Es una suscripción al form (sistema externo), por eso va en un efecto.
 */
export function useResourceStatusSync(
  form: UseFormReturn<DailyReportRowFormValues>,
  isCreating: boolean,
  serviceItems: ServiceItemFlags[] | undefined
) {
  useEffect(() => {
    if (isCreating) return;

    const subscription = form.watch((value, { name }) => {
      // Solo actuar si cambian los recursos o el item
      if (name !== 'employees' && name !== 'equipment' && name !== 'item') return;

      const employees = value.employees || [];
      const equipment = value.equipment || [];
      const currentStatus = value.status;

      // Obtener los flags del item seleccionado
      const selectedItem = serviceItems?.find((item) => item.id === value.item);
      const itemNeedsPersonnel = selectedItem?.needs_personnel ?? true;
      const itemNeedsEquipment = selectedItem?.needs_equipment ?? true;

      // Solo considerar falta de recursos si el item los requiere
      const missingRequiredResources =
        (itemNeedsPersonnel && employees.length === 0) || (itemNeedsEquipment && equipment.length === 0);

      // Si está en "sin_recursos_asignados" y ahora tiene los recursos requeridos -> cambiar a "pendiente"
      if (currentStatus === 'sin_recursos_asignados' && !missingRequiredResources) {
        form.setValue('status', 'pendiente', { shouldValidate: true });
      }
      // Si está en "pendiente" y ya no tiene los recursos requeridos -> cambiar a "sin_recursos_asignados"
      else if (currentStatus === 'pendiente' && missingRequiredResources) {
        form.setValue('status', 'sin_recursos_asignados', { shouldValidate: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [form, isCreating, serviceItems]);
}
