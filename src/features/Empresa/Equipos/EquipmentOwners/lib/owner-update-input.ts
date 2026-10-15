import { z } from 'zod';
import { equipmentOwnerUpdateSchema, reassignVehiclesSchema } from '../../../lib/catalog-input-schemas';

/**
 * Entrada de la edición de un titular. Los tipos de contrato (M:M) viajan como altas y bajas
 * EXPLÍCITAS calculadas contra la base leída al abrir el formulario: la ausencia de un valor
 * nunca implica borrado.
 */
const contractType = z.enum(['Leasing', 'Alquiler', 'Prendado']);

export const equipmentOwnerUpdateInputSchema = equipmentOwnerUpdateSchema.omit({ contract_types: true }).extend({
  contract_types: z.object({ add: z.array(contractType).max(3), remove: z.array(contractType).max(3) }),
});

export type EquipmentOwnerUpdateInput = z.infer<typeof equipmentOwnerUpdateInputSchema>;

export const reassignAndDeactivateOwnerSchema = reassignVehiclesSchema.extend({
  data: equipmentOwnerUpdateInputSchema,
});
