import { useMemo } from 'react';
import { z } from 'zod';

const SERVICE_TYPES = ['mensual', 'adicional', 'adicional_permanente'] as const;

/**
 * Campos comunes al alta y a la edición. Es la fuente del tipo `DailyReportRowFormValues`
 * (ver `form-types.ts`): los campos que sólo existen en un modo se agregan allá como opcionales.
 */
const baseShape = {
  customer: z.string().min(1, 'El cliente es requerido'),
  services: z.string().min(1, 'El servicio es requerido'),
  item: z.string().min(1, 'El ítem es requerido'),
  working_day: z.string().min(1, 'La jornada es requerida'),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  employees: z.array(z.string()).optional(),
  equipment: z.array(z.string()).optional(),
  equipos_cliente: z.array(z.string()).max(2, 'Solo se pueden seleccionar 2 equipos cliente').optional(), // Opcional
  observations: z.string().optional(),
  sector_service_id: z.string().optional(), // Opcional — no todos los servicios tienen sectores
  areas_service_id: z.string().optional(), // Opcional — no todos los servicios tienen áreas
  remit_number: z.string().optional(),
  // Tipo de servicio: se arrastra desde la fila de origen al clonar/editar para
  // no perderlo en el insert. En la edición no tiene control propio.
  type_service: z.enum(SERVICE_TYPES).optional(),
};

export const rowFormBaseSchema = z.object(baseShape);

/** Alta: fecha y tipo de servicio obligatorios, y al menos un empleado o un equipo. */
const createRowFormSchema = z
  .object({
    ...baseShape,
    date: z.date({ required_error: 'La fecha es requerida' }),
    // En creación el tipo de servicio es obligatorio (evita filas sin tipo).
    type_service: z.enum(SERVICE_TYPES, {
      required_error: 'Debe seleccionar un tipo de servicio',
      invalid_type_error: 'Debe seleccionar un tipo de servicio',
    }),
  })
  .refine(
    (data) => {
      // Al menos 1 empleado O 1 equipo
      const hasEmployees = data.employees && data.employees.length > 0;
      const hasEquipment = data.equipment && data.equipment.length > 0;
      return hasEmployees || hasEquipment;
    },
    {
      message: 'Debe seleccionar al menos un empleado o un equipo',
      path: ['employees'],
    }
  );

/** Edición: el estado es obligatorio. */
const editRowFormSchema = z.object({
  ...baseShape,
  status: z.string().min(1, 'El estado es requerido'),
});

/** El schema cambia entre alta y edición; el tipo de los valores sale de `rowFormBaseSchema`. */
export function useFormSchema(isCreating: boolean) {
  return useMemo(() => (isCreating ? createRowFormSchema : editRowFormSchema), [isCreating]);
}
