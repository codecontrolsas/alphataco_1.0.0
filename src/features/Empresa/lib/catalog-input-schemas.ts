import { z } from 'zod';

/**
 * Esquemas de entrada de las mutaciones de los catálogos de Configuración.
 *
 * Módulo SIN directiva: lo importan las Server Actions (`actions.server.ts`) y cualquier formulario
 * que quiera reutilizarlos. Validan forma y largo; la pertenencia a la empresa activa la siguen
 * verificando las actions contra la base.
 */

const name = (label: string) =>
  z
    .string({ required_error: `${label} es obligatorio` })
    .trim()
    .min(1, `${label} es obligatorio`)
    .max(200, `${label} es demasiado largo`);

const uuid = z.string().uuid('Identificador inválido');
const uuidList = z.array(uuid).max(500, 'Demasiados elementos');

const nameAndActive = z.object({ name: name('El nombre'), is_active: z.boolean() });

export const nameActiveCreateSchema = nameAndActive;
export const nameActiveUpdateSchema = nameAndActive.extend({ id: uuid });

export const equipmentBrandCreateSchema = nameAndActive;
export const equipmentBrandUpdateSchema = nameAndActive.extend({ id: z.number().int().positive() });

export const equipmentModelCreateSchema = nameAndActive.extend({ brand: z.number().int().positive('Marca inválida') });
export const equipmentModelUpdateSchema = equipmentModelCreateSchema.extend({ id: z.number().int().positive() });

export const contractTypeCreateSchema = z.object({
  name: name('El nombre'),
  description: z.string().max(1000, 'La descripción es demasiado larga').nullable(),
});
export const contractTypeUpdateSchema = contractTypeCreateSchema.extend({ id: uuid, is_active: z.boolean() });

export const aptitudeCreateSchema = z.object({
  nombre: name('El nombre'),
  puestos: uuidList,
  is_active: z.boolean(),
});
export const aptitudeUpdateSchema = aptitudeCreateSchema.extend({ id: uuid });

export const positionCreateSchema = nameAndActive.extend({
  hierarchical_position_id: uuidList,
  aptitudes_tecnicas_id: uuidList,
});
export const positionUpdateSchema = positionCreateSchema.extend({ id: uuid });

export const diagramTypeCreateSchema = nameAndActive.extend({
  color: z.string().trim().min(1, 'El color es obligatorio').max(32, 'Color inválido'),
  short_description: z
    .string()
    .trim()
    .min(1, 'La descripción corta es obligatoria')
    .max(3, 'La descripción corta no debe tener más de 3 caracteres'),
  work_active: z.boolean(),
  computes_absenteeism: z.boolean(),
});
export const diagramTypeUpdateSchema = diagramTypeCreateSchema.extend({ id: uuid });

export const workDiagramCreateSchema = nameAndActive.extend({
  active_working_days: z.number().finite().min(0).max(366),
  inactive_working_days: z.number().finite().min(0).max(366),
  active_novelty: uuidList,
  inactive_novelty: z.union([uuid, z.literal('')]),
});
export const workDiagramUpdateSchema = workDiagramCreateSchema.extend({ id: uuid });

export const equipmentOwnerCreateSchema = nameAndActive.extend({
  cuit: z.string().trim().min(6, 'El CUIT debe tener al menos 6 caracteres').max(20, 'El CUIT es demasiado largo'),
  contract_types: z.array(z.enum(['Leasing', 'Alquiler', 'Prendado'])).min(1, 'Elegí al menos un tipo de contrato'),
});
export const equipmentOwnerUpdateSchema = equipmentOwnerCreateSchema.extend({ id: uuid });

export const reassignVehiclesSchema = z.object({ fromOwnerId: uuid, toOwnerId: uuid.nullable() });

export const equipmentSubTypeCreateSchema = nameAndActive.extend({
  type_id: uuid,
  compatible_item_keys: z.array(z.string().max(100)).max(500),
  checklist_ids: uuidList,
});
export const equipmentSubTypeUpdateSchema = equipmentSubTypeCreateSchema.extend({ id: uuid });

export const equipmentTypeCreateSchema = nameAndActive.extend({
  applies_to: z.enum(['vehicle', 'other_equipment']),
  is_operative: z.boolean(),
  is_tractor_unit: z.boolean(),
  has_hitch: z.boolean(),
  hitch_type_ids: uuidList,
  checklist_ids: uuidList,
});
export const equipmentTypeUpdateSchema = equipmentTypeCreateSchema.extend({ id: uuid });

/** Primer mensaje legible de un `safeParse` fallido. */
export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Datos inválidos';
}
