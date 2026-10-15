import { z } from 'zod';

/**
 * Cambios pendientes del wizard de gestión de órdenes.
 *
 * Módulo SIN directiva: lo importan la server action (validación) y el wizard (tipos).
 * Los tipos de reparación viajan como ALTAS y BAJAS explícitas calculadas contra lo que el
 * cliente cargó del servidor: la ausencia de un id nunca significa borrado.
 */

const id = z.string().uuid('Identificador inválido');
const ids = z.array(id).max(500);
const description = z.string().trim().min(1, 'La descripción es obligatoria').max(2000);

export const repairTypeDeltaSchema = z.object({
  add: ids,
  remove: ids,
});
export type RepairTypeDelta = z.infer<typeof repairTypeDeltaSchema>;

export const orderChangeSetSchema = z.object({
  /** Ítems a eliminar (solo manuales, no los de solicitud). */
  deletes: ids,
  adds: z
    .array(z.object({ description, repairTypeIds: ids }))
    .max(200),
  sectorAssignments: z
    .array(z.object({ itemIds: ids, sectorId: id, sequenceOrder: z.number().int().min(0).max(10000) }))
    .max(200),
  /** Altas/bajas de tipos de reparación por ítem. */
  repairTypeUpdates: z.array(z.object({ itemId: id }).merge(repairTypeDeltaSchema)).max(500),
  sequenceUpdates: z.array(z.object({ itemId: id, sequenceOrder: z.number().int().min(0).max(10000) })).max(500),
  descriptionUpdates: z.array(z.object({ itemId: id, description })).max(500),
  chiefCommentUpdates: z.array(z.object({ itemId: id, comment: z.string().max(4000) })).max(500),
  workshopAssignments: z.array(z.object({ itemIds: ids, workshopId: id })).max(200),
  rejections: z.array(z.object({ itemId: id, reason: z.string().trim().min(1).max(2000) })).max(500).optional(),
  restorations: ids.optional(),
});
export type OrderChangeSet = z.infer<typeof orderChangeSetSchema>;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');

export const plannedDatesSchema = z
  .object({ plannedStartDate: day, plannedEndDate: day })
  .refine((dates) => dates.plannedEndDate >= dates.plannedStartDate, {
    message: 'La fecha de fin no puede ser anterior a la de inicio',
  });

export const wizardSectorAssignmentsSchema = z
  .array(z.object({ itemIds: z.array(z.string().max(80)).max(500), sectorId: id }))
  .max(200);

export const wizardSectorOrderSchema = z
  .array(z.object({ sectorId: id, sequenceOrder: z.number().int().min(0).max(10000) }))
  .max(200);

export const assignSectorInputSchema = z
  .array(z.object({ maintenanceOrderItemIds: ids, sectorId: id, sequenceOrder: z.number().int().min(0).max(10000) }))
  .max(200);

export const orderIdSchema = id;
