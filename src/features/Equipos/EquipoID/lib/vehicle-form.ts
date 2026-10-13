import type { CompletenessSection } from '@/shared/components/common/FormCompleteness';

/**
 * Secciones del formulario del vehículo para el panel de completitud. El schema de este form
 * lleva refinamientos (no es un objeto plano), así que los obligatorios se declaran acá a mano:
 * son los que el schema exige siempre (`vehicleFormSchema` en `schemas/vehicle.ts`).
 */
export const VEHICLE_FORM_SECTIONS: readonly CompletenessSection[] = [
  {
    id: 'basic',
    title: 'Datos del equipo',
    fields: ['type_of_vehicle', 'brand', 'model', 'year', 'domain', 'chassis', 'owner_id', 'type_of_contract'],
  },
  { id: 'assignment', title: 'Asignación', fields: ['cost_type', 'sector', 'cost_center_id', 'allocated_to'] },
];

export const REQUIRED_VEHICLE_FIELDS: ReadonlySet<string> = new Set([
  'type_of_vehicle',
  'brand',
  'model',
  'year',
  'domain',
  'chassis',
  'cost_type',
  'sector',
]);
