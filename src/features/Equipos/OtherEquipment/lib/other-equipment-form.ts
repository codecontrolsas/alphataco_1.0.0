import type { CompletenessSection } from '@/shared/components/common/FormCompleteness';

/**
 * Secciones del formulario del equipamiento para el panel de completitud. El schema lleva
 * refinamientos asíncronos (no es un objeto plano), así que los obligatorios se declaran acá:
 * el tipo siempre, y la certificación cuando `has_certification` está activo (ese caso lo
 * valida el schema y se muestra en el aviso de errores).
 */
export const OTHER_EQUIPMENT_FORM_SECTIONS: readonly CompletenessSection[] = [
  {
    id: 'basic',
    title: 'Datos del equipo',
    fields: [
      'type_id',
      'sub_type_id',
      'brand_id',
      'model_id',
      'serial_number',
      'intern_number',
      'owner_id',
      'type_of_contract',
      'certification_expiration_date',
      'certification_number',
    ],
  },
  { id: 'assignment', title: 'Asignación', fields: ['cost_type', 'sector', 'cost_center_id', 'contractors'] },
];

export const REQUIRED_OTHER_EQUIPMENT_FIELDS: ReadonlySet<string> = new Set(['type_id']);
