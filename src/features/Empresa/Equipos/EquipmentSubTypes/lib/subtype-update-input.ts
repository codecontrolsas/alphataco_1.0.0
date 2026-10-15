import { z } from 'zod';
import { equipmentSubTypeUpdateSchema } from '../../../lib/catalog-input-schemas';

/**
 * Entrada de `updateEquipmentSubType`. Items compatibles (claves `"<item_type>:<id>"`) y checklists
 * viajan como altas y bajas EXPLÍCITAS calculadas contra la base leída al abrir el formulario:
 * la ausencia de un id nunca implica borrado.
 */
const keyList = z.array(z.string().max(100)).max(500, 'Demasiados elementos');
const idList = z.array(z.string().uuid('Identificador inválido')).max(500, 'Demasiados elementos');

export const equipmentSubTypeUpdateInputSchema = equipmentSubTypeUpdateSchema
  .omit({ compatible_item_keys: true, checklist_ids: true })
  .extend({
    compatibleItems: z.object({ add: keyList, remove: keyList }),
    checklists: z.object({ add: idList, remove: idList }),
  });

export type EquipmentSubTypeUpdateInput = z.infer<typeof equipmentSubTypeUpdateInputSchema>;
