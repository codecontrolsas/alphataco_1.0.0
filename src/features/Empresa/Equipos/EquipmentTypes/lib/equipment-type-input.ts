import { z } from 'zod';
import { equipmentTypeUpdateSchema } from '../../../lib/catalog-input-schemas';

/**
 * Entrada de `updateEquipmentType`. Las relaciones M:M (enganches compatibles y checklists) viajan
 * como altas y bajas EXPLÍCITAS calculadas contra la base leída al abrir el formulario: la
 * ausencia de un id nunca implica borrado.
 */
const uuidList = z.array(z.string().uuid('Identificador inválido')).max(500, 'Demasiados elementos');
const relationDelta = z.object({ add: uuidList, remove: uuidList });

export const equipmentTypeUpdateInputSchema = equipmentTypeUpdateSchema
  .omit({ hitch_type_ids: true, checklist_ids: true })
  .extend({ hitches: relationDelta, checklists: relationDelta });

export type EquipmentTypeUpdateInput = z.infer<typeof equipmentTypeUpdateInputSchema>;
