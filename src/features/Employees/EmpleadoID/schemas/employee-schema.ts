import { z } from 'zod';
import {
  contactDataSchema,
  optionalUuid,
  personalDataSchema,
  requiredUuid,
  UUID_PATTERN,
} from '../../shared/schemas/person-data-schemas';

/**
 * Schemas del legajo de empleado.
 *
 * Viven fuera de `components/forms/employee-form.tsx` (que es `'use client'`) para que
 * tambien puedan usarse desde el servidor: si se importa un schema Zod desde un modulo
 * de cliente, Next lo entrega como referencia de cliente y `.parse()` no existe en el
 * servidor (falla en runtime, no en `check-types`). La conversion de un candidato en
 * legajo (ticket 505) valida con estos schemas del lado del servidor.
 */

/**
 * Datos Laborales del legajo. Se exporta por separado porque la conversion de un
 * candidato en empleado reutiliza exactamente esta seccion: son los campos que se
 * completan recien al dar el OK.
 */
export const employeeWorkDataSchema = z.object({
  file: z.string().trim().min(1, 'Legajo es requerido').max(50, 'Legajo demasiado largo'),
  hierarchical_position: requiredUuid('Sector es requerido'),
  company_position: requiredUuid('Puesto en la empresa es requerido'),
  workflow_diagram: requiredUuid('Diagrama de trabajo es requerido'),
  normal_hours: z.string().max(20, 'Horas normales inválidas').optional(),
  type_of_contract: optionalUuid,
  // En el ALTA son el conjunto inicial. En la EDICION el servidor las ignora: se usan los
  // deltas de `employeeUpdateSchema` (`allocation_changes`, `aptitude_changes`, ...).
  aptitudes: z.array(z.string().regex(UUID_PATTERN, 'Valor inválido')).max(200).optional(),
  allocated_to: z.array(z.string().regex(UUID_PATTERN, 'Valor inválido')).max(500).optional(),
  date_of_admission: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de ingreso inválida')
    .optional()
    .or(z.literal('')),
  guild_id: optionalUuid,
  covenants_id: optionalUuid,
  category_id: optionalUuid,
  cost_center_id: optionalUuid,
  cost_type: z.string().max(50).optional(),
  workshop_sector_ids: z.array(z.string().regex(UUID_PATTERN, 'Valor inválido')).max(200).optional(),
});

export type EmployeeWorkDataValues = z.infer<typeof employeeWorkDataSchema>;

// Datos personales y de contacto se comparten con el candidato — unica fuente de verdad
// en shared/schemas/person-data-schemas.ts
export const employeeFormSchema = personalDataSchema.merge(contactDataSchema).merge(employeeWorkDataSchema);

export type EmployeeFormData = z.infer<typeof employeeFormSchema>;

/**
 * Cambios explícitos sobre una relación M:M al EDITAR un legajo: ids a agregar y a quitar.
 * La ausencia de un id NO significa baja: el servidor nunca borra "por diferencia", porque
 * una pestaña con el formulario abierto desde antes pisaría las afectaciones hechas mientras
 * tanto desde otra pantalla (ej. Comercial → Clientes).
 */
export const relationChangesSchema = z.object({
  add: z.array(z.string().regex(UUID_PATTERN, 'Valor inválido')).max(500),
  remove: z.array(z.string().regex(UUID_PATTERN, 'Valor inválido')).max(500),
});

export type RelationChanges = z.infer<typeof relationChangesSchema>;

/**
 * Payload de `updateEmployee`: los datos del legajo más los deltas de las M:M.
 * En edición `allocated_to` / `aptitudes` / `workshop_sector_ids` se ignoran (solo sirven para
 * el alta); lo que se aplica son estos tres campos, calculados por el cliente contra la
 * línea base que cargó al abrir el formulario.
 */
export const employeeUpdateSchema = employeeFormSchema.extend({
  allocation_changes: relationChangesSchema.optional(),
  aptitude_changes: relationChangesSchema.optional(),
  workshop_sector_changes: relationChangesSchema.optional(),
});

export type EmployeeUpdateData = z.infer<typeof employeeUpdateSchema>;
