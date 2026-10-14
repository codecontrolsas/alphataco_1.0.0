import { z } from 'zod';

/**
 * Schemas de Tipos de Reparación y Grupos.
 * Módulo SIN directiva: lo comparten las server actions (validación) y los formularios (tipos).
 */

const id = z.string().uuid('Identificador inválido');

export const MAINTENANCE_KINDS = ['Correctivo', 'Preventivo', 'Otro'] as const;
export const CRITICITY_LEVELS = ['Alta', 'Media', 'Baja'] as const;

export const typeOfRepairInputSchema = z.object({
  name: z.string().trim().min(1, 'Debe ingresar un nombre').max(200),
  description: z.string().trim().min(3, 'Intenta explicar con un poco más de detalle').max(2000),
  criticity: z.enum(CRITICITY_LEVELS).nullable().optional(),
  is_active: z.boolean().optional(),
  type_of_maintenance: z.enum(MAINTENANCE_KINDS).nullable().optional(),
  multi_equipment: z.boolean().optional(),
  qr_close: z.boolean().optional(),
  autorizable: z.boolean().optional(),
});
export type TypeOfRepairInput = z.infer<typeof typeOfRepairInputSchema>;

export const typeOfRepairUpdateSchema = typeOfRepairInputSchema.partial();

/** Altas y bajas explícitas de una relación M:M: la ausencia de un id nunca significa borrado. */
export const idDeltaSchema = z.object({
  add: z.array(id).max(500),
  remove: z.array(id).max(500),
});
export type IdDelta = z.infer<typeof idDeltaSchema>;

export const maintenanceGroupInputSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es requerido').max(200),
  description: z.string().max(2000).nullable().optional(),
  is_active: z.boolean().optional(),
});
export type MaintenanceGroupInput = z.infer<typeof maintenanceGroupInputSchema>;

export const uuidSchema = id;
export const uuidListSchema = z.array(id).max(500);

/** Formulario de Tipos de Reparación: criticidad y tipo de mantenimiento son obligatorios al cargar. */
export const repairTypeFormSchema = typeOfRepairInputSchema.extend({
  criticity: z.enum(CRITICITY_LEVELS, { required_error: 'La criticidad es requerida' }),
  type_of_maintenance: z.enum(MAINTENANCE_KINDS, { required_error: 'El tipo de mantenimiento es requerido' }),
  autorizable: z.boolean(),
});
export type RepairTypeFormValues = z.infer<typeof repairTypeFormSchema>;

/** Formulario de Grupos: la selección de tipos es parte del formulario, las altas/bajas se calculan al guardar. */
export const maintenanceGroupFormSchema = maintenanceGroupInputSchema.extend({
  is_active: z.boolean(),
  type_ids: z.array(z.string()),
});
export type MaintenanceGroupFormValues = z.infer<typeof maintenanceGroupFormSchema>;
